var util = require('util');
var node = require('./node');
var langutil = require('../common/langutil');
var ringutil = require('./ringutil');
var bigint = require('../thirdparty/bigint');

var self = module.exports = {
	// TODO: limit leafset size
	leafset : {},
	
	//
	// refresh leafset with either a known node or a map of node -> addr
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
			// check if we're within leafset range
			if (res.highest && !bigint.greater(idBigint, res.highestBigint)
					&& res.lowest && !bigint.greater(res.lowestBigint, idBigint)) {
				if (res.nearest === node.nodeId) {
					return {
						id : res.nearest
					};
				} else {
					return{
						id   : res.nearest,
						addr : self.leafset[res.nearest].split(':')[0],
						port : self.leafset[res.nearest].split(':')[1]
					};
				}
			}
		}
		return undefined;
	}
};