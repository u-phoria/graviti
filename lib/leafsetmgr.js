var util = require('util');
var node = require('./node');
var langutil = require('./langutil');
var ringutil = require('./ringutil');
var bigint = require('./thirdparty/bigint');

var self = module.exports = {
	leafset : {},
	
	//
	// refresh leafset with a known node
	updateLeafset : function(a,b) {
		if (!a)
			return;
		
		var nodes = a;
		if (typeof(a) === 'string') {
			nodes = {};
			nodes[a] = b;
		}
		
		// todo: right now we just put everything into leafset
		for (var id in nodes) {
			if (self.leafset[id]) {
				util.log('Updating node ' + id + ' in leafset');				
			} else {
				util.log('Adding node ' + id + ' to leafset');
			}
			self.leafset[id] = nodes[id];
		}
	},
	
	//
	// Gets node id nearest to the given id, without looking 'outside' the leafset range.
	// If this is not possible, returns undefined
	getRoutingHop : function(id) {
		var leafsetIds = Object.keys(self.leafset).concat([node.nodeId]);
		
		var res = ringutil.getNearestId(id, leafsetIds, false);
		if (res.nearest) {
			var idBigint = bigint.str2bigInt(id, 16);
			if (res.highest && !bigint.greater(idBigint, res.highestBigint)
					&& res.lowest && !bigint.greater(res.lowestBigint, idBigint)) {
				return res.nearest;			
			}
		}
		return undefined;
	}
};