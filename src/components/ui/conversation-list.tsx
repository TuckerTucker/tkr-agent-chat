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
  onUpdateTitle?: (id: string, title: string) => void;
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
  onCreateConversation?: () => void;
  onDeleteConversation?: (id: string) => void;
  onUpdateTitle?: (id: string, title: string) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

export const ConversationItem = forwardRef<HTMLDivElement, ConversationItemProps>(({
  conversation,
  isActive,
  onClick,
  onDelete,
  onUpdateTitle,
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
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title || "New conversation");

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
          {isEditing ? (
            <form onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onUpdateTitle && editTitle.trim()) {
                onUpdateTitle(conversation.id, editTitle.trim());
              }
              setIsEditing(false);
            }}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                autoFocus
                onBlur={() => {
                  if (onUpdateTitle && editTitle.trim() && editTitle !== conversation.title) {
                    onUpdateTitle(conversation.id, editTitle.trim());
                  }
                  setIsEditing(false);
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditTitle(conversation.title || "New conversation");
                    setIsEditing(false);
                  }
                  e.stopPropagation();
                }}
              />
            </form>
          ) : (
            <h3 className="font-medium text-sm truncate">
              {conversation.title || 'New conversation'}
            </h3>
          )}
          
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
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-foreground hover:text-primary hover:bg-accent/50 rounded-sm flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onUpdateTitle) {
                    setIsEditing(true);
                  }
                }}
                aria-label="Edit conversation title"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
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
            </>
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
  onCreateConversation,
  onDeleteConversation,
  onUpdateTitle,
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
      {/* New conversation button */}
      <div className="p-3 border-b border-border">
        <Button
          className="w-full justify-center"
          onClick={onCreateConversation}
          aria-label="New conversation"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          New conversation
        </Button>
      </div>
      
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
              onUpdateTitle={onUpdateTitle}
              className="group"
            />
          ))
        )}
      </div>
    </div>
  );
});

ConversationList.displayName = "ConversationList";
