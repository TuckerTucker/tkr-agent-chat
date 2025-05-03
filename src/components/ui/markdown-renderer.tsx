import { FC } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { cn } from '../../lib/utils';
import type { MarkdownRendererProps } from './markdown-renderer.d';

export const MarkdownRenderer: FC<MarkdownRendererProps> = ({
  content,
  skipCodeBlocks = false,
  agentColors = {},
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

  const blocks = React.useMemo(() => {
    if (!processedContent) return [];

    return processMessage(processedContent, {
      highlightMentions: true,
      agentColors,
      preserveWhitespace: true
    });
  }, [processedContent, agentColors]);
  
  // Simple markdown renderer for headings, lists, links, etc.
  const renderBasicMarkdown = (text: string) => {
    if (!text) return '';
    
    let html = text;
    
    // Escape HTML in text (except for already processed tags)
    html = escapeHtml(html);
    
    // Headers
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
    html = html.replace(/^##### (.*$)/gm, '<h5>$1</h5>');
    html = html.replace(/^###### (.*$)/gm, '<h6>$1</h6>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Strikethrough
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    
    // Blockquotes
    html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
    
    // Unordered lists - simplified implementation
    const ulRegex = /^[\*\-] (.*)$/gm;
    if (ulRegex.test(html)) {
      let hasReplaced = false;
      const lines = html.split('\n');
      const listItems = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^[\*\-] (.*)$/);
        
        if (match) {
          hasReplaced = true;
          listItems.push(`<li>${match[1]}</li>`);
          lines[i] = '';
        }
      }
      
      if (hasReplaced) {
        html = lines.join('\n');
        html = html.replace(/\n+/g, '\n');
        const ulHtml = `<ul>${listItems.join('')}</ul>`;
        html = ulHtml + html;
      }
    }
    
    // Ordered lists - simplified implementation
    const olRegex = /^\d+\. (.*)$/gm;
    if (olRegex.test(html)) {
      let hasReplaced = false;
      const lines = html.split('\n');
      const listItems = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\d+\. (.*)$/);
        
        if (match) {
          hasReplaced = true;
          listItems.push(`<li>${match[1]}</li>`);
          lines[i] = '';
        }
      }
      
      if (hasReplaced) {
        html = lines.join('\n');
        html = html.replace(/\n+/g, '\n');
        const olHtml = `<ol>${listItems.join('')}</ol>`;
        html = olHtml + html;
      }
    }
    
    // Convert line breaks
    html = html.replace(/\n/g, '<br>');
    
    // Links with external icon and accessibility attributes
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (_, text, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer"
        class="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm transition-all"
        aria-label="${text} (opens in a new tab)">
        ${text}
        <svg class="inline-block w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
        </svg>
      </a>`;
    });
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>');
    
    return html;
  };
  
  // Render a mention with proper styling
  const renderMention = (mention: { content: string; agentName: string; color: string }) => {
    const { content, color } = mention;
    const mentionStyle = color ? { color, backgroundColor: `${color}10` } : {};
    
    return (
      <span 
        className="mention bg-primary/10 text-primary font-medium rounded px-1 mx-0.5"
        style={mentionStyle}
      >
        {content}
      </span>
    );
  };
  
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