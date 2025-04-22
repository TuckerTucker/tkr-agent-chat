import React from 'react';
import { useSharedContext } from '../../services/context';
import { Loader2 } from 'lucide-react';

interface ContextViewerProps {
    agentId: string;
    sessionId: string;
}

export const ContextViewer: React.FC<ContextViewerProps> = ({
    agentId,
    sessionId
}) => {
    const { data: contexts, isLoading } = useSharedContext(agentId, sessionId);
    
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }
    
    if (!contexts?.length) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                No shared context available
            </div>
        );
    }
    
    return (
        <div className="context-viewer space-y-4 p-4">
            <h3 className="text-sm font-medium">Available Context</h3>
            <div className="space-y-2">
                {contexts.map(context => (
                    <div 
                        key={context.id} 
                        className="context-item rounded-lg border bg-card p-4"
                    >
                        <div className="context-header flex items-center justify-between text-sm text-muted-foreground mb-2">
                            <span>From: {context.source_agent_id}</span>
                            <span>Type: {context.context_type}</span>
                        </div>
                        <div className="context-content text-sm">
                            <pre className="whitespace-pre-wrap">
                                {JSON.stringify(context.content, null, 2)}
                            </pre>
                        </div>
                        {context.expires_at && (
                            <div className="text-xs text-muted-foreground mt-2">
                                Expires: {new Date(context.expires_at).toLocaleString()}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
