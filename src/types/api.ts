/**
 * API Types for TKR Multi-Agent Chat System
 */

// Agent Information
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  color: string; // Hex format
  capabilities: string[];
  avatar?: string; // Optional: URL or SVG string for agent avatar
}

export interface AgentList {
  agents: AgentInfo[];
}

// Chat Session
export interface ChatSession {
  id: string;
  title?: string;
  created_at: string;
  active_agents: string[];
  metadata?: Record<string, any>;
}

// Pydantic Read Model for Sessions (Matches backend)
export interface ChatSessionRead {
  id: string;
  title?: string;
  created_at: string; // Keep as string for simplicity, parse if needed
}

// Message Types
export type MessageType = 'user' | 'agent' | 'system' | 'error' | 'a2a';

export interface MessagePart {
  type: string;
  content: any;
  metadata?: Record<string, any>;
}

export interface Message {
  id?: string; // Optional: Frontend generated ID for UI keys and streaming management
  type: MessageType;
  agent_id?: string;
  session_id?: string;
  parts: MessagePart[];
  metadata?: Record<string, any>;
}

// Pydantic Read Model for Messages (Matches backend)
export interface MessageRead {
  id: number; // Matches DB primary key
  message_uuid: string;
  session_id: string;
  type: MessageType;
  agent_id?: string;
  parts: MessagePart[]; // Keep using MessagePart for consistency
  message_metadata?: Record<string, any>; // Changed from metadata to match backend
  created_at: string; // Keep as string
}


// Socket.IO Message Format
export interface SocketMessage {
  type: MessageType;
  agent_id?: string;
  content: string;
  metadata?: Record<string, any>;
}

// API Responses
export interface ErrorResponse {
  code: number;
  message: string;
  details?: Record<string, any>;
}

export interface SystemStatus {
  status: string;
  active_sessions: number;
  available_agents: string[];
}

// API Request Parameters
export interface CreateSessionParams {
  title?: string;
}

export interface AddAgentToSessionParams {
  session_id: string;
  agent_id: string;
}

// A2A Protocol Types
export interface A2AMessage extends SocketMessage {
  type: 'a2a';
  from_agent: string;
  to_agent: string;
  task_id?: string;
  content: any;
}

export interface TaskEvent {
  type: 'task_state' | 'task_update' | 'error';
  task_id: string;
  status?: string;
  context?: any;
  result?: any;
  message?: string;
}

export interface TaskMetadata {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  agents: string[];
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  context?: Record<string, any>;
  result?: Record<string, any>;
}

export interface TaskUpdate {
  task_id: string;
  status?: string;
  context?: Record<string, any>;
  result?: Record<string, any>;
}
