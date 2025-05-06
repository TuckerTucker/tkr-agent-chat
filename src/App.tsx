import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ThemeProvider } from "./components/theme/theme-provider";
import { AppLayout } from "./components/ui/app-layout";
import { ErrorBoundary, ErrorMessage } from "./components/ui/error-boundary";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  getSessions, 
  getAgents, 
  getMessages, 
  createSession, 
  updateSession,
  deleteSession,
  PaginatedResponse 
} from "./services/api";
import socketService from "./services/socket-service";
import { AgentInfo, ChatSessionRead, MessageRead } from "./types/api";
import chloeAvatar from "../agents/chloe/src/assets/chloe.svg";
import philConnorsAvatar from "../agents/phil_connors/src/assets/phil-connors.svg";
import userAvatar from "./assets/user-avatar.svg";
import type { APIMessage } from "./components/ui/message-list.d";
import { NotificationProvider, useNotifications } from "./components/ui/notification-center";
import { useConnectionNotifications } from "./hooks/useConnectionNotifications";

// Connection status types
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
type AgentActivityStatus = 'idle' | 'thinking' | 'responding' | 'error';
type AgentStatusRecord = Record<string, {
  connection: ConnectionStatus;
  activity: AgentActivityStatus;
}>;

// Import agent components
import '../agents/chloe/src/components';

// Helper function to create UI messages with type safety
const createUIMessage = (params: APIMessage): APIMessage => params;

// Helper to create user message
const createUserMessage = (message: string): APIMessage => ({
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

// Helper to create agent message
const createAgentMessage = (agentId: string, message: string, agentMetadata: Record<string, AgentInfo>): APIMessage => {
  const agentMeta = agentMetadata[agentId];
  return {
    id: crypto.randomUUID(),
    role: 'agent',
    content: message,
    agentId: agentId,
    agentName: agentMeta?.name || agentId,
    timestamp: new Date().toISOString(),
    metadata: {
      agentColor: agentMeta?.color,
      avatar: agentMeta?.avatar,
      description: agentMeta?.description,
      capabilities: agentMeta?.capabilities
    },
    deliveryStatus: 'sent'
  };
};

function AppWithNotifications() {
  // Get notification functions
  const { addNotification } = useNotifications();
  // Get React Query client for cache invalidation
  const queryClient = useQueryClient();
  
  // Data fetching with React Query
  const { data: sessions = [] } = useQuery<ChatSessionRead[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 3, // Retry failed requests 3 times
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });

  const { data: agents = [] } = useQuery<AgentInfo[]>({
    queryKey: ["agents"],
    queryFn: getAgents,
  });

  // Derived state from queries
  const availableAgents = useMemo(() => 
    agents.map((agent) => agent.id),
    [agents]
  );

  // Local state
  const [currentAgentId, setCurrentAgentId] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatusRecord>({});
  const [localMessages, setLocalMessages] = useState<APIMessage[]>([]);

  // Refs
  const isInitialConnect = useRef(false);
  const prevMessagesRef = useRef('');
  
  // Initialize currentAgentId when agents load
  useEffect(() => {
    if (availableAgents.length > 0 && !currentAgentId) {
      setCurrentAgentId(availableAgents[0]);
    }
  }, [availableAgents, currentAgentId]);

  // Initialize agent statuses with disconnected state when agents load
  useEffect(() => {
    if (agents.length > 0) {
      const initialStatuses = agents.reduce((acc, agent) => {
        acc[agent.id] = {
          connection: 'disconnected', // Start as disconnected until we confirm connection
          activity: 'idle'
        };
        return acc;
      }, {} as AgentStatusRecord);
      
      setAgentStatuses(initialStatuses);
    }
  }, [agents]);

  // Load selectedSessionId from localStorage or select the first session
  useEffect(() => {
    const savedSessionId = localStorage.getItem('selectedSessionId');
    
    if (savedSessionId && sessions.some(s => s.id === savedSessionId)) {
      // Use saved session if it exists in available sessions
      setSelectedSessionId(savedSessionId);
    } else if (!selectedSessionId && sessions.length > 0) {
      // Fall back to first session if no saved session or it doesn't exist anymore
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  // Build agent metadata map with imported avatars
  const agentMetadata = useMemo(() => {
    return agents.reduce((acc, agent) => {
      acc[agent.id] = {
        ...agent,
        avatar: agent.id === "chloe" ? chloeAvatar : agent.id === "phil_connors" ? philConnorsAvatar : agent.avatar
      };
      return acc;
    }, {} as Record<string, AgentInfo>);
  }, [agents]);

  // Set up connection notifications
  useConnectionNotifications({
    agentMetadata,
    // Configure notification preferences
    showConnecting: false, // Don't show initial connecting notifications (reduces noise)
    showConnected: true,
    showDisconnected: true,
    showReconnecting: true,
    showError: true
  });

  // Socket.IO callbacks
  const handleSocketPacket = useCallback((agentId: string, packet: { 
    message?: string; 
    turn_complete?: boolean; 
    interrupted?: boolean; 
    error?: string 
  }) => {
    if (!packet.message) return;

    const newMessage = createAgentMessage(agentId, packet.message, agentMetadata);
    setLocalMessages(prev => [...prev, newMessage]);
  }, [agentMetadata]);

  const handleSocketError = useCallback((agentId: string, error: { 
    code: number; 
    message: string 
  }) => {
    console.error(`[${agentId}] Socket.IO error:`, error);
    setAgentStatuses(prev => ({
      ...prev,
      [agentId]: { connection: 'error', activity: 'error' }
    }));
  }, []);

  const handleStatusChange = useCallback((agentId: string, status: { 
    connection: ConnectionStatus; 
    activity: AgentActivityStatus 
  }) => {
    console.log(`[${agentId}] Status changed:`, status);
    setAgentStatuses(prev => ({
      ...prev,
      [agentId]: status
    }));
  }, []);
  
  // Set up Socket.IO callbacks
  useEffect(() => {
    const callbacks = {
      onPacket: handleSocketPacket,
      onError: handleSocketError,
      onStatusChange: handleStatusChange
    };

    socketService.setCallbacks(callbacks);

    return () => {
      // Clean up callbacks
      socketService.setCallbacks({
        onPacket: () => {},
        onError: () => {},
        onStatusChange: () => {}
      });
    };
  }, [handleSocketPacket, handleSocketError, handleStatusChange]);

  // Socket.IO connection management
  useEffect(() => {
    if (!selectedSessionId || !availableAgents.length) return;

    let mounted = true;
    let connectTimeout: NodeJS.Timeout | null = null;

    const attemptConnections = async () => {
      if (!mounted) return;

      // Clear any pending connection attempts
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }

      // Only attempt connections if we haven't already
      if (!isInitialConnect.current) {
        console.log(`Attempting initial connection for all agents for session ${selectedSessionId}...`);
        
        // First make sure all previous connections are properly closed
        await socketService.disconnect();
        
        // Update all agent statuses to connecting
        const updatedStatuses = { ...agentStatuses };
        availableAgents.forEach(agentId => {
          updatedStatuses[agentId] = { 
            connection: 'connecting',
            activity: 'idle' 
          };
        });
        setAgentStatuses(updatedStatuses);
        
        // Connect each agent sequentially for more reliability
        for (const agentId of availableAgents) {
          try {
            await socketService.connect({
              sessionId: selectedSessionId,
              agentId: agentId,
              forceNew: true,
              reconnect: true
            });
            
            console.log(`Connected agent ${agentId} to session ${selectedSessionId}`);
          } catch (error) {
            console.error(`Failed to connect agent ${agentId}:`, error);
            
            // Update status to error
            setAgentStatuses(prev => ({
              ...prev,
              [agentId]: { 
                connection: 'error',
                activity: 'error'
              }
            }));
          }
        }
        
        isInitialConnect.current = true;
      }
    };

    // Attempt initial connections with a slight delay
    connectTimeout = setTimeout(attemptConnections, 1000);

    // Cleanup function
    return () => {
      mounted = false;
      if (connectTimeout) {
        clearTimeout(connectTimeout);
      }
    };
  }, [selectedSessionId, availableAgents, agentStatuses]);

  // Global cleanup - only on component unmount or when navigating away
  useEffect(() => {
    // Set up beforeunload handler to clean up connections when navigating away
    const handleBeforeUnload = () => {
      console.log("Page unloading, cleaning up all connections...");
      socketService.cleanup();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Return cleanup function for component unmount
    return () => {
      console.log("Component unmounting, cleaning up all connections...");
      window.removeEventListener('beforeunload', handleBeforeUnload);
      socketService.cleanup();
      isInitialConnect.current = false;
    };
  }, []);

  // State for message pagination
  const [messagesPagination, setMessagesPagination] = useState({
    hasMore: true,
    loading: false,
    cursor: undefined as string | undefined,
    initialLoad: true
  });
  
  // Reset pagination when conversation changes
  useEffect(() => {
    // Reset pagination state when changing conversations
    setMessagesPagination({
      hasMore: true,
      loading: false,
      cursor: undefined,
      initialLoad: true
    });
  }, [selectedSessionId]);

  // Fetch messages for the selected session with pagination
  const { data: messagesData, isLoading: messagesLoading } = useQuery<MessageRead[] | PaginatedResponse<MessageRead>>({
    queryKey: ["messages", selectedSessionId, { initialLoad: messagesPagination.initialLoad }],
    queryFn: () => {
      if (!selectedSessionId) return Promise.resolve([]);
      
      console.log(`Fetching messages for session ${selectedSessionId}`);
      
      // Use pagination parameters - when initialLoad, we don't use a cursor
      return getMessages(selectedSessionId, {
        limit: 50, // Start with last 50 messages
        direction: 'desc', // Newest first
        include_pagination: true,
        cursor: messagesPagination.initialLoad ? undefined : messagesPagination.cursor
      });
    },
    enabled: !!selectedSessionId,
    staleTime: 24 * 60 * 60 * 1000, // Consider data fresh for 24 hours (prevents reload on refresh)
    gcTime: 7 * 24 * 60 * 60 * 1000, // Keep in cache for 7 days
    retry: 3, // Retry failed requests three times
  });
  
  // Extract messages from either array or paginated response
  const messages = useMemo(() => {
    if (!messagesData) return [];
    
    // If data is a paginated response
    if (Array.isArray(messagesData)) {
      return messagesData;
    } else {
      // Handle pagination metadata
      const paginationData = messagesData.pagination;
      
      // Update pagination state
      setMessagesPagination(prev => ({
        ...prev,
        hasMore: !!paginationData.prev_cursor,
        cursor: paginationData.prev_cursor || undefined,
        initialLoad: false
      }));
      
      return messagesData.items;
    }
  }, [messagesData]);

  // Update local messages when server messages change
  useEffect(() => {
    // Always reset previous message cache when session changes
    if (!selectedSessionId) {
      prevMessagesRef.current = '';
      return;
    }
    
    // Handle empty messages array case - could be a new conversation or still loading
    if (!messages.length) {
      // Only clear existing messages if we previously had messages
      if (prevMessagesRef.current !== '') {
        prevMessagesRef.current = '';
        setLocalMessages([]);
      }
      return;
    }
    
    // Create a stable representation of messages for comparison
    const messageIds = messages.map((msg: MessageRead) => msg.message_uuid).join(',');
    
    // Only update if messages have changed
    if (messageIds !== prevMessagesRef.current) {
      prevMessagesRef.current = messageIds;
      
      console.log(`Loading ${messages.length} messages for session ${selectedSessionId}`);
      
      const uiMessages = messages.map((msg: MessageRead) => createUIMessage({
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
      
      setLocalMessages(uiMessages);
    }
  }, [messages, agentMetadata, selectedSessionId]);

  // Derived state for current conversation
  const currentMessages = useMemo(() => {
    if (!selectedSessionId) return [];
    return localMessages.filter((msg) =>
      msg.id && msg.content && (msg.role === 'user' || msg.role === 'agent')
    );
  }, [localMessages, selectedSessionId]);

  const conversations = useMemo(() => sessions.map((session) => ({
    id: session.id,
    title: session.title || "Untitled Chat",
    messages: session.id === selectedSessionId ? currentMessages : [],
  })), [sessions, selectedSessionId, currentMessages]);

  const currentConversation = useMemo(() =>
    conversations.find((conv) => conv.id === selectedSessionId) || null,
    [conversations, selectedSessionId]
  );

  // Event handlers
  const handleSendMessage = useCallback(async (message: string, agentId: string) => {
    if (!selectedSessionId) {
      console.error("No session selected");
      return;
    }
    
    try {
      const userMessage = createUserMessage(message);
      setLocalMessages(prev => [...prev, userMessage]);
      
      // Set agent activity to "thinking" while waiting for response
      setAgentStatuses(prev => ({
        ...prev,
        [agentId]: { 
          ...prev[agentId],
          activity: 'thinking' 
        }
      }));
      
      await socketService.sendTextMessage(agentId, message);
    } catch (error) {
      console.error("Failed to send message:", error);
      setAgentStatuses(prev => ({
        ...prev,
        [agentId]: { connection: 'error', activity: 'error' }
      }));
    }
  }, [selectedSessionId]);

  const handleCreateConversation = useCallback(async () => {
    try {
      const newSession = await createSession();
      setSelectedSessionId(newSession.id);
      
      // Reset Socket.IO connections for new session
      isInitialConnect.current = false;
      
      // Invalidate the sessions query to update the UI with the new session
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (error) {
      console.error("Failed to create conversation:", error);
      addNotification({
        type: 'error',
        message: 'Failed to create new conversation.',
        duration: 5000
      });
    }
  }, [queryClient, addNotification]);

  const handleSelectConversation = useCallback(async (conv: { id: string }) => {
    if (conv.id !== selectedSessionId) {
      try {
        // First disconnect all existing socket connections
        await socketService.disconnect();
        
        // Clear local messages for the previous session
        setLocalMessages([]);
        
        // Set new session ID
        setSelectedSessionId(conv.id);
        
        // Reset agent statuses to disconnected
        setAgentStatuses(prev => {
          const resetStatuses = { ...prev };
          Object.keys(resetStatuses).forEach(agentId => {
            resetStatuses[agentId] = {
              connection: 'disconnected',
              activity: 'idle'
            };
          });
          return resetStatuses;
        });
        
        // Reset Socket.IO connection flag when switching sessions
        isInitialConnect.current = false;
        
        console.log(`Switched to conversation: ${conv.id}`);
      } catch (error) {
        console.error("Error while switching conversations:", error);
      }
    }
  }, [selectedSessionId]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setCurrentAgentId(agentId);
  }, []);
  
  // Handler for connection retry attempts
  const handleRetryConnection = useCallback(async (agentId: string) => {
    console.log(`Attempting to reconnect agent: ${agentId}`);
    
    if (selectedSessionId) {
      setAgentStatuses(prev => ({
        ...prev,
        [agentId]: { 
          ...prev[agentId], 
          connection: 'connecting' 
        }
      }));
      
      try {
        // First disconnect to clean up any lingering state
        await socketService.disconnect();
        
        // Then reconnect with current session
        await socketService.connect({
          sessionId: selectedSessionId,
          agentId: agentId,
          forceNew: true,
          reconnect: true
        });
        
        console.log(`Reconnected agent ${agentId} to session ${selectedSessionId}`);
      } catch (error) {
        console.error(`Failed to reconnect agent ${agentId}:`, error);
        
        // Update status to error
        setAgentStatuses(prev => ({
          ...prev,
          [agentId]: { 
            connection: 'error',
            activity: 'error'
          }
        }));
      }
    }
  }, [selectedSessionId]);

  // Handler for retrying a failed message
  const handleRetryMessage = useCallback(async (messageId: string, content: string, agentId?: string) => {
    if (!selectedSessionId || !content || !agentId) {
      console.error("Cannot retry message: Missing required information");
      return;
    }

    // Find and update the message status
    setLocalMessages(prevMessages => {
      return prevMessages.map((msg: APIMessage) => {
        if (msg.id === messageId) {
          return {
            ...msg,
            isError: false,
            deliveryStatus: 'sending'
          };
        }
        return msg;
      });
    });

    try {
      // Show notification
      addNotification({
        type: 'info',
        message: `Retrying message to ${agentMetadata[agentId]?.name || agentId}...`,
        duration: 3000
      });

      // Re-send the message
      await socketService.sendTextMessage(agentId, content);
      
      // Update message to sent status (the agent's response will come through Socket.IO)
      setLocalMessages(prevMessages => {
        return prevMessages.map((msg: APIMessage) => {
          if (msg.id === messageId) {
            return {
              ...msg,
              deliveryStatus: 'sent'
            };
          }
          return msg;
        });
      });
    } catch (error) {
      console.error("Failed to retry sending message:", error);
      
      // Mark as error again
      setLocalMessages(prevMessages => {
        return prevMessages.map((msg: APIMessage) => {
          if (msg.id === messageId) {
            return {
              ...msg,
              isError: true,
              deliveryStatus: 'error'
            };
          }
          return msg;
        });
      });
      
      // Show error notification
      addNotification({
        type: 'error',
        message: 'Failed to send message. Please try again.',
        duration: 5000
      });
    }
  }, [selectedSessionId, agentMetadata, addNotification]);

  // Handler for loading more messages (older messages)
  const handleLoadMoreMessages = useCallback(async () => {
    if (!selectedSessionId || !messagesPagination.hasMore || messagesPagination.loading) {
      return;
    }
    
    // Set loading state
    setMessagesPagination(prev => ({ ...prev, loading: true }));
    
    try {
      // Load more messages with the current cursor
      const olderMessages = await getMessages(selectedSessionId, {
        limit: 30,
        direction: 'desc',
        include_pagination: true,
        cursor: messagesPagination.cursor,
      }) as PaginatedResponse<MessageRead>;
      
      // If we get results, process them
      if ('items' in olderMessages && olderMessages.items.length > 0) {
        // Merge with existing messages
        const oldMessageIds = new Set(localMessages.map((msg: APIMessage) => msg.id));
        const newItems = olderMessages.items.filter((msg: MessageRead) => !oldMessageIds.has(msg.message_uuid));
        
        // Create UI messages from the new items
        const newUIMessages = newItems.map((msg: MessageRead) => createUIMessage({
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
        
        // Add new messages to the local message state
        if (newUIMessages.length > 0) {
          setLocalMessages(prev => [...prev, ...newUIMessages]);
        }
        
        // Update pagination status
        setMessagesPagination(prev => ({
          ...prev,
          hasMore: !!olderMessages.pagination.prev_cursor,
          cursor: olderMessages.pagination.prev_cursor || undefined,
          loading: false
        }));
      } else {
        // No more messages
        setMessagesPagination(prev => ({
          ...prev,
          hasMore: false,
          loading: false
        }));
      }
    } catch (error) {
      console.error("Error loading more messages:", error);
      setMessagesPagination(prev => ({ ...prev, loading: false }));
    }
  }, [selectedSessionId, messagesPagination.cursor, messagesPagination.hasMore, messagesPagination.loading, localMessages, agentMetadata]);

  // Handle renaming a conversation
  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    if (!id) return;
    
    try {
      await updateSession(id, { title: newTitle });
      // Invalidate the sessions query to update the UI
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (error) {
      console.error("Failed to rename conversation:", error);
      // Show error notification
      addNotification({
        type: 'error',
        message: 'Failed to rename conversation.',
        duration: 5000
      });
    }
  }, [addNotification, queryClient]);

  // Handle deleting a conversation
  const handleDeleteConversation = useCallback(async (id: string) => {
    if (!id) return;
    
    try {
      await deleteSession(id);
      
      // If we're deleting the current conversation, select another one
      if (selectedSessionId === id) {
        const remainingConversations = sessions.filter(s => s.id !== id);
        if (remainingConversations.length > 0) {
          setSelectedSessionId(remainingConversations[0].id);
        } else {
          setSelectedSessionId(null);
        }
      }
      
      // Invalidate and refetch the sessions query to update the UI
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      
      // Show success notification
      addNotification({
        type: 'success',
        message: 'Conversation deleted.',
        duration: 3000
      });
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      addNotification({
        type: 'error',
        message: 'Failed to delete conversation.',
        duration: 5000
      });
    }
  }, [selectedSessionId, sessions, addNotification, queryClient]);


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
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleDeleteConversation}
            currentAgentId={currentAgentId}
            onSelectAgent={handleSelectAgent}
            onRetryConnection={handleRetryConnection}
            onRetryMessage={handleRetryMessage}
            availableAgents={availableAgents}
            agentMetadata={agentMetadata}
            agentStatuses={agentStatuses}
            onLoadMoreMessages={handleLoadMoreMessages}
            hasMoreMessages={messagesPagination.hasMore}
            isLoadingMessages={messagesPagination.loading || messagesLoading}
          />
        </ErrorBoundary>
      </ThemeProvider>
    </TooltipPrimitive.Provider>
  );
}

function App() {
  return (
    <NotificationProvider>
      <AppWithNotifications />
    </NotificationProvider>
  );
}

export default App;