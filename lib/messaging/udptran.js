//
// Sets up UDP sockets for sending and receiving raw data
//
var logger = require('logmgr').getLogger('messaging/udptran');
var dgram = require("dgram");
var events = require('events');
var langutil = require('common/langutil');
var uri = require('common/uri');

var self = module.exports = langutil.extend(new events.EventEmitter(), {
	server : undefined,
	addrInUseRetryMsec : 3000,
	receivedDataCallback : undefined,
	
	start : function(port, bindAddr, receivedDataCallback, readyCallback) {
		self.receivedDataCallback = receivedDataCallback;
		self._bind(port, bindAddr, readyCallback);
	},
	
	_bind : function(port, bindAddr, readyCallback) {
		var listenCallback = function() {
			var svraddr = self.server.address();
			logger.info('Listening to UDP on ' + svraddr.address + ':' + svraddr.port);
			if (readyCallback)
				readyCallback();
			else
				logger.warn('No UDP listening callback specified');
		};
		
		self.server = dgram.createSocket("udp4");
		
		self.server.on('error', function (e) {
			if (e.code == 'EADDRINUSE') {
				logger.warn('UDP address in use -- will retry in ' + self.addrInUseRetryMsec + 'ms...');
				setTimeout(function () {
					try {
						self.server.close();
					} catch (e) {
						logger.warn('UDP server did not close cleanly upon detection of addr in use: ' + e);
					}
					self.server.bind(port, bindAddr, listenCallback);
				}, self.addrInUseRetryMsec);
			} else if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET')
				logger.error('UNEXPECTED UDP error: ' + e.code);
			else
				logger.error(e);
		});
		
		self.server.on('message', self._processReceived);
		self.server.on("listening", listenCallback);
		self.server.bind(port, bindAddr);
	},
	
	_processReceived : function(raw, rinfo) {
		var data = new String(raw);

		try {
			var partiallyParsed = self.receivedDataCallback(data, rinfo.address, undefined);
		} catch (e) {
			logger.info('Error parsing message: ' + e);
		}		
		if (partiallyParsed)
			logger.warn('Failed to fully parse message: ' + data);
	},
	
	send : function(port, host, data) {
		var buf = new Buffer(data);
		self.server.send (buf, 0, buf.length, port, host, function(err) {
			if (err)
				logger.error("Error sending packet of size " + data.length + " via UDP to " + host + ":" + port + ": " + err);
		});
	},
	
	stop : function() {		
		if (!self.server)
			return;
			
		try {
			self.server.close();
		} catch(e) {
			logger.error('Error closing UDP listener: ' + e);
		}		
	}
});