/**
 * Message adapter for TKR Multi-Agent Chat System.
 * 
 * This module provides adapters for converting between standardized and legacy message formats
 * to ensure compatibility during the transition period.
 */

import { 
  Message, 
  MessageType, 
  BaseMessage, 
  UserTextMessage, 
  AgentTextMessage,
  AgentToAgentMessage,
  SystemMessage,
  ErrorMessage,
  ContextUpdateMessage,
  TaskUpdateMessage,
  PingMessage,
  PongMessage,
  MessageStatus,
  MessageAcknowledgment
} from '../../types/messages';

/**
 * Convert a legacy format message to standardized format.
 * 
 * @param legacyMessage The legacy message object
 * @returns Standardized message object
 */
export function legacyToStandard(legacyMessage: any): Partial<Message> {
  // Base message fields
  const standardMessage: Partial<BaseMessage> = {
    id: legacyMessage.id || `msg_${Date.now()}`,
    timestamp: legacyMessage.timestamp || new Date().toISOString(),
    session_id: legacyMessage.sessionId || legacyMessage.session_id || 'default',
  };
  
  // Determine message type
  const type = legacyMessage.type || 'text';
  standardMessage.type = type as MessageType;
  
  // Add content - both content and text are used in legacy messages
  if ('content' in legacyMessage) {
    standardMessage.content = legacyMessage.content;
  } else if ('text' in legacyMessage) {
    standardMessage.content = legacyMessage.text;
  }
  
  // Handle agent vs user specifics
  if (legacyMessage.fromAgent || legacyMessage.from_agent) {
    standardMessage.from_agent = legacyMessage.fromAgent || legacyMessage.from_agent;
  } else if (legacyMessage.fromUser || legacyMessage.from_user) {
    standardMessage.from_user = true;
  } else {
    // Default to user message if no source specified
    standardMessage.from_user = true;
  }
  
  // Handle target agent
  if (legacyMessage.toAgent || legacyMessage.to_agent) {
    standardMessage.to_agent = legacyMessage.toAgent || legacyMessage.to_agent;
  }
  
  // Copy additional fields if present
  if ('inReplyTo' in legacyMessage || 'in_reply_to' in legacyMessage) {
    standardMessage.in_reply_to = legacyMessage.inReplyTo || legacyMessage.in_reply_to;
  }
  
  if ('streaming' in legacyMessage) {
    standardMessage.streaming = legacyMessage.streaming;
  }
  
  if ('turnComplete' in legacyMessage || 'turn_complete' in legacyMessage) {
    standardMessage.turn_complete = legacyMessage.turnComplete || legacyMessage.turn_complete;
  }
  
  if ('metadata' in legacyMessage) {
    standardMessage.metadata = legacyMessage.metadata;
  }
  
  // Handle message type specific fields
  switch (type) {
    case 'context_update':
      (standardMessage as Partial<ContextUpdateMessage>).context_id = 
        legacyMessage.contextId || legacyMessage.context_id;
      (standardMessage as Partial<ContextUpdateMessage>).context_data = 
        legacyMessage.contextData || legacyMessage.context_data;
      if ('targetAgents' in legacyMessage || 'target_agents' in legacyMessage) {
        (standardMessage as Partial<ContextUpdateMessage>).target_agents = 
          legacyMessage.targetAgents || legacyMessage.target_agents;
      }
      break;
    
    case 'task_update':
      (standardMessage as Partial<TaskUpdateMessage>).task_id = 
        legacyMessage.taskId || legacyMessage.task_id;
      if ('status' in legacyMessage) {
        (standardMessage as Partial<TaskUpdateMessage>).status = legacyMessage.status;
      }
      if ('action' in legacyMessage) {
        (standardMessage as Partial<TaskUpdateMessage>).action = 
          legacyMessage.action as 'create' | 'update' | 'cancel';
      }
      if ('result' in legacyMessage) {
        (standardMessage as Partial<TaskUpdateMessage>).result = legacyMessage.result;
      }
      break;
    
    case 'error':
      if ('errorCode' in legacyMessage || 'error_code' in legacyMessage) {
        (standardMessage as Partial<ErrorMessage>).error_code = 
          legacyMessage.errorCode || legacyMessage.error_code;
      }
      if ('errorDetails' in legacyMessage || 'error_details' in legacyMessage) {
        (standardMessage as Partial<ErrorMessage>).error_details = 
          legacyMessage.errorDetails || legacyMessage.error_details;
      }
      if ('severity' in legacyMessage) {
        (standardMessage as Partial<ErrorMessage>).severity = 
          legacyMessage.severity as 'warning' | 'error' | 'critical';
      }
      if ('recoverable' in legacyMessage) {
        (standardMessage as Partial<ErrorMessage>).recoverable = legacyMessage.recoverable;
      }
      break;
  }
  
  return standardMessage;
}

/**
 * Convert a standardized format message to legacy format.
 * 
 * @param message The standardized message object
 * @returns Legacy format message object
 */
export function standardToLegacy(message: Partial<Message>): any {
  // Create legacy message with camelCase fields
  const legacyMessage: any = {
    id: message.id,
    type: message.type,
    timestamp: message.timestamp,
    sessionId: message.session_id
  };
  
  // Handle content field
  if ('content' in message) {
    legacyMessage.content = message.content;
    if (typeof message.content === 'string') {
      legacyMessage.text = message.content;
    }
  }
  
  // Handle agent vs user specifics
  if (message.from_agent) {
    legacyMessage.fromAgent = message.from_agent;
  }
  if (message.to_agent) {
    legacyMessage.toAgent = message.to_agent;
  }
  if (message.from_user) {
    legacyMessage.fromUser = message.from_user;
  }
  
  // Copy additional fields
  if (message.in_reply_to) {
    legacyMessage.inReplyTo = message.in_reply_to;
  }
  
  if ('streaming' in message) {
    legacyMessage.streaming = message.streaming;
  }
  
  if ('turn_complete' in message) {
    legacyMessage.turnComplete = message.turn_complete;
  }
  
  if (message.metadata) {
    legacyMessage.metadata = message.metadata;
  }
  
  // Handle message type specific fields
  const type = message.type;
  switch (type) {
    case MessageType.CONTEXT_UPDATE:
      const contextMsg = message as Partial<ContextUpdateMessage>;
      if (contextMsg.context_id) {
        legacyMessage.contextId = contextMsg.context_id;
      }
      if (contextMsg.context_data) {
        legacyMessage.contextData = contextMsg.context_data;
      }
      if (contextMsg.target_agents) {
        legacyMessage.targetAgents = contextMsg.target_agents;
      }
      break;
      
    case MessageType.TASK_UPDATE:
      const taskMsg = message as Partial<TaskUpdateMessage>;
      if (taskMsg.task_id) {
        legacyMessage.taskId = taskMsg.task_id;
      }
      if (taskMsg.status) {
        legacyMessage.status = taskMsg.status;
      }
      if (taskMsg.action) {
        legacyMessage.action = taskMsg.action;
      }
      if (taskMsg.result) {
        legacyMessage.result = taskMsg.result;
      }
      break;
      
    case MessageType.ERROR:
      const errorMsg = message as Partial<ErrorMessage>;
      if (errorMsg.error_code) {
        legacyMessage.errorCode = errorMsg.error_code;
      }
      if (errorMsg.error_details) {
        legacyMessage.errorDetails = errorMsg.error_details;
      }
      if (errorMsg.severity) {
        legacyMessage.severity = errorMsg.severity;
      }
      if ('recoverable' in errorMsg) {
        legacyMessage.recoverable = errorMsg.recoverable;
      }
      break;
  }
  
  return legacyMessage;
}

/**
 * Check if a message is in standardized format.
 * 
 * @param message The message to check
 * @returns True if message has standardized format, False otherwise
 */
export function isStandardFormat(message: any): boolean {
  // Primary indicator is snake_case fields
  return 'session_id' in message && 'id' in message;
}

/**
 * Check if a message is in legacy format.
 * 
 * @param message The message to check
 * @returns True if message has legacy format, False otherwise
 */
export function isLegacyFormat(message: any): boolean {
  // Primary indicator is camelCase fields
  return 'sessionId' in message && 'id' in message;
}

/**
 * Normalize a message to standardized format regardless of input format.
 * Adds validation to ensure message has minimum required fields.
 * 
 * @param message Message in either legacy or standardized format
 * @returns Normalized message in standardized format
 * @throws Error if message cannot be normalized and lacks required fields
 */
export function normalizeMessage(message: any): Partial<Message> {
  // Handle null or undefined
  if (!message) {
    throw new Error('Cannot normalize undefined or null message');
  }
  
  // Ensure message is an object
  if (typeof message !== 'object') {
    throw new Error(`Cannot normalize non-object message: ${typeof message}`);
  }

  if (isLegacyFormat(message)) {
    return legacyToStandard(message);
  } else if (isStandardFormat(message)) {
    return message;
  } else {
    // Try to guess format and convert to standard
    if ('sessionId' in message) {
      return legacyToStandard(message);
    } else {
      // Create minimum valid message
      const standard: Partial<BaseMessage> = {
        id: message.id || `msg_${Date.now()}`,
        session_id: message.session_id || 'default',
        type: (message.type as MessageType) || MessageType.TEXT,
        timestamp: message.timestamp || new Date().toISOString()
      };
      
      // Copy any content
      if ('content' in message) {
        standard.content = message.content;
      } else if ('text' in message) {
        standard.content = message.text;
      } else {
        // No content found - set to empty string
        standard.content = '';
      }
      
      // Validate the created message has minimum fields
      if (!standard.id || !standard.session_id || !standard.type) {
        console.warn('Normalized message is missing required fields', standard);
      }
      
      return standard;
    }
  }
}

/**
 * Create a new standardized text message from a user.
 * 
 * @param text The message text content
 * @param sessionId The session ID
 * @param toAgent Optional target agent ID
 * @returns A user text message
 */
export function createUserTextMessage(
  text: string, 
  sessionId: string, 
  toAgent?: string
): UserTextMessage {
  return {
    id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type: MessageType.TEXT,
    session_id: sessionId,
    from_user: true,
    content: text,
    to_agent: toAgent,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create a new standardized text message from an agent.
 * 
 * @param text The message text content
 * @param sessionId The session ID
 * @param fromAgent The agent ID
 * @param inReplyTo Optional ID of message being replied to
 * @param streaming Whether this is a streaming message
 * @returns An agent text message
 */
export function createAgentTextMessage(
  text: string,
  sessionId: string,
  fromAgent: string,
  inReplyTo?: string,
  streaming: boolean = false
): AgentTextMessage {
  return {
    id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type: MessageType.TEXT,
    session_id: sessionId,
    from_agent: fromAgent,
    content: text,
    in_reply_to: inReplyTo,
    timestamp: new Date().toISOString(),
    streaming: streaming,
    turn_complete: !streaming
  };
}