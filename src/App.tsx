import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ThemeProvider } from "./components/theme/theme-provider";
import { AppLayout } from "./components/ui/app-layout";
import { ErrorBoundary, ErrorMessage } from "./components/ui/error-boundary";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useQuery } from "@tanstack/react-query";
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
  
  // Data fetching with React Query
  const { data: sessions = [] } = useQuery<ChatSessionRead[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
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

  // Select the first session by default when sessions load
  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
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

  // WebSocket callbacks
  const handleWebSocketPacket = useCallback((agentId: string, packet: { 
    message?: string; 
    turn_complete?: boolean; 
    interrupted?: boolean; 
    error?: string 
  }) => {
    if (!packet.message) return;

    const newMessage = createAgentMessage(agentId, packet.message, agentMetadata);
    setLocalMessages(prev => [...prev, newMessage]);
  }, [agentMetadata]);

  const handleWebSocketError = useCallback((agentId: string, error: { 
    code: number; 
    message: string 
  }) => {
    console.error(`[${agentId}] WebSocket error:`, error);
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
  
  // Set up WebSocket callbacks
  useEffect(() => {
    const callbacks = {
      onPacket: handleWebSocketPacket,
      onError: handleWebSocketError,
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
  }, [handleWebSocketPacket, handleWebSocketError, handleStatusChange]);

  // WebSocket connection management
  useEffect(() => {
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

      // Only attempt connections if we haven't already
      if (!isInitialConnect.current) {
        console.log("Attempting initial connection for all agents...");
        availableAgents.forEach(agentId => {
          // Update status to connecting before attempting connection
          setAgentStatuses(prev => ({
            ...prev,
            [agentId]: { 
              ...prev[agentId],
              connection: 'connecting' 
            }
          }));
          socketService.connect({
            sessionId: selectedSessionId,
            agentId: agentId
          });
        });
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
  }, [selectedSessionId, availableAgents]);

  // Global cleanup - only on component unmount
  useEffect(() => {
    return () => {
      console.log("Component unmounting, cleaning up all connections...");
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
  
  // Fetch messages for the selected session with pagination
  const { data: messagesData } = useQuery<MessageRead[] | PaginatedResponse<MessageRead>>({
    queryKey: ["messages", selectedSessionId, { initialLoad: messagesPagination.initialLoad }],
    queryFn: () => {
      if (!selectedSessionId) return Promise.resolve([]);
      
      // Use pagination parameters - when initialLoad, we don't use a cursor
      return getMessages(selectedSessionId, {
        limit: 50, // Start with last 50 messages
        direction: 'desc', // Newest first
        include_pagination: true,
        cursor: messagesPagination.initialLoad ? undefined : messagesPagination.cursor
      });
    },
    enabled: !!selectedSessionId,
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
      
      setLocalMessages(uiMessages);
    }
  }, [messages, agentMetadata]);

  // Derived state for current conversation
  const currentMessages = useMemo(() => {
    if (!selectedSessionId) return [];
    return localMessages.filter(msg =>
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
      
      // Reset WebSocket connections for new session
      isInitialConnect.current = false;
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  }, []);

  const handleSelectConversation = useCallback((conv: { id: string }) => {
    if (conv.id !== selectedSessionId) {
      setSelectedSessionId(conv.id);
      // Reset WebSocket connections when switching sessions
      isInitialConnect.current = false;
    }
  }, [selectedSessionId]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setCurrentAgentId(agentId);
  }, []);
  
  // Handler for connection retry attempts
  const handleRetryConnection = useCallback((agentId: string) => {
    console.log(`Attempting to reconnect agent: ${agentId}`);
    
    if (selectedSessionId) {
      setAgentStatuses(prev => ({
        ...prev,
        [agentId]: { 
          ...prev[agentId], 
          connection: 'connecting' 
        }
      }));
      
      // First disconnect to clean up any lingering state
      socketService.disconnect();
      
      // Then reconnect with current session
      socketService.connect({
        sessionId: selectedSessionId,
        agentId: agentId
      });
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
      return prevMessages.map(msg => {
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
      
      // Update message to sent status (the agent's response will come through the WebSocket)
      setLocalMessages(prevMessages => {
        return prevMessages.map(msg => {
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
        return prevMessages.map(msg => {
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
        const oldMessageIds = new Set(localMessages.map(msg => msg.id));
        const newItems = olderMessages.items.filter(msg => !oldMessageIds.has(msg.message_uuid));
        
        // Create UI messages from the new items
        const newUIMessages = newItems.map(msg => createUIMessage({
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
      // Since we're using React Query, we should invalidate the sessions query
      // to trigger a refetch with the updated data
      // For simplicity, let's just refetch sessions directly
      await getSessions();
    } catch (error) {
      console.error("Failed to rename conversation:", error);
      // Show error notification
      addNotification({
        type: 'error',
        message: 'Failed to rename conversation.',
        duration: 5000
      });
    }
  }, [addNotification]);

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
      
      // Refetch sessions to update the list
      await getSessions();
      
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
  }, [selectedSessionId, sessions, addNotification]);

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
            isLoadingMessages={messagesPagination.loading}
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