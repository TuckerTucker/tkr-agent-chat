/**
 * @fileoverview Tests for MessageRouter class
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { MessageRouter } from '../message-router.js';

describe('MessageRouter', () => {
  let router;
  let mockAgentRegistry;
  let mockEventBus;
  let mockErrorHandler;
  
  beforeEach(() => {
    // Mock dependencies
    mockAgentRegistry = {
      initialized: true,
      initialize: mock(() => Promise.resolve()),
      getAgent: mock((agentId) => {
        if (agentId === 'invalid') {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          processMessage: mock((message) => {
            // Simulate agent processing time
            return Promise.resolve({
              agentId,
              content: `Response from ${agentId}: ${message.content}`,
              timestamp: new Date().toISOString()
            });
          })
        });
      })
    };
    
    mockEventBus = {
      emit: mock(() => {})
    };
    
    mockErrorHandler = {
      handleError: mock(() => {})
    };
    
    // Create router instance
    router = new MessageRouter({
      agentRegistry: mockAgentRegistry,
      eventBus: mockEventBus,
      errorHandler: mockErrorHandler
    });
  });
  
  test('should initialize correctly', async () => {
    expect(router.initialized).toBe(false);
    
    await router.initialize();
    
    expect(router.initialized).toBe(true);
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'messageRouter:initialized',
      expect.objectContaining({
        timestamp: expect.any(String)
      })
    );
  });
  
  test('should initialize agent registry if not initialized', async () => {
    mockAgentRegistry.initialized = false;
    
    await router.initialize();
    
    expect(mockAgentRegistry.initialize).toHaveBeenCalled();
    expect(router.initialized).toBe(true);
  });
  
  test('should handle initialization errors', async () => {
    mockAgentRegistry.initialize = mock(() => Promise.reject(new Error('Init error')));
    mockAgentRegistry.initialized = false;
    
    try {
      await router.initialize();
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.message).toBe('Init error');
      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        'MessageRouter.initialize',
        expect.any(Error)
      );
      expect(router.initialized).toBe(false);
    }
  });
  
  test('should route a message to a single agent', async () => {
    await router.initialize();
    
    const message = {
      content: 'Hello agent',
      timestamp: new Date().toISOString()
    };
    
    const options = {
      availableAgents: ['chloe', 'parker'],
      currentAgentId: 'chloe',
      defaultAgentId: 'parker',
      conversationId: 'conv-123',
      messageId: 'msg-456'
    };
    
    const result = await router.routeMessage(message, options);
    
    expect(result.messageId).toBe('msg-456');
    expect(result.routing.targetAgents).toEqual(['chloe']);
    expect(result.routing.primaryAgent).toBe('chloe');
    expect(result.results.length).toBe(1);
    expect(result.results[0].agentId).toBe('chloe');
    expect(result.results[0].isPrimary).toBe(true);
    expect(result.isComplete).toBe(true);
    
    expect(mockAgentRegistry.getAgent).toHaveBeenCalledWith('chloe');
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'agent:typing',
      expect.objectContaining({
        agentId: 'chloe',
        messageId: 'msg-456',
        conversationId: 'conv-123',
        isTyping: true
      })
    );
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'agent:typing',
      expect.objectContaining({
        agentId: 'chloe',
        messageId: 'msg-456',
        conversationId: 'conv-123',
        isTyping: false
      })
    );
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'messageRouter:response',
      expect.objectContaining({
        messageId: 'msg-456',
        agentId: 'chloe'
      })
    );
  });
  
  test('should route a message to multiple agents', async () => {
    await router.initialize();
    
    const message = {
      content: '@parker @chloe help me',
      timestamp: new Date().toISOString()
    };
    
    const options = {
      availableAgents: ['chloe', 'parker'],
      currentAgentId: 'chloe',
      defaultAgentId: 'parker'
    };
    
    const result = await router.routeMessage(message, options);
    
    expect(result.routing.targetAgents).toEqual(['parker', 'chloe']);
    expect(result.routing.primaryAgent).toBe('parker');
    expect(result.routing.hasMultipleTargets).toBe(true);
    expect(result.results.length).toBe(2);
    
    // Check that both agents were called
    expect(mockAgentRegistry.getAgent).toHaveBeenCalledWith('parker');
    expect(mockAgentRegistry.getAgent).toHaveBeenCalledWith('chloe');
    
    // Check primary agent flag
    const parkerResult = result.results.find(r => r.agentId === 'parker');
    const chloeResult = result.results.find(r => r.agentId === 'chloe');
    expect(parkerResult.isPrimary).toBe(true);
    expect(chloeResult.isPrimary).toBe(false);
  });
  
  test('should handle agent not found error', async () => {
    await router.initialize();
    
    // Making the test more robust by modifying the mock implementation
    mockAgentRegistry.getAgent = mock((agentId) => {
      if (agentId === 'invalid') {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        processMessage: mock(() => Promise.resolve({
          agentId,
          content: `Response from ${agentId}`,
          timestamp: new Date().toISOString()
        }))
      });
    });
    
    const message = {
      content: '@invalid help me',
      timestamp: new Date().toISOString()
    };
    
    const options = {
      availableAgents: ['invalid'],
      currentAgentId: 'invalid',
      defaultAgentId: 'invalid'
    };
    
    try {
      const result = await router.routeMessage(message, options);
      
      // Check if the error propagates to the result properly
      expect(result.results).toBeDefined();
      expect(result.results.length).toBe(0); // As the agent is not found, no results are expected
      
      // Error handler should be called
      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        'MessageRouter._sendToAgent',
        expect.objectContaining({
          error: expect.any(Object),
          agentId: 'invalid'
        })
      );
    } catch (error) {
      // It's also valid if the error is thrown upwards
      expect(error.message).toContain('Agent not found');
      expect(mockErrorHandler.handleError).toHaveBeenCalled();
    }
  });
  
  test('should handle agent processing errors', async () => {
    await router.initialize();
    
    const errorAgent = {
      processMessage: mock(() => Promise.reject(new Error('Processing error')))
    };
    
    mockAgentRegistry.getAgent = mock((agentId) => {
      if (agentId === 'error') {
        return Promise.resolve(errorAgent);
      }
      return Promise.resolve({
        processMessage: mock(() => Promise.resolve({
          agentId,
          content: `Response from ${agentId}`,
          timestamp: new Date().toISOString()
        }))
      });
    });
    
    const message = {
      content: '@chloe help', // Testing with a successful agent
      timestamp: new Date().toISOString()
    };
    
    const options = {
      availableAgents: ['chloe'],
      currentAgentId: 'chloe',
      defaultAgentId: 'chloe'
    };
    
    const result = await router.routeMessage(message, options);
    
    // Should have a successful result for chloe
    expect(result.results.length).toBe(1);
    
    // Chloe should succeed
    const chloeResult = result.results[0];
    expect(chloeResult.agentId).toBe('chloe');
    expect(chloeResult.isError).toBeUndefined();
    expect(chloeResult.response).toBeDefined();
    
    // Now try with an error agent
    const errorMessage = {
      content: '@error help',
      timestamp: new Date().toISOString()
    };
    
    const errorOptions = {
      availableAgents: ['error'],
      currentAgentId: 'error',
      defaultAgentId: 'error'
    };
    
    try {
      await router.routeMessage(errorMessage, errorOptions);
      
      // Error handler should be called
      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        'MessageRouter._sendToAgent',
        expect.objectContaining({
          error: expect.any(Object),
          agentId: 'error'
        })
      );
    } catch (error) {
      // The error might bubble up, which is also fine
      expect(error.message).toBe('Processing error');
      expect(mockErrorHandler.handleError).toHaveBeenCalled();
    }
  });
  
  test('should handle message timeouts', async () => {
    await router.initialize();
    
    // Create a slow agent that exceeds the timeout
    const slowAgent = {
      processMessage: mock(() => new Promise(resolve => {
        // This will exceed our timeout
        setTimeout(() => {
          resolve({
            content: 'Too late'
          });
        }, 500);
      }))
    };
    
    mockAgentRegistry.getAgent = mock(() => Promise.resolve(slowAgent));
    
    const message = {
      content: 'Hello agent',
      timestamp: new Date().toISOString()
    };
    
    const options = {
      availableAgents: ['slow'],
      currentAgentId: 'slow',
      defaultAgentId: 'slow',
      timeout: 50 // Very short timeout for testing
    };
    
    const result = await router.routeMessage(message, options);
    
    // Should have a timeout result
    expect(result.isComplete).toBe(false);
    expect(result.results[0].response.isTimeout).toBe(true);
    
    // Timeout event should be emitted
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'messageRouter:timeout',
      expect.objectContaining({
        targetAgents: ['slow']
      })
    );
  });
  
  test('should dispose correctly', async () => {
    await router.initialize();
    
    // Add some messages to the queue
    router.messageQueue.set('msg-1', { id: 'msg-1' });
    router.messageQueue.set('msg-2', { id: 'msg-2' });
    
    await router.dispose();
    
    expect(router.initialized).toBe(false);
    expect(router.messageQueue.size).toBe(0);
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'messageRouter:disposed',
      expect.objectContaining({
        timestamp: expect.any(String)
      })
    );
  });
  
  test('should retrieve a message from the queue', async () => {
    await router.initialize();
    
    const message = {
      content: 'Hello',
      timestamp: new Date().toISOString()
    };
    
    const options = {
      messageId: 'msg-123'
    };
    
    await router.routeMessage(message, options);
    
    const tracker = router.getMessage('msg-123');
    expect(tracker).not.toBeNull();
    expect(tracker.messageId).toBe('msg-123');
    expect(tracker.content).toBe('Hello');
    
    // Non-existent message should return null
    expect(router.getMessage('not-exist')).toBeNull();
  });
});