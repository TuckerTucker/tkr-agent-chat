import React, { useState, useReducer } from "react";
import { ThemeProvider } from "./components/theme/theme-provider";
import { AppLayout } from "./components/ui/app-layout";
import { ErrorBoundary, ErrorMessage } from "./components/ui/error-boundary";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSessions, getAgents, getMessages, createSession, deleteSession, updateSession } from "./services/api";
import webSocketService from "./services/websocket";
import { AgentInfo, ChatSessionRead, MessageRead } from "./types/api";
import chloeAvatar from "../agents/chloe/src/assets/chloe.svg";
import philConnorsAvatar from "../agents/phil_connors/src/assets/phil-connors.svg";
import userAvatar from "./assets/user-avatar.svg";
import type { APIMessage } from "./components/ui/message-list.d";

// Import agent components
import '../agents/chloe/src/components';

// Helper function to create UI messages with type safety
const createUIMessage = (params: APIMessage): APIMessage => params;

function App() {
  // Fetch all chat sessions
  const { 
    data: sessions = [], 
    isLoading: isLoadingSessions,
    isError: isSessionsError,
    error: sessionsError
  } = useQuery<ChatSessionRead[], Error, ChatSessionRead[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 3, // Retry failed requests 3 times
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });

  // Handle sessions query error
  React.useEffect(() => {
    if (isSessionsError) {
      console.error("Failed to fetch sessions:", sessionsError);
    }
  }, [isSessionsError, sessionsError]);

  // Fetch agents
  const { data: agents = [] } = useQuery<AgentInfo[], Error, AgentInfo[]>({
    queryKey: ["agents"],
    queryFn: getAgents,
  });

  // List of available agent IDs
  const availableAgents = agents.map((agent) => agent.id);

  // Track current agent (default to first agent if available)
  const [currentAgentId, setCurrentAgentId] = useState<string>(availableAgents[0] || "chloe");

  // Track selected session
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Track agent connection statuses
  const [agentStatuses, setAgentStatuses] = useState<Record<string, {
    connection: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
    activity: 'idle' | 'thinking' | 'responding' | 'error';
  }>>({});
  
  // Initialize agent statuses when agents are loaded
  React.useEffect(() => {
    if (agents.length > 0) {
      const initialStatuses = agents.reduce((acc, agent) => {
        acc[agent.id] = {
          connection: 'connected', // Set to connected by default
          activity: 'idle'
        };
        return acc;
      }, {} as Record<string, {
        connection: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
        activity: 'idle' | 'thinking' | 'responding' | 'error';
      }>);
      
      setAgentStatuses(initialStatuses);
    }
  }, [agents]);

  // Message state types
  type StreamingState = {
    id: string | null;
    content: string;
    agentId: string | null;
    agentMeta: AgentInfo | null;
  };

  type MessageState = {
    messages: APIMessage[];
    streaming: StreamingState;
  };

  type MessageAction = 
    | { type: 'START_STREAMING'; payload: { id: string; agentId: string; agentMeta: AgentInfo; content: string; } }
    | { type: 'UPDATE_STREAMING'; payload: { content: string; } }
    | { type: 'COMPLETE_STREAMING' }
    | { type: 'SET_MESSAGES'; payload: APIMessage[] }
    | { type: 'ADD_MESSAGE'; payload: APIMessage };

  // Message reducer
  const messageReducer = (state: MessageState, action: MessageAction): MessageState => {
    switch (action.type) {
      case 'START_STREAMING': {
        // Only start streaming if we're not already streaming
        if (state.streaming.id) return state;

        const { id, agentId, agentMeta, content } = action.payload;
        const newMessage = createUIMessage({
          id,
          role: 'agent',
          content,
          agentId,
          agentName: agentMeta.name || agentId,
          timestamp: new Date().toISOString(),
          metadata: {
            agentColor: agentMeta.color,
            avatar: agentMeta.avatar,
            description: agentMeta.description,
            capabilities: agentMeta.capabilities
          },
          deliveryStatus: 'sending'
        });
        
        return {
          messages: [...state.messages, newMessage],
          streaming: {
            id,
            content,
            agentId,
            agentMeta
          }
        };
      }
      
      case 'UPDATE_STREAMING': {
        if (!state.streaming.id) return state;
        
        const updatedContent = state.streaming.content + action.payload.content;
        return {
          messages: state.messages.map(msg =>
            msg.id === state.streaming.id
              ? { ...msg, content: updatedContent }
              : msg
          ),
          streaming: {
            ...state.streaming,
            content: updatedContent
          }
        };
      }
      
      case 'COMPLETE_STREAMING': {
        if (!state.streaming.id) return state;
        
        return {
          messages: state.messages.map(msg =>
            msg.id === state.streaming.id
              ? { ...msg, deliveryStatus: 'sent' }
              : msg
          ),
          streaming: {
            id: null,
            content: '',
            agentId: null,
            agentMeta: null
          }
        };
      }
      
      case 'SET_MESSAGES':
        return {
          ...state,
          messages: action.payload
        };
      
      case 'ADD_MESSAGE':
        return {
          ...state,
          messages: [...state.messages, action.payload]
        };
      
      default:
        return state;
    }
  };

  // Initialize message state with reducer
  const [messageState, dispatch] = useReducer(messageReducer, {
    messages: [],
    streaming: {
      id: null,
      content: '',
      agentId: null,
      agentMeta: null
    }
  });

  // Get React Query client for cache management
  const queryClient = useQueryClient();

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: createSession,
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setSelectedSessionId(newSession.id);
    },
    onError: (error) => {
      console.error("Failed to create conversation:", error);
    }
  });

  // Update conversation title mutation
  const updateTitleMutation = useMutation({
    mutationFn: (params: { id: string; title: string }) => updateSession(params.id, params.title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error) => {
      console.error("Failed to update conversation title:", error);
    }
  });

  // Build agent metadata map with imported avatars
  const agentMetadata = React.useMemo(() => {
    return agents.reduce((acc, agent) => {
      acc[agent.id] = {
        ...agent,
        avatar: agent.id === "chloe" ? chloeAvatar : agent.id === "phil_connors" ? philConnorsAvatar : agent.avatar
      };
      return acc;
    }, {} as Record<string, AgentInfo>);
  }, [agents]);

  // Ref to track if we've initiated conversation creation
  const hasInitiatedCreation = React.useRef(false);

  // Select the first session by default or create a new one if empty
  React.useEffect(() => {
    // Only proceed if we've finished loading and there's no error
    if (isLoadingSessions || isSessionsError) return;

    if (sessions.length > 0) {
      // If we have sessions, select the first one if none is selected
      if (!selectedSessionId) {
        setSelectedSessionId(sessions[0].id);
      }
      // Reset creation flag when we have sessions
      hasInitiatedCreation.current = false;
    } else if (!hasInitiatedCreation.current && !createConversationMutation.isPending) {
      // Create a new session only if:
      // 1. There are no sessions
      // 2. We haven't already initiated creation
      // 3. We're not currently creating a session
      hasInitiatedCreation.current = true;
      createConversationMutation.mutate(undefined);
    }
  }, [
    sessions,
    selectedSessionId,
    createConversationMutation,
    isLoadingSessions,
    isSessionsError
  ]);

  // Ref to track if initial connection has been attempted
  const isInitialConnect = React.useRef(false);

  // Effect for managing all agent connections
  React.useEffect(() => {
    if (!selectedSessionId || !availableAgents.length) return;

    let mounted = true;
    let connectTimeout: NodeJS.Timeout | null = null;

    const attemptConnections = () => {
      if (!mounted) return;

      // Clear any pending connection attempts
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }

      // Only attempt connections if we haven't already or if the session ID changed
      if (!isInitialConnect.current) {
        console.log("Attempting initial connection for all agents...");
        availableAgents.forEach(agentId => {
          webSocketService.connect(selectedSessionId, agentId);
        });
        isInitialConnect.current = true;
      }
    };

    // Attempt initial connections with a slight delay
    connectTimeout = setTimeout(attemptConnections, 1000);

    // Cleanup function - only disconnect on component unmount, not on dependency changes
    return () => {
      mounted = false;
      if (connectTimeout) {
        clearTimeout(connectTimeout);
      }
      
      // We'll only disconnect when the component is truly unmounting
      // This is handled by the React.useEffect cleanup below
    };
  }, [selectedSessionId, availableAgents]);
  
  // Separate effect for handling component unmount
  React.useEffect(() => {
    // No setup needed, this is just for cleanup on unmount
    
    return () => {
      // This cleanup only runs when the component is truly unmounting
      console.log("Component unmounting, disconnecting all agents...");
      availableAgents.forEach(agentId => {
        webSocketService.disconnect(agentId, false);
      });
      isInitialConnect.current = false;
    };
  }, []); // Empty dependency array means this only runs on mount/unmount

  // Set up WebSocket callbacks
  React.useEffect(() => {
    let isSubscribed = true;

    const callbacks = {
      onPacket: (agentId: string, packet: { message?: string; turn_complete?: boolean; interrupted?: boolean; error?: string }) => {
        if (!isSubscribed) return;

        try {
          console.log(`[${agentId}] Received packet:`, packet);

          const agentMeta = agentMetadata[agentId];
          if (!agentMeta) {
            console.error(`[${agentId}] Agent metadata not found`);
            return;
          }

          // Handle message packets
          if (packet.message) {
            // Skip if this is the final complete message
            const isCompleteMessage = packet.message.endsWith('\n') && packet.message.indexOf('\n') === packet.message.length - 1;
            if (!isCompleteMessage) {
              if (!messageState.streaming.id) {
                // Start new streaming message
                const newId = crypto.randomUUID();
                console.log(`[${agentId}] Creating new streaming message:`, newId);
                
                dispatch({
                  type: 'START_STREAMING',
                  payload: {
                    id: newId,
                    agentId,
                    agentMeta,
                    content: packet.message
                  }
                });
              } else {
                // Update existing streaming message
                console.log(`[${agentId}] Updating streaming message:`, {
                  id: messageState.streaming.id,
                  contentLength: messageState.streaming.content.length + packet.message.length
                });
                
                dispatch({
                  type: 'UPDATE_STREAMING',
                  payload: {
                    content: packet.message
                  }
                });
              }
            }
          }

          // Handle turn completion
          if (packet.turn_complete || packet.interrupted) {
            console.log(`[${agentId}] Turn complete or interrupted. StreamingId:`, messageState.streaming.id);
            
            if (messageState.streaming.id) {
              dispatch({ type: 'COMPLETE_STREAMING' });
            }
          }
        } catch (error) {
          console.error(`[${agentId}] Error processing packet:`, error);
        }
      },
      onError: (agentId: string, error: { code: number; message: string }) => {
        if (!isSubscribed) return;

        console.error(`[${agentId}] WebSocket error:`, error);
        setAgentStatuses(prev => ({
          ...prev,
          [agentId]: { connection: 'error', activity: 'error' }
        }));
      },
      onStatusChange: (agentId: string, status: { connection: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error'; activity: 'idle' | 'thinking' | 'responding' | 'error' }) => {
        if (!isSubscribed) return;

        console.log(`[${agentId}] Status changed:`, status);
        setAgentStatuses(prev => ({
          ...prev,
          [agentId]: status
        }));
      }
    };

    webSocketService.setCallbacks(callbacks);

    return () => {
      isSubscribed = false;
      webSocketService.setCallbacks({
        onPacket: () => {},
        onError: () => {},
        onStatusChange: () => {}
      });
    };
  }, [agentMetadata, messageState.streaming.id]);

  // Fetch messages for the selected session
  const { data: messages = [] } = useQuery<MessageRead[], Error, MessageRead[]>({
    queryKey: ["messages", selectedSessionId],
    queryFn: () => (selectedSessionId ? getMessages(selectedSessionId) : Promise.resolve([])),
    enabled: !!selectedSessionId,
  });

  // Ref to track previous messages to avoid unnecessary updates
  const prevMessagesRef = React.useRef('');

  // Update local messages when server messages change
  React.useEffect(() => {
    // Skip if no messages to process
    if (!messages.length) return;
    
    // Create a stable representation of messages for comparison
    const messageIds = messages.map(msg => msg.message_uuid).join(',');
    
    // Only update if messages have changed
    if (messageIds !== prevMessagesRef.current) {
      prevMessagesRef.current = messageIds;
      
      const uiMessages = messages.map(msg => createUIMessage({
        id: msg.message_uuid,
        role: msg.type === 'user' ? 'user' : 'agent',
        content: msg.parts[0]?.content || '',
        agentId: msg.agent_id,
        agentName: msg.agent_id ? (agentMetadata[msg.agent_id]?.name || msg.agent_id) : undefined,
        timestamp: msg.created_at,
        metadata: msg.type === 'user' ? {
          avatar: userAvatar,
          name: 'You'
        } : {
          ...(msg.message_metadata || {}),
          agentColor: msg.agent_id ? agentMetadata[msg.agent_id]?.color : undefined,
          avatar: msg.agent_id ? agentMetadata[msg.agent_id]?.avatar : undefined,
          description: msg.agent_id ? agentMetadata[msg.agent_id]?.description : undefined,
          capabilities: msg.agent_id ? agentMetadata[msg.agent_id]?.capabilities : undefined
        },
        deliveryStatus: 'sent'
      }));
      
      dispatch({ type: 'SET_MESSAGES', payload: uiMessages });
    }
  }, [messages, agentMetadata]);

  // Keep track of current conversation messages
  const currentMessages = React.useMemo(() => {
    if (!selectedSessionId) return [];
    return messageState.messages.filter(msg =>
      msg.id && msg.content && (msg.role === 'user' || msg.role === 'agent')
    );
  }, [messageState.messages, selectedSessionId]);

  // Build conversations from sessions with memoized messages
  const conversations = React.useMemo(() => sessions.map((session: ChatSessionRead) => ({
    id: session.id,
    title: session.title || "Untitled Chat",
    messages: session.id === selectedSessionId ? currentMessages : [],
  })), [sessions, selectedSessionId, currentMessages]);

  // Find the current conversation object
  const currentConversation = React.useMemo(() =>
    conversations.find((conv: { id: string }) => conv.id === selectedSessionId) || null,
    [conversations, selectedSessionId]
  );

  // Handlers
  const handleSendMessage = async (message: string, agentId: string) => {
    if (!selectedSessionId) {
      console.error("No session selected");
      return;
    }
    try {
      const userMessage = createUIMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        metadata: {
          avatar: userAvatar,
          name: 'You'
        },
        deliveryStatus: 'sent'
      });

      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
      await webSocketService.sendTextMessage(agentId, message);
    } catch (error) {
      console.error("Failed to send message:", error);
      setAgentStatuses(prev => ({
        ...prev,
        [agentId]: { connection: 'error', activity: 'error' }
      }));
    }
  };

  // Delete conversation mutation
  const deleteConversationMutation = useMutation<void, Error, string>({
    mutationFn: deleteSession,
    onSuccess: (_, deletedId) => {
      // Invalidate both sessions and messages queries
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["messages", deletedId] });
      if (deletedId === selectedSessionId) {
        setSelectedSessionId(null);
      }
    },
    onError: (error) => {
      console.error("Failed to delete conversation:", error);
    }
  });

  const handleCreateConversation = () => {
    createConversationMutation.mutate(undefined);
  };

  const handleSelectConversation = (conv: { id: string }) => {
    setSelectedSessionId(conv.id);
  };

  const handleSelectAgent = (agentId: string) => {
    setCurrentAgentId(agentId);
  };

  const handleDeleteConversation = (id: string) => {
    deleteConversationMutation.mutate(id);
  };

  const handleUpdateTitle = (id: string, title: string) => {
    updateTitleMutation.mutate({ id, title });
  };

  return (
    <TooltipPrimitive.Provider>
      <ThemeProvider>
        <ErrorBoundary
          fallback={
            <ErrorMessage
              title="Application Error"
              message="Something went wrong in the chat UI. Please try again."
            />
          }
        >
          <AppLayout
            conversations={conversations}
            currentConversation={currentConversation}
            onSendMessage={handleSendMessage}
            onCreateConversation={handleCreateConversation}
            onSelectConversation={handleSelectConversation}
            currentAgentId={currentAgentId}
            onSelectAgent={handleSelectAgent}
            availableAgents={availableAgents}
            agentMetadata={agentMetadata}
            agentStatuses={agentStatuses}
            onDeleteConversation={handleDeleteConversation}
            onUpdateTitle={handleUpdateTitle}
          />
        </ErrorBoundary>
      </ThemeProvider>
    </TooltipPrimitive.Provider>
  );
}

export default App;
