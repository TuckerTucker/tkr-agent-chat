import React from 'react';
import { Clock, Edit, RefreshCw, AlertCircle } from 'lucide-react';
import { useSharedContext, useUpdateContext, useExtendContextTTL } from '../../services/context';
import type { SharedContext } from '../../services/context';

interface ContextViewerProps {
    agentId: string;
    sessionId: string;
    onError?: (error: Error) => void;
}

export const ContextViewer: React.FC<ContextViewerProps> = ({
    agentId,
    sessionId,
    onError
}) => {
    const { data: contexts, isLoading, error } = useSharedContext(agentId, sessionId);
    const updateContext = useUpdateContext();
    const extendTTL = useExtendContextTTL();

    // Handle errors
    React.useEffect(() => {
        if (error) onError?.(error as Error);
    }, [error, onError]);

    const handleExtendTTL = async (contextId: string) => {
        try {
            await extendTTL.mutateAsync({ contextId, minutes: 30 });
        } catch (err) {
            onError?.(err as Error);
        }
    };

    const handleUpdateContext = async (context: SharedContext, updates: any) => {
        try {
            await updateContext.mutateAsync({
                contextId: context.id,
                updates: {
                    ...updates,
                    metadata: {
                        ...context.metadata,
                        updated_at: new Date().toISOString()
                    }
                }
            });
        } catch (err) {
            onError?.(err as Error);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4" role="status" aria-label="Loading contexts...">
                <div className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="sr-only">Loading contexts...</span>
            </div>
        );
    }

    if (!contexts?.length) {
        return (
            <div className="text-sm text-muted-foreground p-4 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>No shared context available</span>
            </div>
        );
    }

    return (
        <div className="context-viewer space-y-4 p-4">
            <h3 className="text-sm font-medium flex items-center justify-between">
                <span>Available Context</span>
                <span className="text-xs text-muted-foreground">
                    {contexts.length} items
                </span>
            </h3>
            <div className="space-y-2">
                {contexts.map(context => (
                    <div
                        key={context.id}
                        className="context-item rounded-lg border bg-card p-4 relative group"
                    >
                        <div className="context-header flex items-center justify-between text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-2">
                                <span>From: {context.source_agent_id}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                                    {context.context_type}
                                </span>
                            </div>
                            {context.relevance_score !== undefined && (
                                <span className="text-xs">
                                    Relevance: {Math.round(context.relevance_score * 100)}%
                                </span>
                            )}
                        </div>
                        <div className="context-content text-sm">
                            <pre className="whitespace-pre-wrap overflow-auto max-h-48">
                                {JSON.stringify(context.content, null, 2)}
                            </pre>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {context.expires_at ? (
                                    <span>Expires: {new Date(context.expires_at).toLocaleString()}</span>
                                ) : (
                                    <span>Never expires</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {context.expires_at && (
                                    <button
                                        onClick={() => handleExtendTTL(context.id)}
                                        className="p-1 hover:text-primary"
                                        title="Extend TTL by 30 minutes"
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleUpdateContext(context, { content: context.content })}
                                    className="p-1 hover:text-primary"
                                    title="Edit context"
                                >
                                    <Edit className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
