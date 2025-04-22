import React from 'react';
import { Info } from 'lucide-react';

interface ContextIndicatorProps {
    messageId: string;
    usedContext: boolean;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
    messageId,
    usedContext
}) => {
    if (!usedContext) return null;
    
    return (
        <div 
            className="context-indicator inline-flex items-center text-muted-foreground"
            title="This response used shared context"
        >
            <Info className="h-4 w-4 mr-1" />
            <span className="sr-only">Used shared context</span>
        </div>
    );
};
