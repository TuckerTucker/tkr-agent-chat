import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface SharedContext {
    id: string;
    session_id: string | null;
    source_agent_id: string;
    target_agent_id: string;
    context_type: 'full' | 'relevant' | 'summary';
    content: any;
    metadata: Record<string, any>;
    created_at: string;
    expires_at: string | null;
}

interface ShareContextRequest {
    source_agent_id: string;
    target_agent_id: string;
    context_data: any;
    session_id?: string;
    context_type?: string;
    ttl_minutes?: number;
}

export const contextApi = {
    shareContext: async (request: ShareContextRequest): Promise<SharedContext> => {
        const response = await fetch('/api/v1/context/share', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
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
        query: string,
        sessionId?: string,
        sourceAgentId?: string
    ): Promise<SharedContext[]> => {
        const params = new URLSearchParams();
        params.append('query', query);
        if (sessionId) params.append('session_id', sessionId);
        if (sourceAgentId) params.append('source_agent_id', sourceAgentId);
        
        const response = await fetch(
            `/api/v1/context/${targetAgentId}/filter?${params.toString()}`,
            { method: 'POST' }
        );
        
        if (!response.ok) {
            throw new Error('Failed to filter context');
        }
        
        return response.json();
    }
};

// React Query hooks
export const useSharedContext = (
    targetAgentId: string,
    sessionId?: string,
    sourceAgentId?: string
) => {
    return useQuery({
        queryKey: ['context', targetAgentId, sessionId, sourceAgentId],
        queryFn: () => contextApi.getContext(targetAgentId, sessionId, sourceAgentId),
        enabled: !!targetAgentId,
        refetchInterval: 60000
    });
};

export const useShareContext = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: (request: ShareContextRequest) => contextApi.shareContext(request),
        onSuccess: (data: SharedContext) => {
            queryClient.invalidateQueries({
                queryKey: ['context', data.target_agent_id, data.session_id]
            });
        }
    });
};

export const useFilterContext = (
    targetAgentId: string,
    sessionId?: string,
    sourceAgentId?: string
) => {
    return useMutation({
        mutationFn: (query: string) => contextApi.filterContext(
            targetAgentId,
            query,
            sessionId,
            sourceAgentId
        )
    });
};
