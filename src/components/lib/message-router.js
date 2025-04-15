/**
 * @fileoverview Message router for directing messages to appropriate agents
 * 
 * This module provides functionality for routing messages to one or more agents
 * based on @mentions and conversation context.
 */

import { parseAgentMentions, routeMessageToAgents } from './message-processor.js';

/**
 * Message Router class for handling message routing to agents
 */
export class MessageRouter {
  /**
   * Create a new message router
   * @param {Object} options - Router configuration
   * @param {Object} options.agentRegistry - Agent registry for accessing agents
   * @param {Object} options.eventBus - Event bus for publishing events
   * @param {Object} options.errorHandler - Error handler for router errors
   */
  constructor({ agentRegistry, eventBus, errorHandler }) {
    this.agentRegistry = agentRegistry;
    this.eventBus = eventBus;
    this.errorHandler = errorHandler;
    this.messageQueue = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the message router
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize agent registry if needed
      if (this.agentRegistry && !this.agentRegistry.initialized) {
        await this.agentRegistry.initialize();
      }

      this.initialized = true;

      // Emit initialization event
      if (this.eventBus) {
        this.eventBus.emit('messageRouter:initialized', {
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handleError('MessageRouter.initialize', error);
      }
      throw error;
    }
  }

  /**
   * Route a message to one or more agents
   * @param {Object} message - Message object to route
   * @param {Object} options - Routing options
   * @param {Array<string>} options.availableAgents - Available agent IDs
   * @param {string} options.currentAgentId - Current active agent ID
   * @param {string} options.defaultAgentId - Default agent ID
   * @returns {Promise<Object>} Routing result with targetAgents and responses
   */
  async routeMessage(message, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const {
        availableAgents = [],
        currentAgentId = 'chloe',
        defaultAgentId = 'chloe',
        conversationId = 'default',
        messageId = `msg-${Date.now()}`,
        timeout = 30000 // 30 second timeout
      } = options;

      // Parse message for @mentions and determine routing
      const routing = routeMessageToAgents(
        message.content, 
        availableAgents, 
        currentAgentId, 
        defaultAgentId
      );

      // Queue to track agent responses
      const responseQueue = new Map();
      const responsePromises = [];

      // Set up message tracking
      const messageTracker = {
        messageId,
        conversationId,
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        routing,
        responses: [],
        completed: false
      };

      // Add to message queue
      this.messageQueue.set(messageId, messageTracker);

      // Send message to each target agent and collect responses
      for (const agentId of routing.targetAgents) {
        const sendPromise = this._sendToAgent(agentId, message, messageTracker)
          .then(response => {
            // Store response
            responseQueue.set(agentId, response);
            
            // Update message tracker
            messageTracker.responses.push({
              agentId,
              response,
              timestamp: new Date().toISOString()
            });

            // Emit response event
            if (this.eventBus) {
              this.eventBus.emit('messageRouter:response', {
                messageId,
                agentId,
                response,
                timestamp: new Date().toISOString()
              });
            }

            return { agentId, response };
          })
          .catch(error => {
            // Handle error
            if (this.errorHandler) {
              this.errorHandler.handleError('MessageRouter.routeMessage', {
                error,
                agentId,
                messageId
              });
            }

            // Still return something to prevent Promise.all from failing
            return { 
              agentId, 
              error: error.message || 'Error processing message', 
              isError: true 
            };
          });

        responsePromises.push(sendPromise);
      }

      // Create a timeout promise
      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => {
          resolve({
            isTimeout: true,
            message: `Request timed out after ${timeout}ms`
          });
        }, timeout);
      });

      // Wait for all responses or timeout
      const responses = await Promise.race([
        Promise.all(responsePromises),
        timeoutPromise
      ]);

      // Update message tracker
      messageTracker.completed = true;

      // Handle timeout case
      if (responses.isTimeout) {
        // Mark incomplete responses as timeouts
        routing.targetAgents.forEach(agentId => {
          if (!responseQueue.has(agentId)) {
            responseQueue.set(agentId, {
              isTimeout: true,
              message: `Response from ${agentId} timed out`
            });
          }
        });

        // Emit timeout event
        if (this.eventBus) {
          this.eventBus.emit('messageRouter:timeout', {
            messageId,
            conversationId,
            targetAgents: routing.targetAgents,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Convert response map to array of responses
      const results = Array.from(responseQueue.entries()).map(([agentId, response]) => ({
        agentId,
        response,
        isPrimary: agentId === routing.primaryAgent
      }));

      return {
        messageId,
        routing,
        results,
        isComplete: !responses.isTimeout
      };
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handleError('MessageRouter.routeMessage', {
          error,
          message
        });
      }
      throw error;
    }
  }

  /**
   * Send a message to a specific agent
   * @private
   * @param {string} agentId - Agent ID
   * @param {Object} message - Message to send
   * @param {Object} messageTracker - Message tracking object
   * @returns {Promise<Object>} Agent response
   */
  async _sendToAgent(agentId, message, messageTracker) {
    try {
      if (!this.agentRegistry) {
        throw new Error('Agent registry not available');
      }

      // Find agent instance
      const agent = await this.agentRegistry.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Emit typing indicator
      if (this.eventBus) {
        this.eventBus.emit('agent:typing', {
          agentId,
          messageId: messageTracker.messageId,
          conversationId: messageTracker.conversationId,
          isTyping: true,
          timestamp: new Date().toISOString()
        });
      }

      // Process message with the agent
      const response = await agent.processMessage({
        content: message.content,
        metadata: {
          ...message.metadata,
          messageId: messageTracker.messageId,
          conversationId: messageTracker.conversationId
        }
      });

      // Emit typing complete
      if (this.eventBus) {
        this.eventBus.emit('agent:typing', {
          agentId,
          messageId: messageTracker.messageId,
          conversationId: messageTracker.conversationId,
          isTyping: false,
          timestamp: new Date().toISOString()
        });
      }

      return response;
    } catch (error) {
      // Log error
      if (this.errorHandler) {
        this.errorHandler.handleError('MessageRouter._sendToAgent', {
          error,
          agentId,
          messageId: messageTracker.messageId
        });
      }

      // Clear typing indicator on error
      if (this.eventBus) {
        this.eventBus.emit('agent:typing', {
          agentId,
          messageId: messageTracker.messageId,
          conversationId: messageTracker.conversationId,
          isTyping: false,
          timestamp: new Date().toISOString()
        });
      }

      throw error;
    }
  }

  /**
   * Get a message from the queue by ID
   * @param {string} messageId - Message ID
   * @returns {Object|null} Message tracker or null if not found
   */
  getMessage(messageId) {
    return this.messageQueue.get(messageId) || null;
  }

  /**
   * Dispose the message router
   * @returns {Promise<void>}
   */
  async dispose() {
    if (!this.initialized) {
      return;
    }

    try {
      // Clear message queue
      this.messageQueue.clear();

      this.initialized = false;

      // Emit disposal event
      if (this.eventBus) {
        this.eventBus.emit('messageRouter:disposed', {
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handleError('MessageRouter.dispose', error);
      }
    }
  }
}