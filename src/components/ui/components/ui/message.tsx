import React, { useRef, forwardRef, useState } from "react";
import { cn, formatMessageTime, copyToClipboard as copyTextToClipboard } from "../../lib/utils";
import { Button } from "./button";
import { MarkdownRenderer } from "./markdown-renderer";
import type { MessageControlsProps, MessageProps } from './message.d';

const MessageFunctions = forwardRef<HTMLDivElement, MessageControlsProps>(({
  isCopied,
  isCollapsed,
  onCopy,
  onDownload,
  onToggleCollapse,
  onDelete,
  className,
}, ref) => {
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, action?: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action?.();
    }
  };

  return (
    <div 
      ref={ref}
      className={cn(
        "message-functions flex flex-row sm:flex-col items-center gap-2 py-2 px-2", 
        "sm:mx-2 mb-2 sm:mb-0 w-full sm:w-auto justify-center sm:justify-start",
        "bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm shadow-md",
        "opacity-0 group-hover:focus-within:opacity-100 transition-opacity duration-200",
        "border border-slate-300 dark:border-slate-600 rounded-md",
        "h-fit z-10",
        className
      )}
      aria-label="Message actions"
      role="toolbar"
      aria-orientation="horizontal"
      aria-orientation-sm="vertical" 
      tabIndex={0}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
        aria-label="Copy message"
        aria-pressed={isCopied}
        onClick={onCopy}
        onKeyDown={(e) => handleKeyDown(e, onCopy)}
      >
        {isCopied ? (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        )}
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
        aria-label="Download message"
        onClick={onDownload}
        onKeyDown={(e) => handleKeyDown(e, onDownload)}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
        aria-label={isCollapsed ? "Expand message" : "Collapse message"}
        aria-expanded={!isCollapsed}
        onClick={onToggleCollapse}
        onKeyDown={(e) => handleKeyDown(e, onToggleCollapse)}
      >
        {isCollapsed ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
          </svg>
        )}
      </Button>
      
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 text-red-500 hover:text-red-600 dark:hover:text-red-500 transition-colors focus:ring-2 focus:ring-red-500 focus:outline-none"
          aria-label="Delete message"
          onClick={onDelete}
          onKeyDown={(e) => handleKeyDown(e, onDelete)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </Button>
      )}
    </div>
  );
});

MessageFunctions.displayName = "MessageFunctions";

export const Message = forwardRef<HTMLDivElement, MessageProps>(({
  content,
  sender = "user",
  timestamp = new Date(),
  markdown = true,
  metadata = {},
  onDelete,
  onCopy,
  onDownload,
  status = "sent",
  className,
  isTyping = false,
  isError = false,
  isSystem = false
}, ref) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const isUser = sender === "user";

  const copyToClipboard = async () => {
    try {
      await copyTextToClipboard(Array.isArray(content) ? content.join('\n') : String(content));
      setIsCopied(true);
      if (onCopy) onCopy();
      
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const downloadMessage = () => {
    try {
      const agentName = isUser ? 'user' : (metadata.name ? metadata.name.toLowerCase() : 'agent');
      const fileName = `${agentName}-message-${timestamp.toISOString().replace(/:/g, '-').replace(/\..+/, '')}`;
      const fileType = markdown ? { ext: 'md', mime: 'text/markdown' } : { ext: 'txt', mime: 'text/plain' };
      const fullFilename = `${fileName}.${fileType.ext}`;
      
      const contentStr = Array.isArray(content) ? content.join('\n') : String(content);
      const blob = new Blob([contentStr], { type: fileType.mime });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fullFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      if (onDownload) onDownload();
    } catch (err) {
      console.error('Failed to download message:', err);
    }
  };

  const renderStatus = () => {
    switch (status) {
      case "sending":
        return (
          <div className="flex items-center text-xs text-gray-400" aria-label="Message sending">
            <svg className="w-3 h-3 animate-spin mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Sending</span>
          </div>
        );
      case "sent":
        return (
          <div className="flex items-center text-xs text-gray-400" aria-label="Message sent">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Sent</span>
          </div>
        );
      case "delivered":
        return (
          <div className="flex items-center text-xs text-blue-500" aria-label="Message delivered">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Delivered</span>
          </div>
        );
      case "read":
        return (
          <div className="flex items-center text-xs text-blue-600" aria-label="Message read">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Read</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center text-xs text-red-500" aria-label="Message failed">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center text-xs text-gray-400" aria-label="Message sent">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Sent</span>
          </div>
        );
    }
  };

  return (
    <div 
      ref={ref} 
      className={cn(
        "message group relative mb-6",
        {
          'is-typing': isTyping,
          'is-error': isError,
          'is-system': isSystem
        },
        className
      )}
      role="article"
      aria-label={`${isUser ? 'User' : metadata.name || 'Agent'} message ${formatMessageTime(timestamp)}`}
      data-typing={isTyping}
      data-error={isError}
      data-system={isSystem}
    >
      <div 
        className={cn(
          "message-container flex relative",
          isUser ? "justify-end" : "justify-start"
        )} 
        ref={messageRef}
      >
        {!isUser && (
          <div className="message-agent-indicator flex items-start">
            <div 
              className="agent-bar w-2 self-stretch rounded-l-md mr-2"
              style={{
                backgroundColor: metadata.agentColor ? `hsl(${metadata.agentColor})` : 'var(--agent-message-border)'
              }}
            ></div>
            
            <div 
              className="message-avatar w-6 h-6 rounded-full flex-shrink-0 mr-2 overflow-hidden border flex items-center justify-center" 
              style={{
                backgroundColor: metadata.agentColor ? `hsl(${metadata.agentColor})` : 'var(--agent-avatar-bg)',
                borderColor: 'white'
              }}
              aria-label={`${metadata.agentName || 'Agent'} avatar`}
            >
              {metadata.avatar ? (
                typeof metadata.avatar === 'string' && (metadata.avatar.startsWith('<svg') || metadata.avatar.includes('<?xml')) ? (
                  <div dangerouslySetInnerHTML={{ __html: metadata.avatar }} className="w-full h-full" />
                ) : (
                  <img src={metadata.avatar} alt={metadata.agentName || "Agent"} className="w-full h-full object-cover" />
                )
              ) : (
                metadata.agentName ? (
                  <span className="text-white font-bold text-lg">
                    {metadata.agentName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <svg className="w-full h-full text-white p-1.5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                  </svg>
                )
              )}
            </div>
          </div>
        )}
        
        <div className="message-content-wrapper flex flex-col max-w-[85%] w-full">
          {!isUser && metadata.agentName && (
            <div 
              className="agent-name text-sm font-semibold mb-2"
              style={{
                color: metadata.agentColor ? `hsl(${metadata.agentColor})` : 'var(--agent-message-border)'
              }}
            >
              {metadata.agentName}
            </div>
          )}
          
          <div 
            className={cn(
              "px-4 py-3 rounded-lg shadow-sm relative",
              isCollapsed ? "min-h-[3rem]" : "min-h-[3rem]",
              isUser 
                ? "bg-blue-500 text-white rounded-tr-none shadow-md" 
                : "bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-md",
              !isUser && metadata.agentId && "border-l-4",
              !isUser && metadata.agentId && `agent-${metadata.agentId}-message`
            )}
            style={!isUser && metadata?.agentColor ? {
              borderLeftColor: `hsl(${metadata.agentColor})`,
              backgroundColor: metadata.agentId ? 'var(--agent-message-bg)' : undefined
            } as React.CSSProperties : undefined}
          >
            {isCollapsed ? (
              <div className="message-text prose prose-sm dark:prose-invert max-w-none min-h-[1.5rem] leading-relaxed">
                {markdown ? (
                  <MarkdownRenderer 
                    content={typeof content === 'string' 
                      ? content.substring(0, 195) + "..."
                      : Array.isArray(content)
                        ? content.slice(0, 3).join('\n')
                        : String(content)
                    } 
                    agentColors={metadata.mentions?.reduce((acc: Record<string, string>, mention: { agentName: string; color: string }) => {
                      if (mention.color) {
                        acc[mention.agentName] = mention.color;
                      }
                      return acc;
                    }, {})}
                  />
                ) : (
                  <p>{typeof content === 'string' 
                    ? content.substring(0, 195) + "..." 
                    : "..."}</p>
                )}
              </div>
            ) : (
              <div className="message-text prose prose-sm dark:prose-invert max-w-none min-h-[1.5rem] leading-relaxed">
                {markdown ? (
                  <MarkdownRenderer 
                    content={content} 
                    agentColors={metadata.mentions?.reduce((acc: Record<string, string>, mention: { agentName: string; color: string }) => {
                      if (mention.color) {
                        acc[mention.agentName] = mention.color;
                      }
                      return acc;
                    }, {})}
                  />
                ) : (
                  <p>{Array.isArray(content) ? content.join('\n') : String(content)}</p>
                )}
              </div>
            )}
          </div>
          
          <div className={`message-footer flex items-center justify-between mt-2 text-xs ${isUser ? "text-right" : "text-left"} text-gray-400`}>
            <div className="message-time ml-1">
              {formatMessageTime(timestamp)}
            </div>
            
            {isUser && (
              <div className="message-status flex items-center mr-1">
                {renderStatus()}
              </div>
            )}
          </div>
        </div>
        
        {isUser && (
          <div className="message-avatar w-6 h-6 rounded-full bg-blue-500 flex-shrink-0 ml-2 overflow-hidden border border-white flex items-center justify-center" aria-label="User avatar">
            <span className="text-white font-bold text-xs">U</span>
          </div>
        )}
        
        <div 
          className={cn(
            "message-functions opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 absolute",
            isUser ? "-right-8 top-1" : "-left-8 top-1"
          )}
        >
          <div className="bg-white/90 dark:bg-slate-800/90 rounded-lg shadow-sm p-1.5 flex flex-col gap-1.5">
            <button
              onClick={copyToClipboard}
              className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
              aria-label="Copy message"
            >
              {isCopied ? (
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
              )}
            </button>
            
            <button
              onClick={downloadMessage}
              className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
              aria-label="Download message"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            </button>
            
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
              aria-label={isCollapsed ? "Expand message" : "Collapse message"}
            >
              {isCollapsed ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                </svg>
              )}
            </button>
            
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 text-red-500 dark:text-red-400 transition-colors"
                aria-label="Delete message"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

Message.displayName = "Message";
