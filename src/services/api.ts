/**
 * API service for REST endpoints to backend (api_gateway)
 * Uses fetch and TypeScript types from src/types/api.ts
 */

import {
  AgentListResponse,
  ChatSessionListResponse,
  ChatMessageListResponse,
  LibraryListResponse,
  ChatSession,
} from "@/types/api";

// Helper to handle fetch and errors
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  return res.json();
}

// Get list of agents
export async function getAgents(): Promise<AgentListResponse> {
  return fetchJson<AgentListResponse>("/api/v1/agents");
}

// Get list of chat sessions (only use /api/v1/sessions)
export async function getSessions(): Promise<ChatSession[]> {
  try {
    return await fetchJson<ChatSession[]>("/api/v1/sessions");
  } catch (err) {
    return [];
  }
}

// Get messages for a session
export async function getMessages(sessionId: string): Promise<ChatMessageListResponse> {
  return fetchJson<ChatMessageListResponse>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`);
}

/**
 * Create a new chat session.
 * Optionally accepts a title or agent_id (if supported by backend).
 */
export async function createSession(data?: { title?: string; agent_id?: string }): Promise<ChatSession> {
  const res = await fetch("/api/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  return res.json();
}

// (Removed getLibrary, as /api/v1/library does not exist)
