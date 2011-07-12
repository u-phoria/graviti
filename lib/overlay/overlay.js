var logger = require('logmgr').getLogger('overlay/overlay');
var node = require('core/node');
var uri = require('common/uri');
var langutil = require('common/langutil');
var bootstrapmgr = require('overlay/bootstrapmgr');
var heartbeater = require('overlay/heartbeater');
var leafset = require('overlay/leafset');
var routingmgr = require('overlay/routingmgr');
var routingtable = require('overlay/routingtable');
var messages = require('messaging/messages');
var messagemgr = require('messaging/messagemgr');

//
// Manages overlay membership
var self = module.exports = langutil.extend(new events.EventEmitter(), {
	//
	// Initialise ourselves as the first node in a ring
	init : function(port, bindAddr, nodeReadyCallback) {
		self._startNode(port, bindAddr, {
			success : function() {
				bootstrapmgr.start(self);
				heartbeater.start(self);
				
				if (nodeReadyCallback)
					nodeReadyCallback();
			}
		});
	},
	
	//
	// Join an existing ring via specified bootstraps
	join : function(port, bindAddr, bootstraps, joinedOverlayCallback) {
		self.on("bootstrap-completed", function() {
			if (joinedOverlayCallback)
				joinedOverlayCallback();
		});
		self._startNode(port, bindAddr, {
			success : function() {
				bootstrapmgr.start(self, bootstraps);
				heartbeater.start(self);
			}
		});
	},
		
	_startNode : function(port, bindAddr, opts) {
		leafset.on('peer-arrived', function(id) {
			self.emit('peer-arrived', id);
		});
		leafset.on('peer-departed', function(id) {
			self.emit('peer-departed', id);
		});
		
		messagemgr.on("message", self._processMessage);
		node.start(port, bindAddr, opts);
	},
	
	//
	// Single message send to a uri. Uri's resource is hashed to form the destination id
	send : function(destUri, content, headers) {
		self._send(destUri, content, headers);
	},
	
	//
	// Send message directly to a specific known addr and port. Mainly for internal use 
	sendToAddr : function(destUri, content, headers, addr, port) {
		var msg = new messages.Message(destUri, content, headers);
		messagemgr.send(port, addr, msg);
	},
	
	//
	// Send message directly to a specific id (as opposed to the hashed resource in the uri)
	sendToId : function(destUri, content, headers, destId) {
		self._send(destUri, content, headers, undefined, undefined, destId);
	},
	
	//
	// Internal send
	_send : function(destUri, content, headers, addr, port, destId) {
		if (destId === undefined)
			destId = uri.parse(destUri).hash;

		var msg = new messages.Message(destUri, content, headers, destId);
		self._processMessage(msg);
	},
	
	//
	// Leave the overlay, if we're part of it. Do this nicely, by letting
	// other nodes know, then tear down the node and exit.
	leave : function() {
		bootstrapmgr.stop();
		heartbeater.stop();
		
		node.stop();
	},
	
	//
	// Handle a received message, or an outbound message about to leave this node,
	// and decide what to do with it. If the message is for this node, we raise an event.
	// If it is for a remote node, we raise a forwarding event, letting app logic alter it
	_processMessage : function(msg, msginfo) {
		if (!msginfo) {
			msginfo = {
				app_name : uri.parse(msg.uri).app_name
			};
		}
		
		// figure out if this message is for us
		var isForThisNode = true;
		var nextHop = undefined;
		if (msg.dest_id !== undefined && msg.dest_id.length > 0) {			
			nextHop = routingmgr.getNextHop(msg.dest_id);
			if (nextHop.id !== node.nodeId) {
				logger.verbose((msg.source_id === node.nodeId ? 'Outbound' : 'En route') + ' forwarding message ' + msg.msg_id + ' to ' + msg.dest_id);
				isForThisNode = false;
			}
		}

		// if is for me, emit received, else emit forward
		if (isForThisNode) {
			logger.verbose('message for this node: uri ' + msg.uri + ', source ' + msg.source_id);
			if (msginfo.app_name === 'graviti') {
				self.emit('graviti-message-received', msg, msginfo);
			} else {				
				self.emit(msginfo.app_name + '-app-message-received', msg, msginfo);
			}
		} else {
			msginfo = langutil.extend(msginfo, {
				next_hop_id   : nextHop.id,
				next_hop_addr : nextHop.addr,
				next_hop_port : nextHop.port
			});
			if (msginfo.app_name === 'graviti') {
				self.emit('graviti-message-forwarding', msg, msginfo);
			} else {
				self.emit(msginfo.app_name + '-app-message-forwarding', msg, msginfo);
			}
			messagemgr.send(msginfo.next_hop_port, msginfo.next_hop_addr, msg);
			
			// let's see if we can offer the sender a better route to help it lazily repair its
			// routing table (PNS paper, sect 3.2)
			if (msg.source_id !== node.nodeId) {				
				var betterRoute = routingtable.findBetterRoutingHop(msg.source_id, msg.dest_id);
				if (betterRoute !== undefined) {
					logger.verbose('Found better route (' + betterRoute.id + ') for message from ' + msg.source_id + ' to ' + msg.dest_id + ', going to offer it back');
					var ap = msginfo.source_ap.split(':');
					var content = {
							routing_table : betterRoute.row
					};		
					heartbeater.sendHeartbeatToAddr(ap[0], ap[1], content);
				}
			}
		}
	}
});