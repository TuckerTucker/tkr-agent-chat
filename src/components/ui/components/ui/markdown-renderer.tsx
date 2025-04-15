import React from 'react';
import { cn } from '../../lib/utils';
import type { MarkdownRendererProps } from './markdown-renderer.d';

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
  preserveWhitespace = false,
  children,
}) => {
  const contentStr = Array.isArray(content) ? content.join('\n') : String(content);

  return (
    <div 
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        preserveWhitespace && 'whitespace-pre-wrap',
        className
      )}
      dangerouslySetInnerHTML={{ 
        __html: contentStr 
      }}
    >
      {children}
    </div>
  );
};
