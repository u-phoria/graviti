var gently = global.GENTLY = new (require('gently'));
var assert = require('assert');
var mod_node = require('node');

var server = undefined;
var listeningCallback = undefined;
var messageCallback = undefined;
function setupStartExpectations() {
	server = new Object();
	gently.expect(gently.hijacked.dgram, 'createSocket', function(proto) {
		assert.eql('udp4', proto);
		return server;
	});
        gently.expect(server, "on", function(evt, callback) {
                assert.eql('listening', evt);
		listeningCallback = callback;
        });
        gently.expect(server, "on", function(evt, callback) {
        	assert.eql('message', evt);
		messageCallback = callback;
        });
	gently.expect(server, "bind", function(port, addr) {
        	assert.eql(1234, port);
                assert.eql("127.0.0.1", addr);
        });
};

module.exports = {
	setUp : function() {
	},
	shouldStartWithoutBootstraps : function() {
		// setup
		setupStartExpectations();

		// act
		mod_node.start(1234, "127.0.0.1");

		// assert
		gently.verify();
	},
	shouldHandleListeningEventOnStart : function() {
		// setup
		setupStartExpectations();
		gently.expect(server, "address", function() {
                	return {address: "127.0.0.1", port: 1234};
                });

		// act
                mod_node.start(1234, "127.0.0.1");
		listeningCallback();

		// assert
		gently.verify();
	},
	shouldHandleMessageCallback : function() {
		// setup
		setupStartExpectations();
		var rinfo = { 'address' : '127.0.0.1', 'port' : 1234 };

		// act
		mod_node.start(1234, "127.0.0.1");
		messageCallback('msg', rinfo);

		// assert
		gently.verify();
	},
	shouldStop : function() {
		// setup
		var server = new Object();
		mod_node.server = server;
		gently.expect(mod_node.server, "close", function() {
		});

		// act
		mod_node.stop();

		// assert
		gently.verify();
	}	
}
