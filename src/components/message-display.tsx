import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getMessages, getAgents } from '@/services/api';
import webSocketService from '@/services/websocket';
import { Message, MessagePart, AgentInfo, MessageRead } from '@/types/api'; // Use MessageRead for fetched data
import { debounce } from 'lodash-es'; // Assuming lodash is available, or implement simple debounce

// --- Helper Components (Mostly Unchanged, but AgentMessage needs prop) ---

// Simple debounce function (if lodash isn't available)
// function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
//   let timeout: ReturnType<typeof setTimeout> | null = null;
//   return (...args: Parameters<T>): void => {
//     const later = () => {
//       timeout = null;
//       func(...args);
//     };
//     if (timeout !== null) {
//       clearTimeout(timeout);
//     }
//     timeout = setTimeout(later, wait);
//   };
// }


interface MessageContentProps {
  part: MessagePart;
}

const MessageContent: React.FC<MessageContentProps> = ({ part }) => {
  // ... (Keep existing MessageContent implementation)
  switch (part.type) {
    case 'text':
      // Render potentially multi-line text correctly
      return <div className="whitespace-pre-wrap">{part.content}</div>;
    case 'file':
      return (
        <div className="italic text-gray-400">
          [File: {part.content?.name || 'Unnamed file'}]
        </div>
      );
    case 'data':
      return (
        <pre className="text-sm bg-gray-800 p-2 rounded">
          {JSON.stringify(part.content, null, 2)}
        </pre>
      );
    default:
      return <div className="text-red-500">[Unsupported content type: {part.type}]</div>;
  }
};

interface UserMessageProps {
  message: MessageRead | Message; // Can be fetched or streaming
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => (
    // Use message_uuid for fetched, id for streaming/local
  <div key={('message_uuid' in message ? message.message_uuid : message.id)} className="bg-blue-600 p-2 rounded-lg mb-2 ml-auto max-w-xs md:max-w-md text-white text-right">
    {message.parts.map((part, index) => (
      <MessageContent key={index} part={part} />
    ))}
    {/* Safely access timestamp or created_at */}
    {(message.metadata?.timestamp || ('created_at' in message && message.created_at)) && (
      <div className="text-xs text-gray-200 mt-1">
        {new Date('created_at' in message ? message.created_at! : message.metadata!.timestamp!).toLocaleTimeString()}
      </div>
    )}
  </div>
);

interface AgentMessageProps {
  message: MessageRead | Message; // Can be fetched or streaming
  agent: AgentInfo | undefined; // Pass agent info as prop
}

const AgentMessage: React.FC<AgentMessageProps> = ({ message, agent }) => {
  // Removed fetching agents from store here
  const isStreaming = message.metadata?.streaming === true;

  return (
    // Use message_uuid for fetched, id for streaming/local
    <div key={('message_uuid' in message ? message.message_uuid : message.id)} className={`bg-gray-700 p-2 rounded-lg mb-2 mr-auto max-w-xs md:max-w-md flex items-start ${isStreaming ? 'opacity-80' : ''}`}>
      <div
        className="w-6 h-6 rounded-full mr-2 flex-shrink-0"
        style={{ backgroundColor: agent?.color || 'rgb(34 197 94)' }} // Use passed agent prop
        title={agent?.name}
      />
      <div>
        {message.parts.map((part, index) => (
          <MessageContent key={index} part={part} />
        ))}
        <div className="text-xs text-gray-400 mt-1">
          {agent?.name || message.agent_id || 'Unknown Agent'}
          {/* Safely access timestamp or created_at */}
          {(message.metadata?.timestamp || ('created_at' in message && message.created_at)) && (
            <> • {new Date('created_at' in message ? message.created_at! : message.metadata!.timestamp!).toLocaleTimeString()}</>
          )}
          {isStreaming && <span className="ml-1 animate-pulse">▍</span>}
        </div>
      </div>
    </div>
  );
};

// --- System/Error Messages (Unchanged) ---
interface SystemMessageProps {
  message: MessageRead | Message;
}
const SystemMessage: React.FC<SystemMessageProps> = ({ message }) => (
    <div key={('message_uuid' in message ? message.message_uuid : message.id)} className="bg-gray-800 p-2 rounded-lg mb-2 mx-auto max-w-xs md:max-w-md text-gray-400 text-center italic">
        {message.parts.map((part, index) => (
        <MessageContent key={index} part={part} />
        ))}
    </div>
);
interface ErrorMessageProps {
  message: MessageRead | Message;
}
const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => (
    <div key={('message_uuid' in message ? message.message_uuid : message.id)} className="bg-red-900/50 p-2 rounded-lg mb-2 mx-auto max-w-xs md:max-w-md text-red-400 text-center">
        {message.parts.map((part, index) => (
        <MessageContent key={index} part={part} />
        ))}
    </div>
);


// --- Main MessageDisplay Component ---

interface MessageDisplayProps {
  activeSessionId: string | null; // Get active session from parent
}

export const MessageDisplay: React.FC<MessageDisplayProps> = ({ activeSessionId }) => {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // RE-INTRODUCE streamingMessages state
  const [streamingMessages, setStreamingMessages] = useState<Record<string, Message>>({}); // agentId -> Message

  // Fetch available agents
  const { data: availableAgents = [], error: agentsError } = useQuery<AgentInfo[]>({
    queryKey: ['agents'],
    queryFn: getAgents,
    staleTime: Infinity, // Agents list rarely changes
    refetchOnWindowFocus: false,
  });

  // Fetch message history for the active session
  const { data: fetchedMessages = [], isLoading: isLoadingMessages, error: messagesError } = useQuery<MessageRead[]>({
    queryKey: ['messages', activeSessionId], // Include activeSessionId in the key
    queryFn: () => activeSessionId ? getMessages(activeSessionId) : Promise.resolve([]),
    enabled: !!activeSessionId, // Only fetch if activeSessionId is not null
    refetchOnWindowFocus: false, // Avoid refetching messages just on focus
  });

  // Effect to handle WebSocket messages for streaming updates
  useEffect(() => {
    if (!activeSessionId) return;

    // REMOVED debouncedInvalidate

    const handlePacket = (agentId: string, packet: any) => {
      console.log(`[WS Packet] Agent ${agentId}:`, packet);
      const hasMessageContent = typeof packet.message === 'string' && packet.message.length > 0;
      // Use turn_complete to mark stream end, ignore message_saved for display logic now
      const isFinalChunk = packet.turn_complete === true;

      setStreamingMessages(prev => {
        const currentStream = prev[agentId];
        let newState = { ...prev };

        if (isFinalChunk) {
          // Mark the local stream as complete, DO NOT invalidate query
          if (currentStream) {
            newState[agentId] = {
              ...currentStream,
              // Use the final message_uuid if provided by backend (optional robustness)
              id: packet.message_uuid || currentStream.id,
              metadata: { ...currentStream.metadata, streaming: false }
            };
            console.log(`[WS] Marked stream ${agentId} as complete locally.`);
          }
        } else if (hasMessageContent) {
          // Handle content chunks: Start new or append
          if (!currentStream || !currentStream.metadata?.streaming) {
            newState[agentId] = {
              id: `stream_${agentId}_${Date.now()}`,
              type: 'agent',
              agent_id: agentId,
              session_id: activeSessionId!, // Should be valid if effect runs
              parts: [{ type: 'text', content: packet.message }],
              metadata: { timestamp: new Date().toISOString(), streaming: true }
            };
          } else {
             newState[agentId] = {
                ...currentStream,
                parts: [{ ...currentStream.parts[0], content: currentStream.parts[0].content + packet.message }],
                metadata: { ...currentStream.metadata, timestamp: new Date().toISOString() }
             };
          }
        }
        return newState;
      });
    };

    const handleError = (agentId: string, error: any) => {
        console.error(`[WS Error] Agent ${agentId}:`, error);
        // Clear the specific streaming message on error
        setStreamingMessages(prev => {
            const newState = { ...prev };
            delete newState[agentId];
            return newState;
        });
        // TODO: Display error to user
    };

    // Register WebSocket callbacks
    webSocketService.setCallbacks({
      onPacket: handlePacket,
      onError: handleError,
      // Add other handlers (onOpen, onDisconnect) if needed to show connection status
    });

    // Cleanup function
    return () => {
      // Clear callbacks or specific handlers if the service allows
      // webSocketService.setCallbacks({}); // Reset all (if appropriate)
      // Or potentially disconnect websockets if they shouldn't persist across views
      // webSocketService.disconnectAll(); // If connections are tied to this view
      console.log("MessageDisplay cleanup: Callbacks potentially cleared.");
    };

  }, [activeSessionId, queryClient]); // Rerun effect if activeSessionId changes

  // Auto-scroll to bottom
   useEffect(() => {
     const scrollElement = scrollAreaRef.current?.children[1] as HTMLDivElement | undefined; // Access the viewport div
     if (scrollElement) {
       scrollElement.scrollTop = scrollElement.scrollHeight;
     }
   }, [fetchedMessages, streamingMessages]); // Scroll when fetched or streaming messages change


  // Combine fetched messages and streaming messages (including completed ones)
  // Deduplicate, prioritizing the streaming version if IDs match
  const combinedMessages = new Map<string, MessageRead | Message>();

  // Add streaming messages first (prioritize local state)
  Object.values(streamingMessages).forEach(streamMsg => {
     // Add check for valid ID
     if (typeof streamMsg.id === 'string') {
         combinedMessages.set(streamMsg.id, streamMsg); // Use streamMsg.id (can be temp or final)
     } else {
         console.warn("Skipping streaming message with invalid id:", streamMsg);
     }
  });

  // Add fetched messages ONLY if they don't already exist from streaming state
  fetchedMessages.forEach(msg => {
    if (!combinedMessages.has(msg.message_uuid)) { // Check if key exists
        combinedMessages.set(msg.message_uuid, msg);
    }
  });

  // Convert map back to array and sort
  const allMessages = Array.from(combinedMessages.values()).sort((a, b) => {
      // Robust date extraction for sorting
      const getDateValue = (msg: MessageRead | Message): string | number => {
          // Prioritize database timestamp if available
          if ('created_at' in msg && msg.created_at) {
              return msg.created_at; // ISO string
          }
          // Otherwise use local metadata timestamp
          if (msg.metadata?.timestamp) {
              return msg.metadata.timestamp; // ISO string
          }
          // Fallback if no date is found
          return new Date(0).toISOString(); // Return epoch start as ISO string
      };
      const dateA = new Date(getDateValue(a));
      const dateB = new Date(getDateValue(b));
      // Add check for invalid dates just in case
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          console.error("Invalid date encountered during sorting:", a, b);
          return 0; // Avoid crash if dates are invalid
      }
      return dateA.getTime() - dateB.getTime();
  });


  return (
    <ScrollArea
      ref={scrollAreaRef}
      className="flex-grow p-4 overflow-y-auto" // Use ScrollArea
      aria-live="polite"
      aria-label="Chat messages"
    >
      {isLoadingMessages && (
        <div className="text-gray-500 text-center mt-8">Loading messages...</div>
      )}
      {messagesError && (
        <div className="text-red-500 text-center mt-8">Error loading messages: {messagesError.message}</div>
      )}
      {agentsError && (
         <div className="text-red-500 text-center mt-2">Error loading agent info: {agentsError.message}</div>
      )}
      {!isLoadingMessages && allMessages.length === 0 && (
        <div className="text-gray-500 text-center mt-8">No messages yet.</div>
      )}
      {allMessages.map((message) => {
        const agent = availableAgents.find(a => a.id === message.agent_id);
        // Correct key handling for mixed types
        const messageKey = ('message_uuid' in message) ? message.message_uuid : message.id;

        switch (message.type) {
          case 'user':
            return <UserMessage key={messageKey} message={message} />;
          case 'agent':
            // Pass agent info to AgentMessage
            return <AgentMessage key={messageKey} message={message} agent={agent} />;
          case 'system':
            return <SystemMessage key={messageKey} message={message} />;
          case 'error':
            return <ErrorMessage key={messageKey} message={message} />;
          default:
            console.warn("Unknown message type:", message.type);
            return null;
        }
      })}
    </ScrollArea> // Close ScrollArea
  );
};
