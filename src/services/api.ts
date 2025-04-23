/**
 * API Service
 *
 * Contains functions for interacting with the backend REST API endpoints.
 */

import { ChatSessionRead, MessageRead, AgentInfo } from '@/types/api'; // Assuming types are defined here

const API_BASE_URL = 'http://localhost:8000/api/v1'; // API Gateway server URL

// Helper function for making API requests
async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`API Error (${response.status}): ${errorData.message || response.statusText}`);
    }
    // Handle cases where the response might be empty (e.g., 204 No Content)
    if (response.status === 204) {
        return undefined as T; // Or handle as appropriate for the specific call
    }
    return await response.json() as T;
  } catch (error) {
    console.error(`API call failed: ${url}`, error);
    throw error; // Re-throw to be caught by React Query
  }
}

// --- Sessions API ---

export const getSessions = async (): Promise<ChatSessionRead[]> => {
  return fetchApi<ChatSessionRead[]>('/sessions');
};

export const getSession = async (sessionId: string): Promise<ChatSessionRead> => {
  if (!sessionId) throw new Error("Session ID is required");
  return fetchApi<ChatSessionRead>(`/sessions/${sessionId}`);
};

export const createSession = async (title?: string): Promise<ChatSessionRead> => {
  const body = title ? JSON.stringify({ title }) : undefined;
  return fetchApi<ChatSessionRead>('/sessions', {
    method: 'POST',
    body: body,
  });
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  if (!sessionId) throw new Error("Session ID is required");
  return fetchApi<void>(`/sessions/${sessionId}`, {
    method: 'DELETE',
  });
};

export const updateSession = async (sessionId: string, title: string): Promise<ChatSessionRead> => {
  if (!sessionId) throw new Error("Session ID is required");
  return fetchApi<ChatSessionRead>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
};

// --- Messages API ---

export const getMessages = async (sessionId: string): Promise<MessageRead[]> => {
    if (!sessionId) {
        console.warn("getMessages called without sessionId, returning empty array.");
        return []; // Return empty array if no session ID
    }
  return fetchApi<MessageRead[]>(`/sessions/${sessionId}/messages`);
};

// --- Agents API ---

interface AgentsResponse {
    agents: AgentInfo[];
}

export const getAgents = async (): Promise<AgentInfo[]> => {
    try {
        const response = await fetchApi<AgentsResponse>('/agents');
        return response.agents || [];
    } catch (error) {
        console.error("Failed to fetch agents:", error);
        return []; // Return empty array on error
    }
};
