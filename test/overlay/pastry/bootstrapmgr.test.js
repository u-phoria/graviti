var sinon = require('sinon');
var bootstrapmgr = require('overlay/pastry/bootstrapmgr');
var messagemgr = require('messaging/messagemgr');
var langutil = require('common/langutil');
var node = require('core/node');
var leafset = require('overlay/pastry/leafset');
var routingtable = require('overlay/routingtable');
var testCase = require('nodeunit').testCase;
var heartbeater = require('overlay/pastry/heartbeater');
var pnsrunner = require('overlay/pastry/pnsrunner');
var mockutil = require('testability/mockutil');

module.exports = {
	"bootstrap manager startup" : testCase({
		setUp : function(done) {
			node.nodeId = '1234567890123456789012345678901234567890';
			this.overlayCallback = { on : function() {}, sendToAddr : function() {} };
			this.on = sinon.collection.stub(this.overlayCallback, 'on');
			this.pnsrunner = { run : function() {} };
			this.bootstrapmgr = new bootstrapmgr.BootstrapMgr(this.overlayCallback, this.pnsrunner);
			done();
		},
		
		tearDown : function(done) {
			bootstrapmgr.usePns = true;
			bootstrapmgr.pendingRequestCheckIntervalMsec = 1000;
			bootstrapmgr.bootstrapRetryIntervalMsec = 30000;
			sinon.collection.restore();
			routingtable._table = {};
			routingtable._candidatePeers = {};
			done();
		},
		
		"should start bootstrap manager for node starting a new ring" : function(test) {			
			this.bootstrapmgr.start();
			
			test.ok(this.on.calledWith('graviti-message-received'));
			test.ok(this.on.calledWith('graviti-message-forwarding'));
			test.done();
		},
		
		"bootstrap manager for node joining a ring should initiate sending of bootstrap requests without PNS when PNS off" : function(test) {
			var sendToAddr = sinon.collection.stub(this.overlayCallback, 'sendToAddr');
			bootstrapmgr.pendingRequestCheckIntervalMsec = 50;
			bootstrapmgr.usePns = false;
			
			this.bootstrapmgr.start('1.2.3.4:1234,5.6.7.8:5678,myhost:8888');
			
			test.ok(this.on.calledWith('graviti-message-received'));
			test.ok(this.on.calledWith('graviti-message-forwarding'));
			setTimeout(function() {
				test.ok(sendToAddr.calledWith('p2p:graviti/peers', {joining_node_id : node.nodeId}, {method : 'GET'}, '1.2.3.4', '1234'));
				test.ok(sendToAddr.calledWith('p2p:graviti/peers', {joining_node_id : node.nodeId}, {method : 'GET'}, '5.6.7.8', '5678'));
				test.ok(sendToAddr.calledWith('p2p:graviti/peers', {joining_node_id : node.nodeId}, {method : 'GET'}, 'myhost', '8888'));
				test.done();
			}, 200);
		},
		
		"bootstrap manager for node joining a ring should initiate sending of bootstrap requests with PNS when PNS on" : function(test) {
			var sendToAddr = sinon.collection.stub(this.overlayCallback, 'sendToAddr');
			bootstrapmgr.pendingRequestCheckIntervalMsec = 50;
			sinon.collection.stub(this.pnsrunner, 'run', function(endpoint, success) {
				success('6.6.6.6:6666');
			});
			
			this.bootstrapmgr.start('1.2.3.4:1234,5.6.7.8:5678,myhost:8888');
			
			test.ok(this.on.calledWith('graviti-message-received'));
			test.ok(this.on.calledWith('graviti-message-forwarding'));
			setTimeout(function() {
				test.equal(3, sendToAddr.callCount);
				test.ok(sendToAddr.calledWith('p2p:graviti/peers', {joining_node_id : node.nodeId}, {method : 'GET'}, '6.6.6.6', '6666'));
				test.done();
			}, 200);
		},
		
		"bootstrap manager for node joining a ring should be able to re-send unacknowledged bootstrap requests" : function(test) {
			bootstrapmgr.pendingRequestCheckIntervalMsec = 50;
			bootstrapmgr.bootstrapRetryIntervalMsec = 50;
			bootstrapmgr.usePns = false;
			var callCount = 0;
			var sendToAddr = sinon.stub(this.overlayCallback, 'sendToAddr', function() {
				callCount++;
			});
			
			this.bootstrapmgr.start('1.2.3.4:1234,5.6.7.8:5678,myhost:8888');
			
			setTimeout(function() {
				test.ok(callCount >= 6);
				test.done();
			}, 200);
		}
	}),

	"bootstrap manager shutdown" : testCase({
		setUp : function(done) {
			this.pnsrunner = { cancelAll : function() {}};
			this.cancelAll = sinon.collection.stub(this.pnsrunner, 'cancelAll');
			this.bootstrapmgr = new bootstrapmgr.BootstrapMgr(undefined, this.pnsrunner);
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"should stop pns on stop" : function(test) {
			this.bootstrapmgr.stop();
			
			test.ok(this.cancelAll.called);
			test.done();
		}
	}),

	"handling bootstrap requests" : testCase ({
		setUp : function(done) {
			node.nodeId = '1234567890123456789012345678901234567890';
			this.msginfo = {
				sender_ap : '2.2.2.2:2222'
			};
			this.sharedRow = {'2' : {'A' : {id :'00A'}}};
			
			leafset.reset();
			this.updateWithProvisional = sinon.collection.stub(leafset, 'updateWithProvisional');
			
			this.rtUpdateWithKnownGood= sinon.collection.stub(routingtable, 'updateWithKnownGood');
			this.getSharedRow = sinon.collection.stub(routingtable, 'getSharedRow').returns(this.sharedRow);
			
			this.overlayCallback = langutil.extend(new events.EventEmitter(), { sendToAddr : function() {}, send : function() {}, sendToId : function() {} });
			this.sendToAddr = sinon.collection.stub(this.overlayCallback, 'sendToAddr');
			this.send = sinon.collection.stub(this.overlayCallback, 'send');
			this.sendToId = sinon.collection.stub(this.overlayCallback, 'sendToId');
			this.bootstrapmgr = new bootstrapmgr.BootstrapMgr(this.overlayCallback);
		
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			leafset.reset();
			bootstrapmgr.usePns = true;
			routingtable._table = {};
			routingtable._candidatePeers = {};
			done();
		},
		
		"when we are nearest to joining node's node id, should respond with final response" : function(test) {			
			var msg = {
				uri : 'p2p:graviti/peers',
				method : 'GET',
				content : {
					joining_node_id : 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234'					
				}
			};			
			
			this.bootstrapmgr.start();
			this.overlayCallback.emit("graviti-message-received", msg, this.msginfo);

			test.ok(!this.send.called);
			test.ok(!this.sendToId.called);
			test.ok(this.sendToAddr.calledOnce);
			test.strictEqual(this.sendToAddr.args[0][0], 'p2p:graviti/peers');
			test.deepEqual(this.sendToAddr.args[0][1], 	{
					leafset : leafset.compressedLeafset(),
					routing_table : this.sharedRow,
					bootstrap_request_hops : ['1234567890123456789012345678901234567890'],
					last_bootstrap_hop : true
			});
			test.deepEqual(this.sendToAddr.args[0][2], {
					method : 'POST'
			});
			test.strictEqual(this.sendToAddr.args[0][3], '2.2.2.2');
			test.strictEqual(this.sendToAddr.args[0][4], '2222');
			test.done();
		},
		
		"when we are not nearest to joining node's node id, should rebroadcast request into ring" : function(test) {			
			sinon.collection.stub(leafset, 'isThisNodeNearestTo').returns(false);
			var msg = {
				uri : 'p2p:graviti/peers',
				method : 'GET',
				content : {
					joining_node_id : 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234',
					bootstrap_source_ap : '3.3.3.3:3333'
				}
			};
			
			this.bootstrapmgr.start();
			this.overlayCallback.emit("graviti-message-received", msg, this.msginfo);

			test.ok(!this.send.called);
			test.ok(!this.sendToAddr.called);
			test.ok(this.sendToId.calledOnce);
			test.strictEqual(this.sendToId.args[0][0], 'p2p:graviti/peers');
			test.deepEqual(this.sendToId.args[0][1], {
					joining_node_id : 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234',
					routing_table : this.sharedRow,
					bootstrap_request_hops : ['1234567890123456789012345678901234567890'],
					bootstrap_source_ap : '3.3.3.3:3333'
			});
			test.deepEqual(this.sendToId.args[0][2], {method : 'GET'});
			test.strictEqual(this.sendToId.args[0][3], 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234');
			test.done();
		},
		
		"when forwardig a bootstrap request, we should update partial routing table with our own" : function(test) {
			var msg = {
				uri : 'p2p:graviti/peers',
				method : 'GET',
				content : {
					joining_node_id : 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234',
					routing_table : {'1' : {'4' : {id :'040'}}},
					bootstrap_request_hops : ['BAAD'],
					bootstrap_source_ap : '3.3.3.3:3333'
				}
			};
				
			this.bootstrapmgr.start();
			this.overlayCallback.emit("graviti-message-forwarding", msg, this.msginfo);
			
			test.ok(!this.send.called);
			test.ok(!this.sendToId.called);
			test.ok(!this.sendToAddr.called);
			test.deepEqual(msg.content, {
				joining_node_id : 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234',
				routing_table : {
					'1' : {'4' : {id :'040'}},
					'2' : {'A' : {id :'00A'}}
				},
				bootstrap_request_hops : ['BAAD', '1234567890123456789012345678901234567890'],
				bootstrap_source_ap : '3.3.3.3:3333'
			});
			test.done();
		}
	}),

	"handling bootstrap responses" : testCase ({
		setUp : function(done) {
			var _this = this;
			node.nodeId = '1234567890123456789012345678901234567890';
			this.leafset = {'LS' : '5.5.5.5:5555'};
			this.routingTable = {'RT' : '5.5.5.5:5555'};
			this.msginfo = {
				sender_ap : '2.2.2.2:2222'
			};
	
			this.updateWithProvisional = sinon.collection.stub(leafset, 'updateWithProvisional');
			this.updateWithKnownGood = sinon.collection.stub(leafset, 'updateWithKnownGood');
			this.mergeProvisional = sinon.collection.stub(routingtable, 'mergeProvisional');
			
			this.leafsetPeers = [{ap:"1.1.1.1:1111"}, {ap:"2.2.2.2:2222"}];
			this.routingTableRows = {
				'0' : { 
			    	'2' : {id : '2345', ap:"2.2.2.2:2222"},
			    	'5' : {id : '5678', ap:"5.5.5.5:5555"}
			    },
			    '1' : {
			    	'6' : {id : '6789', ap:"6.6.6.6:6666"}
			    }
			};
			this.leafsetEach = sinon.collection.stub(leafset, 'each', function(cbk) {
				for (var i = 0; i < _this.leafsetPeers.length; i++) {
					cbk('someid', _this.leafsetPeers[i]);
				}
			});
			this.routingTableEachRow = sinon.collection.stub(routingtable, 'eachRow', function(cbk) {
				Object.keys(_this.routingTableRows).forEach(function(row) {					
					cbk(row, _this.routingTableRows[row]);					
				});
			});
	
			this.overlayCallback = langutil.extend(new events.EventEmitter(), { sendToAddr : function() {}, send : function() {} });
			this.sendHeartbeatToAddr = sinon.collection.stub(heartbeater, 'sendHeartbeatToAddr');
			this.bootstrapmgr = new bootstrapmgr.BootstrapMgr(this.overlayCallback);
			
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			bootstrapmgr.usePns = true;
			routingtable._table = {};
			routingtable._candidatePeers = {};
			done();
		},
		
		"should emit bootstrap complete event when last bootstrap response received" : function(test) {
			var bootstrapCompletedCalled = false;
			this.bootstrapmgr.on('bootstrap-completed', function() {
				bootstrapCompletedCalled = true;
			});
			var _this = this;
			var msg = {
				uri : 'p2p:graviti/peers',
				method : 'POST',
				source_id : 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234',
				content : {
					leafset : _this.leafset,
					routing_table : _this.routingTable,
					last_bootstrap_hop : true
				}
			};
					
			this.bootstrapmgr.start('cool-bootstrap');			
			this.overlayCallback.emit("graviti-message-received", msg, this.msginfo);
			
			test.ok(!this.bootstrapmgr.bootstrapping);
			test.ok(bootstrapCompletedCalled);
			test.done();
		},		
		
		"should notify peers in state tables when last bootstrap response received" : function(test) {
			var _this = this;
			var msg = {
				uri : 'p2p:graviti/peers',
				method : 'POST',
				content : {
					id : 'ABCDEF1234ABCDEF1234ABCDEF1234ABCDEF1234',
					leafset : _this.leafset,
					routing_table : _this.routingTable,
					last_bootstrap_hop : true
				}
			};
			this.bootstrapmgr.bootstrapping = true;

			this.bootstrapmgr.start();
			this.overlayCallback.emit("graviti-message-received", msg, this.msginfo);
	
			test.ok(this.sendHeartbeatToAddr.callCount === 4);
			test.ok(this.sendHeartbeatToAddr.calledWith ('1.1.1.1', '1111', {
				leafset : leafset.compressedLeafset()
			}));
			test.ok(this.sendHeartbeatToAddr.calledWith ('2.2.2.2', '2222', {
				leafset : leafset.compressedLeafset(),
				routing_table : { '0' : this.routingTableRows['0']}
			}));
			test.ok(this.sendHeartbeatToAddr.calledWith ('5.5.5.5', '5555', {
				routing_table : { '0' : this.routingTableRows['0']}
			}));
			test.ok(this.sendHeartbeatToAddr.calledWith ('6.6.6.6', '6666', {
				routing_table : { '1' : this.routingTableRows['1']}
			}));
			test.done();
		}
	})
};