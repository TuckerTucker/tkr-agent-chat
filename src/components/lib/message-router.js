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
        messageId = message.id || `msg-${Date.now()}`,
        timeout = 30000 // 30 second timeout
      } = options;

      // Import standardized message adapter if needed
      const messageAdapter = await import('./message-adapter');
      
      // Normalize the message to standardized format if it's not already
      let standardizedMessage = message;
      let messageContent = '';
      
      if (!message.session_id && message.content) {
        // Message is in legacy format, normalize it
        if (typeof messageAdapter.normalizeMessage === 'function') {
          standardizedMessage = messageAdapter.normalizeMessage(message);
        } else {
          // Basic conversion if adapter not available
          standardizedMessage = {
            id: message.id || messageId,
            type: message.type || 'text',
            session_id: conversationId,
            from_user: true,
            content: message.content,
            timestamp: message.timestamp || new Date().toISOString()
          };
        }
      }
      
      // Extract content from message
      if (typeof standardizedMessage.content === 'string') {
        messageContent = standardizedMessage.content;
      } else if (message.content && typeof message.content === 'string') {
        messageContent = message.content;
      } else {
        // Fallback
        messageContent = '';
      }

      // Parse message for @mentions and determine routing
      const routing = routeMessageToAgents(
        messageContent, 
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
        conversationId: standardizedMessage.session_id || conversationId,
        content: messageContent,
        timestamp: standardizedMessage.timestamp || new Date().toISOString(),
        routing,
        responses: [],
        completed: false
      };

      // Add to message queue
      this.messageQueue.set(messageId, messageTracker);

      // Send message to each target agent and collect responses
      for (const agentId of routing.targetAgents) {
        // Create a copy of the message with the target agent set
        const targetedMessage = { 
          ...standardizedMessage,
          to_agent: agentId
        };
        
        const sendPromise = this._sendToAgent(agentId, targetedMessage, messageTracker)
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
   * @param {Object} message - Message to send (standardized format)
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

      // Extract the message content
      let messageContent = '';
      if (typeof message.content === 'string') {
        messageContent = message.content;
      } else if (message.content) {
        messageContent = JSON.stringify(message.content);
      }

      // Prepare message metadata
      const metadata = {
        ...(message.metadata || {}),
        messageId: messageTracker.messageId,
        conversationId: messageTracker.conversationId || message.session_id,
        sessionId: message.session_id || messageTracker.conversationId,
        timestamp: message.timestamp || messageTracker.timestamp
      };

      // Process message with the agent
      // Different agents may expect different formats, so we provide both
      // standardized and legacy formats
      const processMessage = {
        // Standardized format properties
        id: message.id || messageTracker.messageId,
        type: message.type || 'text',
        session_id: message.session_id || messageTracker.conversationId,
        content: messageContent,
        from_user: message.from_user || true,
        to_agent: agentId,
        timestamp: message.timestamp || messageTracker.timestamp,
        metadata,
        
        // Legacy format properties for backward compatibility
        conversationId: messageTracker.conversationId,
        content: messageContent,  // Also as top-level for legacy compatibilty
        metadata
      };

      const response = await agent.processMessage(processMessage);

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