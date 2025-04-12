import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getMessages, getAgents } from '@/services/api';
import webSocketService from '@/services/websocket';
import { Message, MessagePart, AgentInfo, MessageRead } from '@/types/api'; // Use MessageRead for fetched data

// --- Helper Components (Mostly Unchanged, but AgentMessage needs prop) ---

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

  // State for messages currently being streamed via WebSocket
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
    if (!activeSessionId) return; // Don't setup if no active session

    const handlePacket = (agentId: string, packet: any) => {
      console.log(`[WS Packet] Agent ${agentId}:`, packet);
      const hasMessageContent = typeof packet.message === 'string' && packet.message.length > 0;
      const isFinalChunk = packet.turn_complete === true;

      setStreamingMessages(prev => {
        const currentStream = prev[agentId];
        let newStream = { ...prev }; // Copy previous state

        if (hasMessageContent) {
          if (!currentStream || isFinalChunk) {
            // Start new streaming message or replace completed one
            newStream[agentId] = {
              id: `stream_${agentId}_${Date.now()}`, // Temporary unique ID for streaming
              type: 'agent',
              agent_id: agentId,
              session_id: activeSessionId,
              parts: [{ type: 'text', content: packet.message }],
              metadata: { timestamp: new Date().toISOString(), streaming: !isFinalChunk }
            };
          } else {
            // Append to existing streaming message
            newStream[agentId] = {
              ...currentStream,
              parts: [{ ...currentStream.parts[0], content: currentStream.parts[0].content + packet.message }],
              metadata: { ...currentStream.metadata, timestamp: new Date().toISOString(), streaming: !isFinalChunk }
            };
          }
        } else if (currentStream && isFinalChunk) {
           // Final chunk signal without content, just mark existing as not streaming
           newStream[agentId] = {
               ...currentStream,
               metadata: { ...currentStream.metadata, streaming: false }
           };
        }

        // If it's the final chunk for this agent, remove from streaming state
        // and invalidate the query to fetch the persisted message list
        if (isFinalChunk) {
          delete newStream[agentId]; // Remove from local streaming state
          console.log(`[WS] Turn complete for ${agentId}. Invalidating messages query.`);
          queryClient.invalidateQueries({ queryKey: ['messages', activeSessionId] });
        }

        return newStream;
      });
    };

    const handleError = (agentId: string, error: any) => {
        console.error(`[WS Error] Agent ${agentId}:`, error);
        // TODO: Display error to user (maybe add to a separate error state?)
        // Clear any streaming message for this agent on error
        setStreamingMessages(prev => {
            const newState = { ...prev };
            delete newState[agentId];
            return newState;
        });
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


  // Combine fetched messages and currently streaming messages
  const allMessages = [
    ...fetchedMessages,
    ...Object.values(streamingMessages)
  ].sort((a, b) => {
      const dateA = new Date(a.metadata?.timestamp || ('created_at' in a ? a.created_at : 0));
      const dateB = new Date(b.metadata?.timestamp || ('created_at' in b ? b.created_at : 0));
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
        const messageKey = ('message_uuid' in message ? message.message_uuid : message.id); // Use DB uuid or streaming ID

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
