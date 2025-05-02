import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { cn } from "../../lib/utils";
import { Message } from "./message";
import { AGENT_THEMES } from "../lib/agent-themes";
import { formatMessageWithMentions } from "../lib/message-processor";

/**
 * MessageList component for displaying a list of chat messages
 * With optimizations for handling large conversations:
 * - Virtual scrolling to only render visible messages
 * - Memoized message components
 * - Pagination support
 * - Optimized scroll handling
 */
import type { MessageListProps, APIMessage, MentionsData } from './message-list.d';

// Constants for virtualization
const DEFAULT_VISIBLE_MESSAGES = 30;
const BUFFER_MESSAGES = 10; // Extra messages to render above/below viewport
const MESSAGE_HEIGHT_ESTIMATE = 150; // Estimated average height of a message in pixels

// Memoized Message component
const MemoizedMessage = React.memo(({
  message,
  getAgentMetadata,
  onRetryMessage
}: {
  message: APIMessage;
  getAgentMetadata: (id: string) => { id: string; name: string; avatar?: string };
  onRetryMessage?: (messageId: string, content: string, agentId?: string) => void;
}) => {
  // Convert API message to component props
  const messageProps = mapMessageToProps(message, getAgentMetadata);
  const { id, sender, status, content, ...rest } = messageProps;
  
  // Handler for retry button
  const handleRetry = useCallback(() => {
    if (onRetryMessage && id) {
      onRetryMessage(id, message.content, message.agentId);
    }
  }, [onRetryMessage, id, message.content, message.agentId]);
  
  return (
    <div key={id} className="mb-2">
      <Message
        sender={sender === 'user' ? 'user' : sender === 'agent' ? 'agent' : 'system'}
        status={status === 'sending' ? 'sending' 
          : status === 'error' ? 'error'
          : status === 'delivered' ? 'delivered'
          : status === 'read' ? 'read'
          : 'sent'}
        content={content}
        onRetry={status === 'error' ? handleRetry : undefined}
        {...rest}
      />
    </div>
  );
});

MemoizedMessage.displayName = "MemoizedMessage";

// Helper function to convert API message format to component props
// Extracted outside component to prevent recreation on each render
function mapMessageToProps(message: APIMessage, getAgentMetadata: (id: string) => { id: string; name: string; avatar?: string }) {
  // Convert role to sender format expected by Message component
  const sender = message.role === 'user' ? 'user' : 'agent';
  
  // Get agent information if it's an agent message
  let agentData = {};
  if (sender === 'agent') {
    if (message.agentId) {
      // Get full agent metadata including avatar
      const agentMeta = getAgentMetadata(message.agentId);
      
      // Get agent theme colors
      const agentTheme = AGENT_THEMES[message.agentId] || AGENT_THEMES.default;
      
      // Build enhanced agent data
      agentData = {
        agentId: message.agentId,
        agentName: message.agentName || agentMeta.name,
        agentColor: agentTheme.color,
        agentAccentColor: agentTheme.accentColor,
        agentSecondary: agentTheme.secondaryColor,
        avatar: agentMeta.avatar || null,
        isPrimary: message.isPrimary === true
      };
    } else {
      // Use default theme for agent messages without an agentId
      const defaultTheme = AGENT_THEMES.default;
      agentData = {
        agentName: "Agent",
        agentColor: defaultTheme.color,
        agentAccentColor: defaultTheme.accentColor,
        agentSecondary: defaultTheme.secondaryColor,
        avatar: null,
        isPrimary: false
      };
    }
  }
  
  // Handle mentions in user messages
  let mentionsData: Partial<MentionsData> = {};
  if (sender === 'user' && message.mentions && message.mentions.length > 0) {
    // Convert mention objects to include agent colors for highlighting
    const enhancedMentions = message.mentions.map((mention: string) => {
      const agentTheme = AGENT_THEMES[mention] || AGENT_THEMES.default;
      return {
        agentName: mention,
        color: agentTheme.color
      };
    });
    
    // Process content with formatMessageWithMentions if there are mentions
    const formattedContent = formatMessageWithMentions(
      message.content, 
      message.mentions,
      {
        highlightMentions: true,
        agentColors: enhancedMentions.reduce((acc: Record<string, string>, m: { agentName: string; color: string }) => {
          acc[m.agentName] = m.color;
          return acc;
        }, {})
      }
    );
    
    mentionsData = {
      mentions: enhancedMentions,
      hasMentions: true,
      formattedContent: formattedContent
    };
  }
  
  // Build metadata for the message
  const metadata = {
    ...message.metadata || {},
    ...agentData,
    ...mentionsData,
    deliveryStatus: message.deliveryStatus || 'sent'
  };
  
  // Determine appropriate message status
  let status = 'sent';
  if (message.isTyping) {
    status = 'sending';
  } else if (message.isError) {
    status = 'error';
  } else if (message.deliveryStatus) {
    status = message.deliveryStatus.toLowerCase();
  }
  
  // Special formatting for system error messages
  const isSystemMessage = message.role === 'system';
  const messageClass = isSystemMessage ? 'system-message' : '';
  
  return {
    id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content: mentionsData.formattedContent || message.content,
    sender,
    timestamp: new Date(message.timestamp || Date.now()),
    markdown: true,
    metadata,
    status,
    isTyping: message.isTyping,
    isError: message.isError,
    isSystem: isSystemMessage,
    className: messageClass
  };
}

export const MessageList = React.forwardRef<HTMLDivElement, MessageListProps>(({
  messages = [],
  getAgentMetadata = (id: string) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), avatar: undefined }),
  onScrollTop,
  onRetryMessage,
  loading = false,
  emptyState = "No messages yet. Start a conversation!",
  className,
  ...props
}, ref) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);
  const lastScrollPositionRef = useRef<number>(0);
  const scrollRestorationPendingRef = useRef<boolean>(false);
  const isScrollingRef = useRef<boolean>(false);
  const prevMessageLengthRef = useRef<number>(0);

  // Message virtualization state
  const [visibleRange, setVisibleRange] = useState({
    start: 0,
    end: Math.min(messages.length, DEFAULT_VISIBLE_MESSAGES)
  });
  // State that gets updated from scrolling
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  
  // Only update visible range when scrolling has stopped for a short period
  // This reduces the frequency of re-renders during rapid scrolling
  const updateVisibleMessagesDebounced = useCallback(() => {
    if (!listRef.current) return;
    
    const { scrollTop, clientHeight, scrollHeight } = listRef.current;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
    
    // Update auto-scroll flag based on whether user is near bottom
    setAutoScrollEnabled(isNearBottom);
    
    // Calculate which messages should be visible
    // If we have a large number of messages, we'll only render a window of them
    if (messages.length > DEFAULT_VISIBLE_MESSAGES) {
      // Estimate which messages are visible based on scroll position
      const approxStartIndex = Math.max(0, Math.floor(scrollTop / MESSAGE_HEIGHT_ESTIMATE) - BUFFER_MESSAGES);
      const approxEndIndex = Math.min(
        messages.length,
        Math.ceil((scrollTop + clientHeight) / MESSAGE_HEIGHT_ESTIMATE) + BUFFER_MESSAGES
      );
      
      setVisibleRange({
        start: approxStartIndex,
        end: approxEndIndex
      });
    } else {
      // If we have fewer messages than our threshold, just render all of them
      setVisibleRange({ start: 0, end: messages.length });
    }
    
    // Store scroll position for potential restoration
    lastScrollPositionRef.current = scrollTop;
  }, [messages.length]);
  
  // Cache the debounce timeout to avoid creating new timers rapidly
  const debouncedScrollUpdate = useCallback(() => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    
    setTimeout(() => {
      updateVisibleMessagesDebounced();
      isScrollingRef.current = false;
    }, 100);
  }, [updateVisibleMessagesDebounced]);

  // Handle scroll to load more messages
  useEffect(() => {
    if (!listRef.current || !onScrollTop) return;
    
    const handleScroll = () => {
      if (!listRef.current) return;
      const { scrollTop } = listRef.current;
      
      // When user scrolls near the top, trigger loading more messages
      if (scrollTop < 50 && !loading) {
        // Record that we're about to request more messages
        scrollRestorationPendingRef.current = true;
        onScrollTop();
      }
      
      // Update visible messages range (debounced)
      debouncedScrollUpdate();
    };
    
    const listElement = listRef.current;
    listElement.addEventListener('scroll', handleScroll);
    scrollListenerRef.current = handleScroll;
    
    return () => {
      if (listElement && scrollListenerRef.current) {
        listElement.removeEventListener('scroll', scrollListenerRef.current);
      }
    };
  }, [onScrollTop, loading, debouncedScrollUpdate]);
  
  // After loading more messages, we need to maintain the user's scroll position
  useEffect(() => {
    if (messages.length > prevMessageLengthRef.current && scrollRestorationPendingRef.current) {
      // New messages were loaded at the top, adjust scroll position
      requestAnimationFrame(() => {
        if (listRef.current) {
          // Calculate how many new messages were added
          const newMessagesCount = messages.length - prevMessageLengthRef.current;
          
          // Estimate height of new messages and adjust scroll
          // This keeps the same messages visible as before loading more
          const heightToAdd = newMessagesCount * MESSAGE_HEIGHT_ESTIMATE;
          listRef.current.scrollTop = lastScrollPositionRef.current + heightToAdd;
          
          // Reset flag
          scrollRestorationPendingRef.current = false;
        }
      });
    }
    
    // Update our reference to the current message count
    prevMessageLengthRef.current = messages.length;
  }, [messages.length]);

  // Auto-scroll to bottom when new messages arrive, only if already at bottom
  useEffect(() => {
    if (!listRef.current || messages.length === 0) return;

    // Only auto-scroll if enabled (user is already at bottom)
    if (autoScrollEnabled) {
      const timeoutId = setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [messages, autoScrollEnabled]);

  // Compute visible messages
  const visibleMessages = useMemo(() => {
    // If message count is below threshold, just render all
    if (messages.length <= DEFAULT_VISIBLE_MESSAGES) {
      return messages;
    }
    
    // Otherwise, only render messages in the visible range
    return messages.slice(visibleRange.start, visibleRange.end);
  }, [messages, visibleRange]);
  
  // Calculate spacer heights to maintain scroll position
  const topSpacerHeight = visibleRange.start * MESSAGE_HEIGHT_ESTIMATE;
  const bottomSpacerHeight = (messages.length - visibleRange.end) * MESSAGE_HEIGHT_ESTIMATE;

  // Initializing visible range when messages change drastically
  useEffect(() => {
    // Only update if this is a new conversation or first load
    if (messages.length > 0 && visibleRange.end === 0) {
      setVisibleRange({
        start: 0,
        end: Math.min(messages.length, DEFAULT_VISIBLE_MESSAGES)
      });
    }
  }, [messages.length, visibleRange.end]);

  return (
    <div
      ref={(node) => {
        // Merge refs
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
        listRef.current = node;
      }}
      className={cn(
        "message-list flex flex-col overflow-y-auto h-full w-full min-h-0 px-4 sm:px-6 py-6 gap-8 bg-background",
        className
      )}
      role="log"
      aria-live="polite"
      aria-label="Conversation messages"
      tabIndex={0}
      {...props}
    >
      {/* Loading indicator */}
      {loading && (
        <div className="flex justify-center py-6" aria-live="polite" aria-busy="true">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center space-x-2">
              <div className="h-3 w-3 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-3 w-3 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-3 w-3 bg-primary/60 rounded-full animate-bounce"></div>
            </div>
            <span className="text-sm text-muted-foreground">Loading messages...</span>
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {messages.length === 0 && !loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="text-4xl">💬</div>
            <div className="text-muted-foreground">{emptyState}</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col space-y-8 relative w-full">
          {/* Top spacer for virtualization */}
          {topSpacerHeight > 0 && (
            <div 
              style={{ height: topSpacerHeight }} 
              className="message-list-spacer-top shrink-0"
              aria-hidden="true"
            />
          )}
          
          {/* Visible messages */}
          {visibleMessages.map((message) => (
            <MemoizedMessage
              key={message.id || `msg-${visibleMessages.indexOf(message)}`}
              message={message}
              getAgentMetadata={getAgentMetadata}
              onRetryMessage={onRetryMessage}
            />
          ))}
          
          {/* Bottom spacer for virtualization */}
          {bottomSpacerHeight > 0 && (
            <div 
              style={{ height: bottomSpacerHeight }} 
              className="message-list-spacer-bottom shrink-0"
              aria-hidden="true"
            />
          )}
          
          {/* Scroll to bottom button, shown when not at bottom */}
          {!autoScrollEnabled && messages.length > 8 && (
            <button
              className="scroll-to-bottom-button fixed bottom-20 right-10 bg-primary text-primary-foreground rounded-full p-3 shadow-md hover:bg-primary/90 transition-opacity z-10"
              onClick={() => {
                if (listRef.current) {
                  listRef.current.scrollTop = listRef.current.scrollHeight;
                  setAutoScrollEnabled(true);
                }
              }}
              aria-label="Scroll to latest messages"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
});

MessageList.displayName = "MessageList";