/**
 * API Service
 *
 * Contains functions for interacting with the backend REST API endpoints.
 */

import { ChatSessionRead, MessageRead, AgentInfo } from '@/types/api'; // Assuming types are defined here

const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1` : 'http://localhost:8000/api/v1';

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

/**
 * Update a chat session (e.g. rename it)
 * @param sessionId Session ID to update
 * @param updates Object containing fields to update (currently only title)
 * @returns Promise with updated session data
 */
export const updateSession = async (
  sessionId: string, 
  updates: { title: string }
): Promise<ChatSessionRead> => {
  if (!sessionId) throw new Error("Session ID is required");
  return fetchApi<ChatSessionRead>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

/**
 * Delete a chat session
 * @param sessionId Session ID to delete
 * @returns Promise that resolves when deletion is complete
 */
export const deleteSession = async (sessionId: string): Promise<void> => {
  if (!sessionId) throw new Error("Session ID is required");
  return fetchApi<void>(`/sessions/${sessionId}`, {
    method: 'DELETE',
  });
};

// --- Messages API ---

// Interface for pagination parameters
export interface MessagePaginationParams {
  skip?: number;
  limit?: number; 
  cursor?: string;
  direction?: 'asc' | 'desc'; // asc = oldest first, desc = newest first
  include_pagination?: boolean;
  include_total?: boolean;
}

// Interface for paginated response
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    limit: number;
    direction: string;
    skip?: number;
    cursor?: string;
    total?: number;
    next_cursor?: string;
    prev_cursor?: string;
  };
}

/**
 * Get messages for a session with pagination support
 * @param sessionId Session ID to get messages for
 * @param paginationParams Optional pagination parameters
 * @returns Promise with messages or paginated response
 */
export const getMessages = async (
  sessionId: string, 
  paginationParams?: MessagePaginationParams
): Promise<MessageRead[] | PaginatedResponse<MessageRead>> => {
    if (!sessionId) {
        console.warn("getMessages called without sessionId, returning empty array.");
        return []; // Return empty array if no session ID
    }
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    
    if (paginationParams) {
      if (paginationParams.skip !== undefined) 
        queryParams.append('skip', paginationParams.skip.toString());
      
      if (paginationParams.limit !== undefined) 
        queryParams.append('limit', paginationParams.limit.toString());
      
      if (paginationParams.cursor) 
        queryParams.append('cursor', paginationParams.cursor);
      
      if (paginationParams.direction) 
        queryParams.append('direction', paginationParams.direction);
      
      if (paginationParams.include_pagination) 
        queryParams.append('include_pagination', 'true');
      
      if (paginationParams.include_total) 
        queryParams.append('include_total', 'true');
    }
    
    // Build URL with query parameters
    const queryString = queryParams.toString();
    const url = `/sessions/${sessionId}/messages${queryString ? `?${queryString}` : ''}`;
    
    // Make the API request
    return fetchApi<MessageRead[] | PaginatedResponse<MessageRead>>(url);
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
