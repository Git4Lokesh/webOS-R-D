'use strict';

/**
 * Mock for the webos-service library.
 * Simulates Luna Bus call() with configurable responses.
 */

class MockMessage {
  constructor() {
    this.response = null;
  }
  respond(data) {
    this.response = data;
  }
}

class MockService {
  constructor(serviceId) {
    this.serviceId = serviceId;
    this._handlers = {};
    this._callResponses = {};
    this._callLog = [];
    this.activityManager = null; // Set to mock if needed
  }

  // Configure mock responses for Luna Bus URIs
  mockCallResponse(uri, response) {
    this._callResponses[uri] = response;
  }

  // Simulate Luna Bus call
  call(uri, params, callback) {
    this._callLog.push({ uri, params, timestamp: new Date().toISOString() });

    const response = this._callResponses[uri];
    if (typeof response === 'function') {
      callback(response(params));
    } else if (response) {
      callback(response);
    } else {
      callback({ returnValue: true });
    }
  }

  // Register a Luna Bus method handler
  register(methodName, handler) {
    this._handlers[methodName] = handler;
  }

  // Invoke a registered handler (for testing)
  invoke(methodName, params) {
    const handler = this._handlers[methodName];
    if (!handler) throw new Error('No handler for: ' + methodName);
    const message = new MockMessage();
    message.payload = params || {};
    handler(message);
    return message.response;
  }

  // Get call log for assertions
  getCallLog() {
    return this._callLog;
  }

  clearCallLog() {
    this._callLog = [];
  }
}

module.exports = MockService;
