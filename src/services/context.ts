import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import websocketService, { WebSocketCallbacks, A2AMessage } from './websocket';

export interface SharedContext {
    id: string;
    session_id: string | null;
    source_agent_id: string;
    target_agent_id: string;
    context_type: 'full' | 'relevant' | 'summary';
    content: any;
    metadata: Record<string, any>;
    created_at: string;
    expires_at: string | null;
    relevance_score?: number;
}

export interface ShareContextRequest {
    source_agent_id: string;
    target_agent_id: string;
    context_data: any;
    session_id?: string;
    context_type?: 'full' | 'relevant' | 'summary';
    ttl_minutes?: number;
}

export interface UpdateContextRequest {
    content?: any;
    context_type?: 'full' | 'relevant' | 'summary';
    ttl_minutes?: number;
    metadata?: Record<string, any>;
}

export interface FilterContextRequest {
    query: string;
    min_score?: number;
    session_id?: string;
    source_agent_id?: string;
}

export const contextApi = {
    shareContext: async (request: ShareContextRequest): Promise<SharedContext> => {
        const response = await fetch('/api/v1/context/share', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error('Failed to share context');
        }

        return response.json();
    },

    getContext: async (
        targetAgentId: string,
        sessionId?: string,
        sourceAgentId?: string
    ): Promise<SharedContext[]> => {
        const params = new URLSearchParams();
        if (sessionId) params.append('session_id', sessionId);
        if (sourceAgentId) params.append('source_agent_id', sourceAgentId);

        const response = await fetch(
            `/api/v1/context/${targetAgentId}?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error('Failed to get context');
        }

        return response.json();
    },

    filterContext: async (
        targetAgentId: string,
        request: FilterContextRequest
    ): Promise<SharedContext[]> => {
        const response = await fetch(
            `/api/v1/context/${targetAgentId}/filter`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            }
        );

        if (!response.ok) {
            throw new Error('Failed to filter context');
        }

        return response.json();
    },

    updateContext: async (
        contextId: string,
        request: UpdateContextRequest
    ): Promise<SharedContext> => {
        const response = await fetch(`/api/v1/context/${contextId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error('Failed to update context');
        }

        return response.json();
    },

    extendTTL: async (
        contextId: string,
        additionalMinutes: number
    ): Promise<SharedContext> => {
        const response = await fetch(`/api/v1/context/${contextId}/extend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ additional_minutes: additionalMinutes }),
        });

        if (!response.ok) {
            throw new Error('Failed to extend context TTL');
        }

        return response.json();
    },

    cleanupExpired: async (batchSize: number = 100): Promise<{ removed_count: number, execution_time_ms: number }> => {
        const response = await fetch(`/api/v1/context/cleanup?batch_size=${batchSize}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to cleanup expired contexts');
        }

        return response.json();
    },
};

// React Query hooks with WebSocket support
export const useSharedContext = (
    targetAgentId: string,
    sessionId?: string,
    sourceAgentId?: string
) => {
    const queryClient = useQueryClient();
    const ws = websocketService;

    // Subscribe to context updates via WebSocket callbacks
    React.useEffect(() => {
        if (!ws) return;

        const callbacks: WebSocketCallbacks = {
            onA2AMessage: (message: A2AMessage) => {
                if (message.type === 'context_update' && message.content?.target_agent_id === targetAgentId) {
                    queryClient.invalidateQueries({
                        queryKey: ['context', targetAgentId, sessionId, sourceAgentId],
                    });
                }
            }
        };

        ws.setCallbacks(callbacks);

        // Connect to A2A WebSocket for context updates
        ws.connectA2A(targetAgentId);

        return () => {
            // Reset callbacks on cleanup
            ws.setCallbacks({});
        };
    }, [ws, targetAgentId, sessionId, sourceAgentId, queryClient]);

    return useQuery({
        queryKey: ['context', targetAgentId, sessionId, sourceAgentId],
        queryFn: () => contextApi.getContext(targetAgentId, sessionId, sourceAgentId),
        enabled: !!targetAgentId,
        staleTime: 30000, // Consider data fresh for 30 seconds
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
};

export const useShareContext = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (request: ShareContextRequest) => contextApi.shareContext(request),
        onSuccess: (data: SharedContext) => {
            queryClient.invalidateQueries({
                queryKey: ['context', data.target_agent_id, data.session_id],
            });
        },
    });
};

export const useFilterContext = (
    targetAgentId: string,
    sessionId?: string,
    sourceAgentId?: string
) => {
    return useMutation({
        mutationFn: (request: FilterContextRequest) => contextApi.filterContext(
            targetAgentId,
            request
        ),
    });
};

export const useUpdateContext = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ contextId, updates }: { contextId: string, updates: UpdateContextRequest }) =>
            contextApi.updateContext(contextId, updates),
        onSuccess: (data: SharedContext) => {
            queryClient.invalidateQueries({
                queryKey: ['context', data.target_agent_id, data.session_id],
            });
        },
    });
};

export const useExtendContextTTL = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ contextId, minutes }: { contextId: string, minutes: number }) =>
            contextApi.extendTTL(contextId, minutes),
        onSuccess: (data: SharedContext) => {
            queryClient.invalidateQueries({
                queryKey: ['context', data.target_agent_id, data.session_id],
            });
        },
    });
};

export const useCleanupExpiredContexts = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (batchSize?: number) => contextApi.cleanupExpired(batchSize),
        onSuccess: () => {
            // Invalidate all context queries
            queryClient.invalidateQueries({ queryKey: ['context'] });
        },
    });
};
