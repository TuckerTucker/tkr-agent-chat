import React from 'react';
import { Info, Link, ExternalLink } from 'lucide-react';

interface ContextIndicatorProps {
    usedContext: boolean;
    contextCount?: number;
    relevanceScore?: number;
    onViewContext?: () => void;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
    usedContext,
    contextCount = 0,
    relevanceScore,
    onViewContext
}) => {
    if (!usedContext) return null;

    const formattedScore = relevanceScore !== undefined 
        ? `${Math.round(relevanceScore * 100)}%`
        : undefined;

    return (
        <div className="context-indicator inline-flex items-center gap-2 text-muted-foreground group">
            <div
                className="inline-flex items-center"
                title={`Used ${contextCount} shared context${contextCount !== 1 ? 's' : ''}`}
            >
                <Info className="h-4 w-4 mr-1" />
                <span className="text-xs">
                    {contextCount} context{contextCount !== 1 ? 's' : ''}
                </span>
            </div>

            {formattedScore && (
                <div
                    className="inline-flex items-center"
                    title="Average relevance score"
                >
                    <Link className="h-4 w-4 mr-1" />
                    <span className="text-xs">{formattedScore} relevant</span>
                </div>
            )}

            {onViewContext && (
                <button
                    onClick={onViewContext}
                    className="inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                    title="View used context"
                >
                    <ExternalLink className="h-3 w-3" />
                    <span className="sr-only">View context</span>
                </button>
            )}
        </div>
    );
};
