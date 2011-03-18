var sinon = require('sinon');
var heartbeater = require('core/heartbeater');
var leafset = require('core/leafset');
var routingmgr = require('core/routingmgr');
var node = require('core/node');
var testCase = require('nodeunit').testCase;

module.exports = {
	"startup" : testCase({
		setUp : function(done) {
			this.overlayCallback = { on : function() {} };
			this.on = sinon.collection.stub(this.overlayCallback, 'on');
			
			routingmgr.routingTable = {};
			
			done();
		},
		
		tearDown : function(done) {
			heartbeater.stop();
			leafset.reset();
			sinon.collection.restore();
			done();
		},
		
		"should set up received message listening when starting heartbeater" : function(test) {			
			heartbeater.start(this.overlayCallback);
			
			test.ok(this.on.calledWith('graviti-message-received', heartbeater._handleReceivedGravitiMessage));
			test.done();
		}
	}),

	"stopping" : testCase({
		setUp : function(done) {
			node.nodeId = '9876543210987654321098765432109876543210';
			
			this.overlayCallback = { sendToAddr : function() {}, on : function() {} };
			this.sendToAddr = sinon.collection.stub(this.overlayCallback, 'sendToAddr');
			
			done();
		},
		
		tearDown : function(done) {
			leafset.reset();
			sinon.collection.restore();
			done();
		},
		
		"should not invoke message sender after stopping" : function(test) {
			var _this = this;
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			heartbeater.heartbeatIntervalMsec = 50;
			heartbeater.heartbeatCheckIntervalMsec = 50;
			heartbeater.start(this.overlayCallback);
			
			heartbeater.stop();
			
			setTimeout(function() {
				test.ok(_this.sendToAddr.callCount < 2);
				test.done();
			}, 300);
		},
		
		"should send parting messages to leafset peers on stopping" : function(test) {
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			heartbeater.start(this.overlayCallback);
			
			heartbeater.stop();
			
			test.ok(this.sendToAddr.calledWith('p2p:graviti/peers/9876543210987654321098765432109876543210', undefined, {method : 'DELETE'}, '127.0.0.1', '8888'));
			test.ok(this.sendToAddr.calledWith('p2p:graviti/peers/9876543210987654321098765432109876543210', undefined, {method : 'DELETE'}, '127.0.0.1', '9999'));
			test.done();
		},
		
		"should not send parting messages to leafset peers on stopping if notify peers flag disabled" : function(test) {
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			heartbeater.start(this.overlayCallback);
			
			heartbeater.stop(false);
			
			test.ok(!this.sendToAddr.called);
			test.done();
		}
	}),

	"sending heartbeat messages" : testCase({
		setUp : function(done) {
			this.overlayCallback = { on : function() {}, sendToAddr : function() {} };
			this.sendToAddr = sinon.collection.stub(this.overlayCallback, 'sendToAddr');
			
			routingmgr.routingTable = {};
			
			done();
		},
		
		tearDown : function(done) {
			heartbeater.stop();
			leafset.reset();
			sinon.collection.restore();
			done();
		},
		
		"should send heartbeat to leafset nodes shortly after startup" : function(test) {
			var _this = this;
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			heartbeater.heartbeatIntervalMsec = 50;
			heartbeater.heartbeatCheckIntervalMsec = 50;
			
			heartbeater.start(this.overlayCallback);
			
			setTimeout(function() {
				test.strictEqual(_this.sendToAddr.args[0][0], 'p2p:graviti/heartbeat');
				test.deepEqual(_this.sendToAddr.args[0][1], {
						leafset : leafset.compressedLeafset(),
						routing_table : routingmgr.routingTable,
						rsvp : true
					});
				test.deepEqual(_this.sendToAddr.args[0][2], {method : 'POST'});
				test.strictEqual(_this.sendToAddr.args[0][3], '127.0.0.1');
				test.strictEqual(_this.sendToAddr.args[0][4], '8888');
				
				test.strictEqual(_this.sendToAddr.args[1][0], 'p2p:graviti/heartbeat');
				test.deepEqual(_this.sendToAddr.args[1][1], {
						leafset : leafset.compressedLeafset(),
						routing_table : routingmgr.routingTable,
						rsvp : true
					});
				test.deepEqual(_this.sendToAddr.args[1][2], {method : 'POST'});
				test.strictEqual(_this.sendToAddr.args[1][3], '127.0.0.1');
				test.strictEqual(_this.sendToAddr.args[1][4], '9999');
				test.done();
			}, 200);
		},
		
		"should update last heartbeat sent time after sending" : function(test) {
			var _this = this;
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			
			heartbeater.heartbeatIntervalMsec = 1000;
			heartbeater.heartbeatCheckIntervalMsec = 50;
			
			heartbeater.start(this.overlayCallback);
			
			setTimeout(function() {
				test.ok(leafset._leafset['ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123'].lastHeartbeatSent > (new Date().getTime() - 1000));
				test.ok(leafset._leafset['1234567890123456789012345678901234567890'].lastHeartbeatSent > (new Date().getTime() - 1000));
				test.ok(_this.sendToAddr.calledTwice);
				test.done();
			}, 200);
		},
		
		"should not send heartbeats when interval since last heartbeat not reached" : function(test) {
			var _this = this;
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			leafset._leafset['ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123'].lastHeartbeatSent = new Date().getTime();
			leafset._leafset['1234567890123456789012345678901234567890'].lastHeartbeatSent = new Date().getTime();
			
			heartbeater.heartbeatIntervalMsec = 1000;
			heartbeater.heartbeatCheckIntervalMsec = 50;
			
			heartbeater.start(this.overlayCallback);
			
			setTimeout(function() {
				test.ok(!_this.sendToAddr.called);
				test.done();
			}, 200);
		},
		
		"should send heartbeat to candidateset peers and update last sent time" : function(test) {
			var _this = this;
			leafset.updateWithProvisional('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset.updateWithProvisional('1234567890123456789012345678901234567890','127.0.0.1:9999');
			heartbeater.heartbeatIntervalMsec = 50;
			heartbeater.heartbeatCheckIntervalMsec = 50;
			
			heartbeater.start(this.overlayCallback);
			
			test.equal(2, Object.keys(leafset._candidateset).length);
			setTimeout(function() {
				test.strictEqual(_this.sendToAddr.args[0][0], 'p2p:graviti/heartbeat');
				test.deepEqual(_this.sendToAddr.args[0][1], {
					leafset : leafset.compressedLeafset(),
					routing_table : routingmgr.routingTable,
					rsvp : true
				});
				test.deepEqual(_this.sendToAddr.args[0][2], {method : 'POST'});
				test.strictEqual(_this.sendToAddr.args[0][3], '127.0.0.1');
				test.strictEqual(_this.sendToAddr.args[0][4], '8888');
				
				test.strictEqual(_this.sendToAddr.args[1][0], 'p2p:graviti/heartbeat');
				test.deepEqual(_this.sendToAddr.args[1][1], {
						leafset : leafset.compressedLeafset(),
						routing_table : routingmgr.routingTable,
						rsvp : true
					});
				test.deepEqual(_this.sendToAddr.args[1][2], {method : 'POST'});
				test.strictEqual(_this.sendToAddr.args[1][3], '127.0.0.1');
				test.strictEqual(_this.sendToAddr.args[1][4], '9999');
				
				test.ok(leafset._candidateset['ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123'].lastHeartbeatSent > (new Date().getTime() - 1000));
				test.ok(leafset._candidateset['1234567890123456789012345678901234567890'].lastHeartbeatSent > (new Date().getTime() - 1000));
				test.done();
			}, 200);
		},
	}),
	
	"detecting timed out peers" : testCase({
		setUp : function(done) {
			this.overlayCallback = {on : function() {}};			
			heartbeater.heartbeatCheckIntervalMsec = 5000;
			done();
		},
		
		tearDown : function(done) {
			heartbeater.stop();
			leafset.reset();
			sinon.collection.restore();
			done();
		},
		
		"should detect timed out peer in leafset and purge" : function(test) {
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			leafset._leafset['ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123'].lastHeartbeatReceived = (new Date().getTime() - 1000000);
			leafset._leafset['1234567890123456789012345678901234567890'].lastHeartbeatReceived = (new Date().getTime() - 1000000);			
			heartbeater.timedOutPeerCheckIntervalMsec = 50;
			
			heartbeater.start(this.overlayCallback);
			
			setTimeout(function() {
				test.ok(leafset._leafset['ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123'] === undefined);
				test.ok(leafset._leafset['1234567890123456789012345678901234567890'] === undefined);
				test.done();
			}, 200);
		},
		
		"should remove timed out dead peers regularly" : function(test) {
			var clear = sinon.collection.stub(leafset, 'clearExpiredDeadAndCandidatePeers');			
			heartbeater.timedOutPeerCheckIntervalMsec = 50;
			
			heartbeater.start(this.overlayCallback);
			
			setTimeout(function() {
				test.ok(clear.called);
				test.done();
			}, 200);
		}
	}),
	
	"handling received heartbeats" : testCase({
		setUp : function(done) {
			this.msg = {
				uri : 'p2p:graviti/heartbeat',
				method : 'POST',
				source_id : 'ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123',
				content : {
					leafset : {a:'b'},
					routing_table : {c : 'd'}
				}
			};
			this.msginfo = {
					sender_addr : '127.0.0.1',
					sender_port : 1234
			};
		
			this.updateWithProvisional = sinon.collection.stub(leafset, 'updateWithProvisional');
			this.updateWithKnownGood = sinon.collection.stub(leafset, 'updateWithKnownGood');
			this.mergeRoutingTable = sinon.collection.stub(routingmgr, 'mergeRoutingTable');
			this.overlayCallback = { sendToAddr : function() {}, on : function() {} };
			this.sendToAddr = sinon.collection.stub(this.overlayCallback, 'sendToAddr');
			
			heartbeater.start(this.overlayCallback);			
			done();
		},
		
		tearDown : function(done) {
			leafset.reset();
			sinon.collection.restore();
			done();
		},

		"update leafset and routing table on receipt of heartbeat" : function(test) {
			heartbeater._handleReceivedGravitiMessage(this.msg, this.msginfo);
			
			test.ok(this.updateWithProvisional.calledWith({a:'b'}));
			test.ok(this.updateWithKnownGood.calledWith('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123', '127.0.0.1:1234'));
			test.ok(this.mergeRoutingTable.calledWith({c:'d'}));
			test.done();
		},
		
		"respond to received heartbeat immediately for unknown peer if requested" : function(test) {
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			this.msg.content.rsvp = true;
			this.msg.source_id = '0000000000000000000000000000000000000000';
			
			heartbeater._handleReceivedGravitiMessage(this.msg, this.msginfo);
			
			test.ok(this.sendToAddr.calledOnce);
			test.strictEqual(this.sendToAddr.args[0][0], 'p2p:graviti/heartbeat');
			test.deepEqual(this.sendToAddr.args[0][1], {
					leafset : leafset.compressedLeafset(),
					routing_table : routingmgr.routingTable
				});
			test.deepEqual(this.sendToAddr.args[0][2], {method : 'POST'});
			test.strictEqual(this.sendToAddr.args[0][3], '127.0.0.1');
			test.strictEqual(this.sendToAddr.args[0][4], 1234);
				
			test.done();
		},
		
		"respond to received heartbeat immediately for unknown peer if requested" : function(test) {
			leafset._put('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123','127.0.0.1:8888');
			leafset._put('1234567890123456789012345678901234567890','127.0.0.1:9999');
			this.msg.content.rsvp = true;
			this.msg.source_id = 'ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123';
			
			heartbeater._handleReceivedGravitiMessage(this.msg, this.msginfo);
			
			test.ok(this.sendToAddr.calledOnce);
			test.strictEqual(this.sendToAddr.args[0][0], 'p2p:graviti/heartbeat');
			test.deepEqual(this.sendToAddr.args[0][1], {
					leafset : leafset.compressedLeafset(),
					routing_table : routingmgr.routingTable
				});
			test.deepEqual(this.sendToAddr.args[0][2], {method : 'POST'});
			test.strictEqual(this.sendToAddr.args[0][3], '127.0.0.1');
			test.strictEqual(this.sendToAddr.args[0][4], 1234);
			test.ok(leafset._leafset['ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123'].lastHeartbeatSent === undefined);
			test.done();
		},
	}),
	
	"handling departing peer messages" : testCase({
		setUp : function(done) {
			this.msg = {
				uri : 'p2p:graviti/peers/ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123',
				method : 'DELETE'
			}
			this.msginfo = {
				sender_addr : '127.0.0.1',
				sender_port : 1234
			};
			
			done();
		},
		
		tearDown : function(done) {
			leafset.reset();
			sinon.collection.restore();
			done();
		},

		"update leafset and routing table on receipt of peer departure" : function(test) {
			var removePeer = sinon.collection.stub(leafset, "removePeer");
			
			heartbeater._handleReceivedGravitiMessage(this.msg, this.msginfo);
			
			test.ok(removePeer.calledWith('ABCDEF0123ABCDEF0123ABCDEF0123ABCDEF0123'));
			test.done();
		}
	})
};