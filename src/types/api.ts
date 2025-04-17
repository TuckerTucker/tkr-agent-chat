/**
 * TypeScript interfaces for API and WebSocket contracts
 * Matches backend and .clinerules definitions
 */

// Agent metadata (from /api/v1/agents)
export interface Agent {
  id: string;
  name: string;
  color: string;
  description: string;
  capabilities: string[];
  icon_path?: string;
  version?: string;
}

// List of agents response
export interface AgentListResponse {
  agents: Agent[];
}

// Chat session (from /api/v1/sessions)
export interface ChatSession {
  id: string;
  title?: string;
  created_at: string;
  agent_id?: string;
  // Add more fields as needed
}

// List of chat sessions response
export interface ChatSessionListResponse {
  sessions: ChatSession[];
}

// Chat message (from /api/v1/chats/{session_id}/messages)
export interface ChatMessage {
  message_id: string;
  session_id: string;
  agent_id: string;
  sender: "user" | "agent";
  content: string;
  timestamp: string;
  // Add more fields as needed
}

// List of chat messages response
export interface ChatMessageListResponse {
  messages: ChatMessage[];
}

// Library item (from /api/v1/library)
export interface LibraryItem {
  id: string;
  name: string;
  url: string;
  // Add more fields as needed
}

// List of library items response
export interface LibraryListResponse {
  items: LibraryItem[];
}

// WebSocket message contract (see .clinerules)
export interface MessageSendRequest {
  session_id: string;
  agent_id: string;
  content: string;
}

export interface MessageSendResponse {
  message_id: string;
  status: "sent" | "error";
}

export interface AgentListWSResponse {
  id: string;
  name: string;
  color: string;
  capabilities: string[];
}

// WebSocket event types (for extensibility)
export type WebSocketEvent =
  | { type: "message"; data: ChatMessage }
  | { type: "status"; data: { status: string; message?: string } }
  | { type: "agent_list"; data: AgentListWSResponse[] }
  | { type: "error"; data: { error: string } };

// Utility types
export type UUID = string;
