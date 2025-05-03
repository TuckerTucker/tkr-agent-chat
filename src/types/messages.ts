/**
 * Standardized Message Schema for TKR Multi-Agent Chat System
 * 
 * This file defines the canonical message formats used throughout the application
 * for communication between clients, agents, and the server.
 */

// Message Type Enum
export enum MessageType {
  TEXT = "text",                   // Plain text message
  AGENT_MESSAGE = "agent_message", // Agent-to-agent message
  SYSTEM = "system",               // System notification
  ERROR = "error",                 // Error message
  CONTEXT_UPDATE = "context_update", // Context sharing
  TASK_UPDATE = "task_update",     // Task status update
  PING = "ping",                   // Connection check
  PONG = "pong",                   // Connection check response
}

// Base Message Interface
export interface BaseMessage {
  // Core fields (required in all messages)
  id: string;                      // UUID for the message
  type: MessageType;               // Type of message
  timestamp: string;               // ISO-8601 formatted timestamp
  session_id: string;              // Session ID the message belongs to

  // Optional fields (may be present based on message type)
  from_agent?: string;             // ID of sending agent (null for user messages)
  to_agent?: string;               // ID of target agent (null for broadcast)
  from_user?: boolean;             // True if message is from a user 
  content?: string | object;       // Message content
  in_reply_to?: string;            // ID of message this is replying to
  
  // Streaming-related fields
  streaming?: boolean;             // True if message is part of a streaming response
  turn_complete?: boolean;         // True when streaming message is complete
  
  // Additional metadata
  metadata?: Record<string, any>;  // Additional message metadata
}

// User Text Message
export interface UserTextMessage extends BaseMessage {
  type: MessageType.TEXT;
  from_user: true;
  content: string;
  to_agent?: string;               // Optional target agent
}

// Agent Text Message
export interface AgentTextMessage extends BaseMessage {
  type: MessageType.TEXT;
  from_agent: string;
  content: string;
  streaming?: boolean;             // Whether this is a streaming message
  turn_complete?: boolean;         // Whether this completes the turn
}

// Agent-to-Agent Message
export interface AgentToAgentMessage extends BaseMessage {
  type: MessageType.AGENT_MESSAGE;
  from_agent: string;
  to_agent: string;
  content: any;                    // Structured content for A2A communication
  task_id?: string;                // Optional task ID this message is related to
}

// System Message
export interface SystemMessage extends BaseMessage {
  type: MessageType.SYSTEM;
  content: string;
  severity?: "info" | "warning";   // Optional severity for UI display
}

// Error Message
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  content: string;
  error_code?: string;             // Error code for categorization
  error_details?: any;             // Additional error details
  severity?: "warning" | "error" | "critical"; // Error severity
  recoverable?: boolean;           // Whether the error is recoverable
}

// Context Update Message
export interface ContextUpdateMessage extends BaseMessage {
  type: MessageType.CONTEXT_UPDATE;
  from_agent: string;
  context_id: string;              // Unique ID for this context
  context_data: any;               // Context data being shared
  target_agents?: string[];        // Optional list of target agents (null = broadcast)
}

// Task Update Message
export interface TaskUpdateMessage extends BaseMessage {
  type: MessageType.TASK_UPDATE;
  task_id: string;                 // Task unique identifier
  status?: string;                 // Task status (pending, in_progress, completed, failed)
  action?: "create" | "update" | "cancel"; // Task action
  result?: any;                    // Optional task result data
}

// Connection Check Messages
export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

// Union type for all message types
export type Message = 
  | UserTextMessage
  | AgentTextMessage
  | AgentToAgentMessage
  | SystemMessage
  | ErrorMessage
  | ContextUpdateMessage
  | TaskUpdateMessage
  | PingMessage
  | PongMessage;

// Message parts for structured content
export interface MessagePart {
  type: string;
  content: any;
  metadata?: Record<string, any>;
}

// Socket.IO message status
export type MessageStatus = 
  | "sent"        // Message sent, not yet acknowledged
  | "delivered"   // Message delivered to recipient
  | "read"        // Message read by recipient
  | "error"       // Error during delivery
  | "pending"     // Message queued locally but not sent
  | "retrying";   // Message delivery being retried

// Response acknowledgment
export interface MessageAcknowledgment {
  status: MessageStatus;
  id: string;
  timestamp: string;
  error_message?: string;       // Present if status is "error"
  persisted_id?: string;        // ID in database storage
}