import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with testing-library matchers
if (matchers) {
  expect.extend(matchers);
}

// Mock Socket.IO client for tests
// This replaces the previous WebSocket mock
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
    timeout: vi.fn(() => ({
      emit: vi.fn((event, data, callback) => {
        if (callback) callback(null, { status: 'success' });
        return true;
      })
    }))
  };
  
  // Track instances for testing
  const mockInstances = [];
  
  const mockIO = vi.fn(() => {
    mockInstances.push(mockSocket);
    return mockSocket;
  });
  
  // Helper to get the latest instance
  mockIO.getLastInstance = () => mockInstances[mockInstances.length - 1];
  
  // Helper to reset all instances
  mockIO.resetMocks = () => {
    mockInstances.length = 0;
    Object.values(mockSocket).forEach(method => {
      if (typeof method === 'function' && method.mockReset) {
        method.mockReset();
      }
    });
  };
  
  return { io: mockIO };
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  
  // Reset Socket.IO mocks
  const { io } = require('socket.io-client');
  if (io.resetMocks) {
    io.resetMocks();
  }
});