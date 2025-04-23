import React, { useState, forwardRef } from 'react';
import { cn, formatTimestamp, copyToClipboard, downloadAsFile } from '../../lib/utils';
import { Button } from './button';

interface ConversationItemProps {
  conversation: {
    id: string;
    title?: string;
    messages?: Array<{
      id?: string;
      role: 'user' | 'agent';
      content: string;
      agentName?: string;
      timestamp?: string | Date;
    }>;
    updatedAt?: string | Date;
  };
  isActive?: boolean;
  onClick: (conversation: any) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

interface ConversationListProps {
  conversations: Array<{
    id: string;
    title?: string;
    messages?: Array<any>;
  }>;
  currentConversation: {
    id: string;
    title?: string;
    messages?: Array<any>;
  } | null;
  onSelectConversation: (conversation: any) => void;
  onDeleteConversation?: (id: string) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

export const ConversationItem = forwardRef<HTMLDivElement, ConversationItemProps>(({
  conversation,
  isActive,
  onClick,
  onDelete,
  className,
  ...props
}, ref) => {
  const lastMessage = conversation.messages && conversation.messages.length > 0 
    ? conversation.messages[conversation.messages.length - 1] 
    : null;
    
  const lastMessageSender = lastMessage?.role === 'user' ? 'You' : 
    (lastMessage?.agentName || 'Agent');
    
  const lastMessagePreview = lastMessage?.content 
    ? (lastMessageSender + ': ' + lastMessage.content.replace(/\n/g, ' ').substring(0, 40) + (lastMessage.content.length > 40 ? '...' : ''))
    : '';
    
  const timestamp = conversation.updatedAt 
    ? formatTimestamp(conversation.updatedAt)
    : '';
    
  const [isCopied, setIsCopied] = useState(false);

  const getFormattedContent = () => {
    const title = conversation.title || 'New conversation';
    const messages = conversation.messages || [];
    const formattedMessages = messages.map(msg => {
      const sender = msg.role === 'user' ? 'You' : (msg.agentName || 'Agent');
      return `${sender}: ${msg.content}`;
    }).join('\n\n');
    return `${title}\n\n${formattedMessages}`;
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const content = getFormattedContent();
    const success = await copyToClipboard(content);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const content = getFormattedContent();
    const timestamp = conversation.updatedAt 
      ? new Date(conversation.updatedAt).toISOString().replace(/[:.]/g, '-')
      : new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `conversation_${timestamp}.txt`;
    downloadAsFile(content, fileName);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) onDelete(conversation.id);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "p-3 border-b border-border cursor-pointer transition-colors relative group",
        isActive ? "bg-accent/20" : "hover:bg-accent/10",
        className
      )}
      onClick={() => onClick(conversation)}
      role="button"
      aria-pressed={isActive}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(conversation);
        }
      }}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 py-1">
          <h3 className="font-medium text-sm truncate">
            {conversation.title || 'New conversation'}
          </h3>
          
          {lastMessagePreview && (
            <p className="text-xs text-muted-foreground truncate mt-1">
              {lastMessagePreview}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {timestamp && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {timestamp}
            </span>
          )}
          
          <div className="hidden group-hover:flex gap-2 bg-accent/20 p-1 rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-foreground hover:text-primary hover:bg-accent/50 rounded-sm flex items-center justify-center"
              onClick={handleCopy}
              aria-label="Copy conversation"
            >
              {isCopied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-foreground hover:text-primary hover:bg-accent/50 rounded-sm flex items-center justify-center"
              onClick={handleDownload}
              aria-label="Download conversation"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Button>

            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm flex items-center justify-center"
                onClick={handleDelete}
                aria-label="Delete conversation"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ConversationItem.displayName = "ConversationItem";

export const ConversationList = forwardRef<HTMLDivElement, ConversationListProps>(({
  conversations = [],
  currentConversation = null,
  onSelectConversation,
  onDeleteConversation,
  emptyState,
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col h-full", className)}
      role="listbox"
      aria-label="Conversations"
      {...props}
    >
      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {emptyState || "No conversations yet"}
          </div>
        ) : (
          conversations.map(conversation => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={currentConversation?.id === conversation.id}
              onClick={onSelectConversation}
              onDelete={onDeleteConversation}
              className="group"
            />
          ))
        )}
      </div>
    </div>
  );
});

ConversationList.displayName = "ConversationList";
