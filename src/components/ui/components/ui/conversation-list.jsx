import React from 'react';
import { cn, formatTimestamp } from '../../lib/utils';
import { Button } from './button';

/**
 * Single conversation item component
 * 
 * @param {Object} props - Component props
 * @param {Object} props.conversation - Conversation object
 * @param {string} props.conversation.id - Conversation ID
 * @param {string} props.conversation.title - Conversation title
 * @param {Array} props.conversation.messages - Conversation messages
 * @param {Date|string} props.conversation.updatedAt - Last update timestamp
 * @param {boolean} props.isActive - Whether this conversation is active
 * @param {Function} props.onClick - Click handler
 * @param {Function} props.onDelete - Delete handler (optional)
 * @returns {JSX.Element} ConversationItem component
 */
export const ConversationItem = React.forwardRef(({
  conversation,
  isActive,
  onClick,
  onDelete,
  className,
  ...props
}, ref) => {
  // Get last message snippet for preview
  const lastMessage = conversation.messages && conversation.messages.length > 0 
    ? conversation.messages[conversation.messages.length - 1] 
    : null;
    
  // Determine who sent the last message
  const lastMessageSender = lastMessage?.role === 'user' ? 'You' : 
    (lastMessage?.agentName || 'Agent');
    
  // Format last message content for preview (truncate if needed)
  const lastMessagePreview = lastMessage?.content 
    ? (lastMessageSender + ': ' + lastMessage.content.replace(/\n/g, ' ').substring(0, 40) + (lastMessage.content.length > 40 ? '...' : ''))
    : '';
    
  // Format timestamp
  const timestamp = conversation.updatedAt 
    ? formatTimestamp(conversation.updatedAt)
    : '';
    
  // Handle delete with click stop propagation
  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(conversation.id);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "p-3 border-b border-border cursor-pointer transition-colors",
        isActive ? "bg-accent/20" : "hover:bg-accent/10",
        className
      )}
      onClick={() => onClick(conversation)}
      role="button"
      aria-pressed={isActive}
      tabIndex="0"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(conversation);
        }
      }}
      {...props}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">
            {conversation.title || 'New conversation'}
          </h3>
          
          {lastMessagePreview && (
            <p className="text-xs text-muted-foreground truncate mt-1">
              {lastMessagePreview}
            </p>
          )}
        </div>
        
        <div className="flex flex-col items-end ml-2">
          {timestamp && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {timestamp}
            </span>
          )}
          
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-1 text-muted-foreground hover:text-destructive mt-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
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
  );
});

ConversationItem.displayName = "ConversationItem";

/**
 * Conversation list component
 * 
 * @param {Object} props - Component props
 * @param {Array} props.conversations - Array of conversation objects
 * @param {Object} props.currentConversation - Current active conversation
 * @param {Function} props.onSelectConversation - Callback when a conversation is selected
 * @param {Function} props.onCreateConversation - Callback to create a new conversation
 * @param {Function} props.onDeleteConversation - Callback to delete a conversation
 * @param {React.ReactNode} props.emptyState - Content to display when there are no conversations
 * @returns {JSX.Element} ConversationList component
 */
export const ConversationList = React.forwardRef(({
  conversations = [],
  currentConversation = null,
  onSelectConversation,
  onCreateConversation,
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
              className="group"
            />
          ))
        )}
      </div>
    </div>
  );
});

ConversationList.displayName = "ConversationList";