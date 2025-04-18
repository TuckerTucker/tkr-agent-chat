import React, { useRef, forwardRef, useState } from "react";
import { cn, formatMessageTime, copyToClipboard } from "../lib/utils";
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
        "message-functions flex flex-row sm:flex-col items-center", 
        "bg-card/95 backdrop-blur-sm shadow-md", 
        "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        "transition-opacity duration-theme",
        "border border-border rounded-lg",
        "h-fit z-message-actions overflow-hidden",
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
          className="hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors relative min-w-[40px] min-h-[40px]"
        aria-label="Copy message"
        aria-pressed={isCopied}
        onClick={onCopy}
        onKeyDown={(e) => handleKeyDown(e, onCopy)}
      >
        {isCopied ? (
          <svg className="w-5 h-5 text-green-500 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        ) : (
          <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        )}
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className="hover:bg-accent text-muted-foreground transition-colors relative min-w-[40px] min-h-[40px]"
        aria-label="Download message"
        onClick={onDownload}
        onKeyDown={(e) => handleKeyDown(e, onDownload)}
      >
        <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className="hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors relative min-w-[40px] min-h-[40px]"
        aria-label={isCollapsed ? "Expand message" : "Collapse message"}
        aria-expanded={!isCollapsed}
        onClick={onToggleCollapse}
        onKeyDown={(e) => handleKeyDown(e, onToggleCollapse)}
      >
        {isCollapsed ? (
          <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        ) : (
          <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
          </svg>
        )}
      </Button>
      
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-destructive/10 text-destructive transition-colors relative min-w-[40px] min-h-[40px]"
          aria-label="Delete message"
          onClick={onDelete}
          onKeyDown={(e) => handleKeyDown(e, onDelete)}
        >
          <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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

  const handleCopyToClipboard = async () => {
    try {
      await copyToClipboard(Array.isArray(content) ? content.join('\n') : String(content));
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
          <div className="flex items-center text-xs text-muted-foreground" aria-label="Message sending">
            <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Sending</span>
          </div>
        );
      case "sent":
        return (
          <div className="flex items-center text-xs text-muted-foreground" aria-label="Message sent">
            <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span></span>
          </div>
        );
      case "delivered":
        return (
          <div className="flex items-center text-xs text-primary" aria-label="Message delivered">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Delivered</span>
          </div>
        );
      case "read":
        return (
          <div className="flex items-center text-xs text-primary" aria-label="Message read">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Read</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center text-xs text-destructive" aria-label="Message failed">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center text-xs text-muted-foreground" aria-label="Message sent">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span></span>
          </div>
        );
    }
  };

  return (
    <div 
      ref={ref} 
      className={cn(
        "message-row flex group relative",
        isUser ? "justify-end items-end" : "justify-start items-start",
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
          "message-container flex relative max-w-[85%] md:max-w-[70%]",
          isUser ? "flex-row-reverse items-end" : "flex-row items-start",
          "gap-3"
        )} 
        ref={messageRef}
      >
        {/* Avatar: left for agent, right for user */}
        {!isUser && (
          <div className="flex items-start mr-3">
            <div className="w-10 h-10 rounded-full border-2 border-background/20 shadow-lg bg-agent-avatar-bg text-agent-avatar-text flex items-center justify-center overflow-hidden ring-2 ring-agent-primary/20">
              {metadata.avatar ? (
                typeof metadata.avatar === 'string' && (metadata.avatar.startsWith('<svg') || metadata.avatar.includes('<?xml')) ? (
                  <div 
                    dangerouslySetInnerHTML={{ __html: metadata.avatar }} 
                    className="w-full h-full" 
                    style={{ filter: 'var(--avatar-filter)' }}
                  />
                ) : (
                  <img 
                    src={metadata.avatar} 
                    alt={metadata.agentName || 'Agent'} 
                    className="w-[50%] h-[50%] object-cover"
                    style={{ filter: 'var(--avatar-filter)' }}
                  />
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
        {isUser && (
          <div className="flex items-end ml-3">
            <div className="w-10 h-10 rounded-full border-2 border-background/20 shadow-lg bg-primary text-primary-foreground flex items-center justify-center overflow-hidden ring-2 ring-primary/20" aria-label="User avatar">
              {metadata.avatar ? (
                typeof metadata.avatar === 'string' && (metadata.avatar.startsWith('<svg') || metadata.avatar.includes('<?xml')) ? (
                  <div 
                    dangerouslySetInnerHTML={{ __html: metadata.avatar }} 
                    className="w-full h-full" 
                    style={{ filter: 'var(--avatar-filter)' }}
                  />
                ) : (
                  <img 
                    src={metadata.avatar} 
                    alt="User" 
                    className="w-[50%] h-[50%] object-cover"
                    style={{ filter: 'var(--avatar-filter)' }}
                  />
                )
              ) : (
                <span className="text-white font-bold text-lg">U</span>
              )}
            </div>
          </div>
        )}
        {/* Message Content Bubble */}
        <div className={cn("flex flex-col max-w-xl w-full", isUser ? 'items-end' : 'items-start')}> 
          {/* Bubble */}
          <div
            className={cn(
              "px-4 py-3 rounded-lg shadow-md relative max-w-xl w-full transition-all duration-theme",
              "backdrop-blur-sm break-words overflow-x-auto",
              isUser
                ? "bg-primary/95 text-primary-foreground rounded-tr-none ml-3 border-primary/20"
                : "bg-agent-message-bg/95 text-foreground rounded-tl-none mr-3 border-agent-message-border",
              isUser ? "self-end" : "self-start"
            )}
            style={
              !isUser && metadata?.agentColor
                ? {
                    borderLeft: `4px solid hsl(${metadata.agentColor})`,
                    background: `linear-gradient(90deg, hsl(${metadata.agentColor} / 0.10) 0%, transparent 100%)`
                  }
                : undefined
            }
          >
            {isCollapsed ? (
              <div className="message-text prose prose-sm dark:prose-invert max-w-none min-h-[1.5rem] leading-relaxed space-y-2 prose-p:my-2 prose-pre:my-2">
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
              <div className={cn(
                "message-text prose prose-sm dark:prose-invert max-w-none min-h-[1.5rem] leading-relaxed prose-p:my-2 prose-pre:my-2",
                isTyping && "typing-indicator"
              )}>
                {isTyping ? (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-current rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-current rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-current rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-sm opacity-70">Typing...</span>
                  </div>
                ) : markdown ? (
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
          
          <div className={cn(
            "message-footer flex items-center gap-1.5 mt-2 text-xs text-muted-foreground",
            isUser ? "flex-row-reverse" : "flex-row"
          )}>
            <span className="timestamp opacity-70" aria-label={`Sent at ${formatMessageTime(timestamp)}`}>
              {formatMessageTime(timestamp)}
            </span>
            {isUser && (
              <div className="message-status flex items-center">
                {renderStatus()}
              </div>
            )}
          </div>
        </div>
        
        
        <div 
          className={cn(
            "message-functions opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-theme z-message-actions sticky top-0",
            isUser
              ? "-translate-x-[calc(100%+1rem)] left-0"
              : "translate-x-[calc(100%+1rem)] right-0"
          )}
        >
          <div className="bg-card/95 rounded-lg shadow flex flex-col gap-2 p-0.5 border border-border min-w-[40px]">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyToClipboard}
              className="hover:bg-accent text-muted-foreground transition-colors relative min-w-[40px] min-h-[40px]"
              aria-label="Copy message"
            >
              {isCopied ? (
                <svg className="w-5 h-5 text-green-500 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={downloadMessage}
              className="hover:bg-accent text-muted-foreground transition-colors relative min-w-[40px] min-h-[40px]"
              aria-label="Download message"
            >
              <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hover:bg-accent text-muted-foreground transition-colors relative min-w-[40px] min-h-[40px]"
              aria-label={isCollapsed ? "Expand message" : "Collapse message"}
            >
              {isCollapsed ? (
                <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                </svg>
              )}
            </Button>
            
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="hover:bg-accent text-destructive transition-colors relative min-w-[40px] min-h-[40px]"
                aria-label="Delete message"
              >
                <svg className="w-5 h-5 absolute inset-0 m-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

Message.displayName = "Message";
