var sinon = require('sinon');
var langutil = require('common/langutil');
var messagemgr = require('messaging/messagemgr');
var tcptran = require('messaging/tcptran');
var udptran = require('messaging/udptran');
var testCase = require('nodeunit').testCase;

module.exports = {		
	"starting transportts" : testCase({
		setUp : function(done) {
			this.receivedDataCallback = sinon.stub();
			this.readyCallback = sinon.stub();
						
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"start tcp transport on start" : function(test) {
			this.tcpstart = sinon.collection.stub(tcptran, 'start');
			this.udpstart = sinon.collection.stub(udptran, 'start');
			
			messagemgr.start(1111, '1.1.1.1', this.receivedDataCallback, this.readyCallback);
			
			test.strictEqual(this.tcpstart.args[0][0], 1111);
			test.strictEqual(this.tcpstart.args[0][1], '1.1.1.1');
			test.strictEqual(this.tcpstart.args[0][2], this.receivedDataCallback);
			test.strictEqual(typeof(this.tcpstart.args[0][3]), 'function');
			test.done();
		},
		
		"start udp transport on start" : function(test) {
			this.tcpstart = sinon.collection.stub(tcptran, 'start');
			this.udpstart = sinon.collection.stub(udptran, 'start');
			
			messagemgr.start(1111, '1.1.1.1', this.receivedDataCallback, this.readyCallback);
			
			test.strictEqual(this.udpstart.args[0][0], 1111);
			test.strictEqual(this.udpstart.args[0][1], '1.1.1.1');
			test.strictEqual(this.udpstart.args[0][2], this.receivedDataCallback);
			test.strictEqual(typeof(this.udpstart.args[0][3]), 'function');
			test.done();
		},
		
		"do not delegate ready event if only tcp ready but not udp" : function(test) {
			this.tcpstart = sinon.collection.stub(tcptran, 'start', function(port, addr, dataCbk, readyCbk) {
				readyCbk();
			});
			this.udpstart = sinon.collection.stub(udptran, 'start');
			
			messagemgr.start(1111, '1.1.1.1', this.receivedDataCallback, this.readyCallback);
			
			test.ok(!this.readyCallback.called);
			test.done();
		},
		
		"do not delegate ready event if only udp ready but not tcp" : function(test) {
			this.tcpstart = sinon.collection.stub(tcptran, 'start');
			this.udpstart = sinon.collection.stub(udptran, 'start', function(port, addr, dataCbk, readyCbk) {
				readyCbk();
			});
			
			messagemgr.start(1111, '1.1.1.1', this.receivedDataCallback, this.readyCallback);
			
			test.ok(!this.readyCallback.called);
			test.done();
		},
		
		"delegate ready event when both udp and tcp ready" : function(test) {
			this.tcpstart = sinon.collection.stub(tcptran, 'start', function(port, addr, dataCbk, readyCbk) {
				readyCbk();
			});
			this.udpstart = sinon.collection.stub(udptran, 'start', function(port, addr, dataCbk, readyCbk) {
				readyCbk();
			});
			
			messagemgr.start(1111, '1.1.1.1', this.receivedDataCallback, this.readyCallback);
			
			test.ok(this.readyCallback.called);
			test.done();
		}
	}),
	
	"stopping transportts" : testCase({
		setUp : function(done) {
			this.tcpstop = sinon.collection.stub(tcptran, 'stop');
			this.udpstop = sinon.collection.stub(udptran, 'stop');
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"stop tcp transport on stop" : function(test) {
			messagemgr.stop();
			
			test.ok(this.tcpstop.called);
			test.done();
		},
		
		"stop udp transport on stop" : function(test) {
			messagemgr.stop();
			
			test.ok(this.udpstop.called);
			test.done();
		}
	}),
	
	"sending messages through given channels" : testCase({
		setUp : function(done) {
			this.tcpsend = sinon.collection.stub(tcptran, 'send');
			this.udpsend = sinon.collection.stub(udptran, 'send');
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"send via udp if data size below datagram size threshold" : function(test) {
			messagemgr.send(1111, '1.1.1.1', "{'myopt' : 123}");
			
			test.ok(this.udpsend.calledWith(1111, '1.1.1.1', "{'myopt' : 123}"));
			test.done();
		},
		
		"send via tcp if data size above datagram size threshold" : function(test) {
			var hundred = 'ABCDEFGHIJKLMNOPQRSTUVWXYABCDEFGHIJKLMNOPQRSTUVWXYABCDEFGHIJKLMNOPQRSTUVWXYABCDEFGHIJKLMNOPQRSTUVWXY\n';
			var bigData = '';
			for (var i = 0; i < 20; i++ && (bigData = bigData.concat(hundred)));
			
			messagemgr.send(1111, '1.1.1.1', bigData);
			
			test.ok(this.tcpsend.calledWith(1111, '1.1.1.1', bigData));
			test.done();
		}
	})
}