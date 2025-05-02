import { FC } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { cn } from '../../lib/utils';
import type { MarkdownRendererProps } from './markdown-renderer.d';

export const MarkdownRenderer: FC<MarkdownRendererProps> = ({
  content,
  className,
  preserveWhitespace = false,
  escapeHtml = true,
  agentColors = {},
  children,
}) => {
  const contentStr = Array.isArray(content) ? content.join('\n') : String(content);
  
  // Function to highlight agent mentions in the form of @AgentName
  const highlightMentions = (text: string) => {
    if (!agentColors || Object.keys(agentColors).length === 0) {
      return text; // No agent colors provided, return text as is
    }
    
    let modifiedText = text;
    // Regex to match @AgentName mentions
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    
    // Replace mentions with styled spans
    modifiedText = text.replace(mentionRegex, (match, agentName) => {
      if (agentColors[agentName]) {
        return `<span style="color: ${agentColors[agentName]}; font-weight: 500;">${match}</span>`;
      }
      return match;
    });
    
    return modifiedText;
  };

  // Pre-process content to highlight mentions if agent colors are provided
  const processedContent = Object.keys(agentColors).length > 0 
    ? highlightMentions(contentStr)
    : contentStr;

  return (
    <div 
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        preserveWhitespace && 'whitespace-pre-wrap',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]} // GitHub Flavored Markdown support
        rehypePlugins={[
          escapeHtml ? [rehypeSanitize] : [rehypeRaw, rehypeSanitize], // Sanitize HTML content
        ]}
        components={{
          // Custom component renderers can be added here
          code: ({ className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = (props as any).inline;
            return !isInline && match ? (
              <pre className={`language-${match[1]} rounded overflow-auto p-4 bg-muted`}>
                <code className={`language-${match[1]}`} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className={cn('bg-muted px-1.5 py-0.5 rounded text-sm', className)} {...props}>
                {children}
              </code>
            );
          },
          table({ ...props }) {
            return (
              <div className="overflow-auto">
                <table className="border-collapse border border-border" {...props} />
              </div>
            );
          },
          th({ ...props }) {
            return <th className="border border-border bg-muted px-4 py-2 text-left" {...props} />;
          },
          td({ ...props }) {
            return <td className="border border-border px-4 py-2" {...props} />;
          },
          a({ ...props }) {
            return <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />;
          },
          img({ ...props }) {
            return <img className="max-w-full h-auto rounded-md my-2" {...props} />;
          },
          blockquote({ ...props }) {
            return <blockquote className="border-l-4 border-muted pl-4 italic" {...props} />;
          },
          hr({ ...props }) {
            return <hr className="my-4 border-border" {...props} />;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
      {children}
    </div>
  );
};