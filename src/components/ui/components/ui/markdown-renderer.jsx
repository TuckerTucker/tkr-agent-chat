import React, { useState, useEffect } from "react";
import { CodeBlock } from "./code-block";
import { ToolOutput } from "./tool-output";
import { cn } from "../../lib/utils";

/**
 * MarkdownRenderer component for rendering markdown content with code highlighting, @mention formatting, and tool outputs
 * @param {Object} props - Component props
 * @param {string|Array} props.content - The markdown content to render (string or segmented array)
 * @param {boolean} [props.skipCodeBlocks=false] - Whether to skip rendering code blocks within markdown
 * @param {Object} [props.agentColors={}] - Map of agent names to their theme colors
 * @returns {JSX.Element} MarkdownRenderer component
 */
export const MarkdownRenderer = React.forwardRef(({
  content,
  skipCodeBlocks = false,
  agentColors = {},
  className,
  ...props
}, ref) => {
  const [parsedBlocks, setParsedBlocks] = useState([]);
  
  useEffect(() => {
    // Parse markdown content into blocks (text, code, mention, or tool)
    const parseMarkdown = (markdown) => {
      // If content is already a segmented array (from tool-manager or message processor)
      if (Array.isArray(markdown)) {
        const blocks = [];
        let textBuffer = '';
        
        // Process each segment
        for (const segment of markdown) {
          if (segment.type === 'mention') {
            // If we have accumulated text, add it as a block first
            if (textBuffer) {
              blocks.push({ type: 'text', content: textBuffer });
              textBuffer = '';
            }
            
            // Add the mention as its own block
            blocks.push({
              type: 'mention',
              content: segment.content,
              agentName: segment.agentName,
              color: segment.color
            });
          } else if (segment.type === 'tool') {
            // If we have accumulated text, add it as a block first
            if (textBuffer) {
              blocks.push({ type: 'text', content: textBuffer });
              textBuffer = '';
            }
            
            // Add the tool result as its own block
            blocks.push({
              type: 'tool',
              toolName: segment.toolName,
              result: segment.result,
              original: segment.original
            });
          } else {
            // For text segments, check for code blocks
            const segmentText = segment.content;
            const codeBlockRegex = /```(.*?)\n([\s\S]*?)```/g;
            let lastIndex = 0;
            let match;
            
            while ((match = codeBlockRegex.exec(segmentText)) !== null) {
              // Add text before the code block
              if (match.index > lastIndex) {
                textBuffer += segmentText.substring(lastIndex, match.index);
              }
              
              // If we have accumulated text, add it as a block
              if (textBuffer) {
                blocks.push({ type: 'text', content: textBuffer });
                textBuffer = '';
              }
              
              // Add the code block
              blocks.push({
                type: 'code',
                language: match[1].trim(),
                content: match[2].trim()
              });
              
              lastIndex = match.index + match[0].length;
            }
            
            // Add any remaining text
            if (lastIndex < segmentText.length) {
              textBuffer += segmentText.substring(lastIndex);
            }
          }
        }
        
        // Add any remaining text buffer
        if (textBuffer) {
          blocks.push({ type: 'text', content: textBuffer });
        }
        
        return blocks;
      }
      
      // Handle string content (traditional approach)
      if (!markdown || typeof markdown !== 'string') return [];
      
      const blocks = [];
      let lastIndex = 0;
      const codeBlockRegex = /```(.*?)\n([\s\S]*?)```/g;
      let match;
      
      while ((match = codeBlockRegex.exec(markdown)) !== null) {
        // Add text before the code block
        if (match.index > lastIndex) {
          blocks.push({
            type: 'text',
            content: markdown.substring(lastIndex, match.index)
          });
        }
        
        // Add the code block
        blocks.push({
          type: 'code',
          language: match[1].trim(),
          content: match[2].trim()
        });
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining text after the last code block
      if (lastIndex < markdown.length) {
        blocks.push({
          type: 'text',
          content: markdown.substring(lastIndex)
        });
      }
      
      return blocks;
    };
    
    setParsedBlocks(parseMarkdown(content));
  }, [content]);
  
  // Simple markdown renderer for headings, lists, links, etc.
  const renderBasicMarkdown = (text) => {
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
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
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
  const renderMention = (mention) => {
    const { content, agentName, color } = mention;
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
      ref={ref}
      className={cn("markdown-renderer prose prose-sm dark:prose-invert max-w-none", className)}
      role="region"
      aria-label="Formatted message content"
      {...props}
    >
      {parsedBlocks.map((block, index) => {
        if (block.type === 'text') {
          return (
            <div 
              key={`text-${index}`}
              dangerouslySetInnerHTML={{ __html: renderBasicMarkdown(block.content) }}
            />
          );
        } else if (block.type === 'mention') {
          return (
            <React.Fragment key={`mention-${index}`}>
              {renderMention(block)}
            </React.Fragment>
          );
        } else if (block.type === 'tool') {
          return (
            <div key={`tool-${index}`} className="my-3">
              <ToolOutput 
                result={block.result}
                agentColors={agentColors}
              />
            </div>
          );
        } else if (block.type === 'code' && !skipCodeBlocks) {
          return (
            <CodeBlock
              key={`code-${index}`}
              code={block.content}
              language={block.language || 'text'}
              showLineNumbers={true}
            />
          );
        } else if (block.type === 'code' && skipCodeBlocks) {
          // If skipping code blocks, render as pre/code
          return (
            <pre 
              key={`code-${index}`}
              className="bg-muted p-4 rounded-md overflow-x-auto"
            >
              <code>{block.content}</code>
            </pre>
          );
        }
        return null;
      })}
    </div>
  );
});

MarkdownRenderer.displayName = "MarkdownRenderer";

/**
 * Escape HTML special characters
 * @param {string} html - The HTML to escape
 * @returns {string} The escaped HTML
 */
function escapeHtml(html) {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return html.replace(/[&<>"']/g, m => escapeMap[m]);
}