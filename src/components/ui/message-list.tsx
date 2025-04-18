import React, { useRef, useEffect } from "react";
import { cn } from "../../lib/utils";
import { Message } from "./message";
import { AGENT_THEMES } from "../lib/agent-themes";
import { formatMessageWithMentions } from "../lib/message-processor";

/**
 * MessageList component for displaying a list of chat messages
 * @param {Object} props - Component props
 * @param {Array} props.messages - Array of message objects
 * @param {Function} [props.getAgentMetadata] - Function to get agent metadata by ID
 * @param {Function} [props.onScrollTop] - Callback when user scrolls to top (for loading more messages)
 * @param {Boolean} [props.loading] - Whether more messages are being loaded
 * @param {String} [props.emptyState] - Text to display when there are no messages
 * @returns {JSX.Element} MessageList component
 */
import type { MessageListProps } from './message-list.d';

export const MessageList = React.forwardRef<HTMLDivElement, MessageListProps>(({
  messages = [],
  getAgentMetadata = (id: string) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), avatar: undefined }),
  onScrollTop,
  loading = false,
  emptyState = "No messages yet. Start a conversation!",
  className,
  ...props
}, ref) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);

  // Handle scroll to load more messages
  useEffect(() => {
    if (!listRef.current || !onScrollTop) return;
    
    const handleScroll = () => {
      if (!listRef.current) return;
      const { scrollTop } = listRef.current;
      
      // When user scrolls near the top, trigger loading more messages
      if (scrollTop < 50 && !loading) {
        onScrollTop();
      }
    };
    
    const listElement = listRef.current;
    listElement.addEventListener('scroll', handleScroll);
    scrollListenerRef.current = handleScroll;
    
    return () => {
      if (listElement && scrollListenerRef.current) {
        listElement.removeEventListener('scroll', scrollListenerRef.current);
      }
    };
  }, [onScrollTop, loading]);

  // Auto-scroll to bottom when new messages arrive, with debounce
  useEffect(() => {
    if (!listRef.current || messages.length === 0) return;

    // Only auto-scroll if already at or near the bottom
    const { scrollHeight, clientHeight, scrollTop } = listRef.current;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 200;
    
    if (isNearBottom) {
      const timeoutId = setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [messages]);

  // Map API message format to component props
  interface MessageData {
    id?: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    agentId?: string;
    agentName?: string;
    mentions?: string[];
    metadata?: Record<string, any>;
    timestamp?: string | number;
    isTyping?: boolean;
    isError?: boolean;
    isPrimary?: boolean;
    deliveryStatus?: string;
  }

  interface MentionsData {
    mentions?: Array<{ agentName: string; color: string }>;
    hasMentions?: boolean;
    formattedContent?: string;
  }

  const mapMessageToProps = (message: MessageData) => {
    // Convert role to sender format expected by Message component
    const sender = message.role === 'user' ? 'user' : 'agent';
    
    // Get agent information if it's an agent message
    let agentData = {};
    if (sender === 'agent' && message.agentId) {
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
    }
    
    // Handle mentions in user messages
    let mentionsData: MentionsData = {};
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
      id: message.id,
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
  };

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
        /* Message list */
        <div className="flex flex-col space-y-8">
          {messages.map((message, index) => {
            const messageProps = mapMessageToProps(message);
            const { id, sender, status, ...rest } = messageProps;
            return (
              <div key={id || `message-${index}`} className="mb-2">
                <Message
                  sender={sender === 'user' ? 'user' : sender === 'agent' ? 'agent' : 'system'}
                  status={status === 'sending' ? 'sending' 
                    : status === 'error' ? 'error'
                    : status === 'delivered' ? 'delivered'
                    : status === 'read' ? 'read'
                    : 'sent'}
                  {...rest}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

MessageList.displayName = "MessageList";
