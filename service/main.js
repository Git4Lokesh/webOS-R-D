'use strict';

var Service = require('webos-service');
var MeasurementService = require('./src/measurement-service');

var service = new Service('com.example.measurement.service');
var measurement = new MeasurementService(service);

// Initialize on first load
measurement.init();

// Handle relaunch events
service.register('__webOSRelaunch', function (message) {
  measurement.handleRelaunch();
  message.respond({ returnValue: true });
});

// Handle shutdown
process.on('SIGTERM', function () {
  measurement.shutdown();
  setTimeout(function () { process.exit(0); }, 2000);
});
