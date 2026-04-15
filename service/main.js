'use strict';

var Service = require('webos-service');
var MeasurementService = require('./src/measurement-service');

var service = new Service('com.example.measurement.service');
var measurement = new MeasurementService(service);

// Initialize on first load
measurement.init();

// Debug: test which Application Manager methods are permitted
(function testAPIs() {
  var testAPIs = [
    'luna://com.webos.applicationManager/running',
    'luna://com.webos.applicationManager/listLaunchPoints',
    'luna://com.webos.applicationManager/listApps',
    'luna://com.webos.applicationManager/getForegroundAppInfo'
  ];
  testAPIs.forEach(function(uri) {
    service.call(uri, {}, function(res) {
      console.log('[API TEST] ' + uri + ' => ' + JSON.stringify(res).substring(0, 200));
    });
  });
})();

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
