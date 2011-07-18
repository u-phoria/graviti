var pnsrunner = require('overlay/pastry/pnsrunner');
var pns = require('overlay/pastry/pns');
var testCase = require('nodeunit').testCase;
var sinon = require('sinon');
var node = require('core/node');
var events = require('events');
var mockutil = require('testability/mockutil');

module.exports = {
	"lifecycle events aka initialisation and cancellation" : testCase({
		setUp : function(done) {
			this.pns = mockutil.stubProto(pns.Pns);
			this.pnsrunner = new pnsrunner.PnsRunner(this.pns);
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"should delegate cancellation to pns" : function(test) {
			var pnsCancelAll = sinon.collection.stub(this.pns, 'cancelAll');
			
			this.pnsrunner.cancelAll();
			
			test.ok(pnsCancelAll.called);
			test.done();
		}
	}),
	
	"running pns" : testCase({
		setUp : function(done) {
			node.nodeId = 'ABCDEF';
			var numCallbacks = 0;
			var _this = this;
			this.res = {
					id : 'A00' + numCallbacks,
					ap : '1.1.1.' + numCallbacks + ':1111',
					rtt: 100 * numCallbacks,
					discovered_peers : ['other', 'peers']
				};
			this.success = sinon.stub();
			this.pns = mockutil.stubProto(pns.Pns);
			this.pnsrunner = new pnsrunner.PnsRunner(this.pns);
			this.pnsFind = sinon.collection.stub(this.pns, 'findNearestNode', function(seed, nodeId, success) {
				success(_this.res);
			});
			done();
		},
		
		tearDown : function(done) {
			sinon.collection.restore();
			done();
		},
		
		"should initiate pns by starting the first pns run" : function(test) {
			this.pnsrunner.run('seed', this.success);
			
			test.ok(this.pnsFind.calledWith('seed', 'ABCDEF'));
			test.done();
		},
		
		"should do no more than max allowed num of finds in a pns run" : function(test) {
			this.pnsrunner.run('seed', this.success);
			
			test.equal(3, this.pnsFind.callCount);
			test.ok(this.success.calledWith('1.1.1.0:1111'));
			test.done();
		},
		
		"should only run once if no discovered peers" : function(test) {
			this.res.discovered_peers = [];
			
			this.pnsrunner.run('seed', this.success);
			
			test.equal(1, this.pnsFind.callCount);
			test.ok(this.success.calledWith('1.1.1.0:1111'));
			test.done();
		},
		
		"should only run once if discovered empty" : function(test) {
			this.res.discovered_peers = undefined;
			
			this.pnsrunner.run('seed', this.success);
			
			test.equal(1, this.pnsFind.callCount);
			test.ok(this.success.calledWith('1.1.1.0:1111'));
			test.done();
		},
		
		"should use up discovered peers only once" : function(test) {
			this.pnsrunner.run('seed', this.success);

			test.ok(this.pnsFind.calledWith('other', 'ABCDEF'));
			test.ok(this.pnsFind.calledWith('peers', 'ABCDEF'));	
			test.done();
		},
		
		"should randomize selection of seed from discovered peers from a prevoius run" : function(test) {
			this.res.discovered_peers = ['a', 'b', 'c'];
						
			while (!this.pnsFind.calledWith('a', 'ABCDEF') ||
					!this.pnsFind.calledWith('b', 'ABCDEF') ||
					!this.pnsFind.calledWith('c', 'ABCDEF'))
				this.pnsrunner.run('seed', this.success);
			
			test.done();
		}
	})	
}