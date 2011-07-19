var sinon = require('sinon');
var assert = require('assert');
var events = require('events');
var net = require('net');
var langutil = require('common/langutil');
var tcptran = require('messaging/tcptran');
var testCase = require('nodeunit').testCase;
var mockutil = require('testability/mockutil');

module.exports = {		
	"starting a listener" : testCase({
		setUp : function(done) {
			this.processOn = sinon.collection.stub(process, 'on');
			
			this.tcptran = new tcptran.TcpTran(1234, "127.0.0.1");
			this.rawmsg = '{"uri" : "p2p:myapp/myresource", "key" : "val"}';

			this.server = langutil.extend(new events.EventEmitter(), {listen : function() {}, close : function() {}, address : function() { return {address : 'addr', port : 1234} }});
			sinon.collection.stub(this.server, 'listen', function(port, addr, cbk) {
				if (cbk) cbk();
			});

			this.socket = langutil.extend(new events.EventEmitter(), {remoteAddress : '6.6.6.6'});
						
			sinon.collection.stub(net, 'createServer').returns(this.server);
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},

		"should set up exit hook on start" : function(test) {
			test.ok(this.processOn.calledWith('exit', this.tcptran.stop));
			test.done();
		},
	
		"should start to listen normally" : function(test) {
			var on = sinon.collection.stub(this.server, 'on');
			
			this.tcptran.start();
	
			test.ok(on.calledWith('error'));
			test.ok(on.calledWith('connection'));
			test.ok(on.calledWith('close'));
			test.ok(this.server.listen.called);
			test.done();
		},
		
		"should call ready callback when starting to listen normally" : function(test) {
			var cbk = sinon.stub();
			
			this.tcptran.start(undefined, cbk);
			this.server.emit('listening');
	
			test.ok(cbk.called);
			test.done();
		},
		
		"should try again if address in use" : function(test) {
			this.tcptran.addrInUseRetryMsec = 100;
			var failTimeoutId = undefined;
			var listenCallCount = 0;			
			this.server.listen = function(port, addr) {
				listenCallCount++;
				test.equal('127.0.0.1', addr);
				test.equal(1234, port);
				if (listenCallCount >= 2) {
					test.done();
					if (failTimeoutId) clearTimeout(failTimeoutId);
				}
			};
			
			this.tcptran.start();
			this.server.emit("error", { code : 'EADDRINUSE' });
			
			failTimeoutId = setTimeout(function() {
				test.fail() ;test.done(); }, 500);
		},
		
		"should handle close event on socket of a received connection" : function(test) {
			this.tcptran.start();
			this.server.emit('connection', this.socket);
			
			this.socket.emit('close');
			
			// TODO: for now we just log on socket close, add assertions when we do more
			test.done();
		}
	}),
	
	"message sending" : testCase({
		setUp : function(done) {
			this.tcptran = new tcptran.TcpTran();
			this.rawmsg = '{"key" : "val"}';
			this.client = langutil.extend(new events.EventEmitter(), { write : function() {}, end : function() {}, setEncoding : function() {} } );
			
			net.createConnection = function () {};
			sinon.collection.stub(net, 'createConnection').returns(this.client);
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"should establish connection and send" : function(test) {
			var setEncoding = sinon.collection.stub(this.client, 'setEncoding');
			var write = sinon.collection.stub(this.client, 'write', function(data, enc, cbk) {
				cbk();
			});
			var end = sinon.collection.stub(this.client, 'end');
			
			this.tcptran.send(2222, "1.1.1.1", this.rawmsg);
			this.client.emit('connect');
	
			test.ok(setEncoding.calledWith('UTF-8'));
			test.ok(write.calledWith(this.rawmsg, 'UTF8'));
//			test.ok(end.called);
			test.done();
		},
	
		"should handle close on connection used to send data" : function(test) {
			this.tcptran.send(2222, "1.1.1.1", this.rawmsg);
			this.client.emit('close');
	
			// for now we don't do anything
			test.done();
		},
		
		"should handle received data on connection used to send data" : function(test) {
			this.tcptran.send(2222, "1.1.1.1", this.rawmsg);
			this.client.emit('data', 'moo');
	
			// for now we just log
			test.done();
		}
	}),

	"message receiving" : testCase ({
		setUp : function(done) {
			this.tcptran = new tcptran.TcpTran('1111', '1.1.1.1');
			this.socket = langutil.extend(new events.EventEmitter(), {end : function() {}});
			this.existingParsed = { existing : 'parsed'};
			this.socketEnd = sinon.stub(this.socket, 'end');
			this.socket.existingParsed = this.existingParsed;
			this.socket.remoteAddress = '2.2.2.2';		
			
			this.callback = sinon.stub();
			this.server = langutil.extend(new events.EventEmitter(), {listen : function() {}});
			sinon.collection.stub(this.server, 'listen');
			sinon.collection.stub(net, 'createServer').returns(this.server);
			
			this.tcptran._initSocket(this.socket);
			
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"should delegate to callback to parse message" : function(test) {
			this.tcptran.start(this.callback);
			
			this.socket.emit('data', 'some_data');
			
			test.deepEqual(this.callback.args[0], [new String('some_data'), '2.2.2.2', this.existingParsed]);
			test.done();
		},
		
		"should close socket on parsing if fully parsed" : function(test) {
			this.tcptran.start(this.callback);
			
			this.socket.emit('data', 'some_data');
			
			test.ok(this.socketEnd.called);
			test.done();
		},
		
		"should absorb exception from parsing" : function(test) {
			this.callback = sinon.stub().throws(new Error());
			this.tcptran.start(this.callback);
			
			this.socket.emit('data', 'some_data');
			
			test.ok(this.socketEnd.called);
			test.done();
		},
		
		"should store partial parse state in socket" : function(test) {
			this.callback = sinon.stub().returns({ partial : 'state' });
			this.tcptran.start(this.callback);
			
			this.socket.emit('data', 'some_data');
			
			test.deepEqual(this.callback.args[0], [new String('some_data'), '2.2.2.2', this.existingParsed]);
			test.deepEqual({partial : 'state'}, this.socket.existingParsed);
			test.ok(!this.socketEnd.called);
			test.done();
		}
	}),
	
	"stopping the listener" : testCase ({
		setUp : function(done) {
			this.tcptran = new tcptran.TcpTran();
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"should stop listening" : function(test) {
			// setup
			this.tcptran.server = {close : function() {}};
			var close = sinon.collection.stub(this.tcptran.server, "close");
	
			// act
			this.tcptran.stop();
	
			// assert
			test.ok(close.called);
			test.done();
		}
	})
};
