var sinon = require('sinon');
var assert = require('assert');
var events = require('events');
var net = require('net');
var langutil = require('../../lib/common/langutil');
var connmgr = require('../../lib/core/connmgr');
var testCase = require('nodeunit').testCase;

module.exports = {		
	"starting a listener" : testCase({
		setUp : function(done) {
			this.rawmsg = '{"uri" : "p2p:myapp/myresource", "key" : "val"}';
			
			this.server = langutil.extend(new events.EventEmitter(), {listen : function() {}, close : function() {}});
			sinon.collection.stub(this.server, 'listen');

			this.socket = langutil.extend(new events.EventEmitter(), {remoteAddress : '6.6.6.6'});
						
			sinon.collection.stub(net, 'createServer').returns(this.server);
			
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
	
		"should start to listen normally" : function(test) {
			var on = sinon.collection.stub(this.server, 'on');
			
			connmgr.listen(1234, "127.0.0.1");
	
			test.ok(on.calledWith('error'));
			test.ok(on.calledWith('connection'));
			test.ok(on.calledWith('close'));
			test.ok(this.server.listen.called);
			test.done();
		},
		
		"should try again if address in use" : function(test) {
			connmgr.addrInUseRetryMsec = 100;
			var listenCallCount = 0;			
			this.server.listen = function(port, addr) {
				listenCallCount++;
				test.equal('127.0.0.1', addr);
				test.equal(1234, port);
				if (listenCallCount >= 2)
					test.done();
			}
			
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit("error", { code : 'EADDRINUSE' });
			
			setTimeout(function() {
				test.fail() ;test.done(); }, 500);
		},
		
		"should emit close event on server close" : function(test) {
			var closeEmitted = false;
			connmgr.on('close', function() {
				closeEmitted = true;
			});
			
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit('close');
			
			test.ok(closeEmitted);
			test.done();
		},
		
		"should handle close event on socket of a received connection" : function(test) {
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit('connection', this.socket);
			
			this.socket.emit('close');
			
			// TODO: for now we just log on socket close, add assertions when we do more
			test.done();
		},
		
		"should handle unparseable message through socket" : function(test) {
			connmgr.on('message', function() {test.fail('unexpected message');});			
			
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit('connection', this.socket);			
			this.socket.emit('data', 'badmsg');
			
			test.done();
		},

		"should throw if no uri in message" : function(test) {
			var _this = this;
			connmgr.on('message', function() {test.fail('unexpected message');});
			
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit('connection', this.socket);
			
			assert.throws(function() {
				_this.socket.emit('data', '{"key" : "val"}');
			}, /no uri/i);
			test.done();
		},
		
		"should throw if hop count over 100" : function(test) {
			// setup
			var _this = this;
			connmgr.on('message', function() {test.fail('unexpected message');});
			
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit('connection', this.socket);
			
			assert.throws(function() {
				_this.socket.emit('data', '{"uri" : "p2p:graviti/something", "hops" : 101}');
			}, /too many hops/i);			
			test.done();
		},
		
		"should throw if no source port in message" : function(test) {
			// setup
			var _this = this;
			connmgr.on('message', function() {test.fail('unexpected message');});
			
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit('connection', this.socket);
			
			assert.throws(function() {
				_this.socket.emit('data', '{"uri" : "p2p:graviti/something"}');
			}, /source port/i);
			test.done();
		},

		"should handle parseable message callback" : function(test) {
			// setup
			var rcvdmsg = undefined;
			var rcvdmsginfo = undefined;
			connmgr.on("message", function(msg, msginfo) {
				console.log('baa');
				rcvdmsg = msg;
				rcvdmsginfo = msginfo
			});
	
			// act
			connmgr.listen(1234, "127.0.0.1");
			this.server.emit('connection', this.socket);
			this.socket.emit('data', '{"uri" : "p2p:myapp/something", "source_port" : 1111, "key" : "val"}');
			
			// assert
			test.strictEqual('val', rcvdmsg.key);
			test.strictEqual('6.6.6.6', rcvdmsginfo.sender_addr);
			test.strictEqual(1111, rcvdmsginfo.sender_port);
			test.strictEqual('myapp', rcvdmsginfo.app_name);
			test.done();
		}
	}),
	"message sending" : testCase({
		setUp : function(done) {
			this.rawmsg = '{"key" : "val"}';
			this.client = langutil.extend(new events.EventEmitter(), { write : function() {}, setEncoding : function() {} } );
			
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
			var write = sinon.collection.stub(this.client, 'write');
			
			connmgr.send(2222, "1.1.1.1", this.rawmsg);
			this.client.emit('connect');
	
			test.ok(setEncoding.calledWith('UTF-8'));
			test.ok(write.calledWith(this.rawmsg));
			test.done();
		},
	
		"should handle close on connection used to send data" : function(test) {
			connmgr.send(2222, "1.1.1.1", this.rawmsg);
			this.client.emit('close');
	
			// for now we just log
			test.done();
		},
		
		"should handle received data on connection used to send data" : function(test) {
			connmgr.send(2222, "1.1.1.1", this.rawmsg);
			this.client.emit('data', 'moo');
	
			// for now we just log
			test.done();
		}
	}),
	
	"stopping the listener" : testCase ({		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"should stop listening" : function(test) {
			// setup
			connmgr.server = {close : function() {}};
			var close = sinon.collection.stub(connmgr.server, "close");
	
			// act
			connmgr.stopListening();
	
			// assert
			test.ok(close.called);
			test.done();
		}
	})
};