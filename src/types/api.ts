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
export type MessageType = 'user' | 'agent' | 'system' | 'error';

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
  metadata?: Record<string, any>;
  created_at: string; // Keep as string
}


// WebSocket Message Format
export interface WebSocketMessage {
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

// Removed AgentStatus and AgentUpdateEvent as they were A2A specific
