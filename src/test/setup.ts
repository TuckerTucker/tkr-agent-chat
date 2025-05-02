import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with testing-library matchers
if (matchers) {
  expect.extend(matchers);
}

// Mock WebSocket API for tests
class MockWebSocket {
  static instances: any[] = [];
  url: string;
  readyState: number;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  send: any;
  close: any;
  
  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose({ code: 1000, reason: "Test close", wasClean: true });
    });
    
    // Store instance for test access
    MockWebSocket.instances.push(this);
    
    // Auto-connect after short timeout (simulates async connection)
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen({ target: this });
    }, 0);
  }
  
  // Helper method to simulate receiving a message
  mockReceiveMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'object' ? JSON.stringify(data) : data });
    }
  }
  
  // Helper to simulate errors
  mockError(error: any) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
  
  // Constants from the WebSocket API
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  // Reset all instances (call between tests)
  static resetMocks() {
    MockWebSocket.instances = [];
  }
}

// Install the mock
global.WebSocket = MockWebSocket as any;

// Make sure the mock is available in the global scope for tests
(global as any).MockWebSocket = MockWebSocket;

// Cleanup after each test
afterEach(() => {
  cleanup();
  MockWebSocket.resetMocks();
  vi.clearAllMocks();
});
