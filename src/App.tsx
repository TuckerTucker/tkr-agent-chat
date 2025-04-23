import React, { useState } from "react";
import { ThemeProvider } from "./components/theme/theme-provider";
import { AppLayout } from "./components/ui/app-layout";
import { ErrorBoundary, ErrorMessage } from "./components/ui/error-boundary";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getAgents, getMessages, createSession, deleteSession } from "./services/api";
import webSocketService from "./services/websocket";
import { AgentInfo, ChatSessionRead, MessageRead } from "./types/api";
import chloeAvatar from "../agents/chloe/src/assets/chloe.svg";
import philConnorsAvatar from "../agents/phil_connors/src/assets/phil-connors.svg";
import userAvatar from "./assets/user-avatar.svg";
import type { APIMessage } from "./components/ui/message-list.d";

// Helper function to create UI messages with type safety
const createUIMessage = (params: APIMessage): APIMessage => params;

function App() {
  // Fetch all chat sessions
  const { data: sessions = [] } = useQuery<ChatSessionRead[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
  });

  // Fetch agents
  const { data: agents = [] } = useQuery<AgentInfo[]>({
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

  // Keep local state for messages
  const [localMessages, setLocalMessages] = useState<APIMessage[]>([]);

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

  // Select the first session by default when sessions load
  React.useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

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
        if (!isSubscribed || !packet.message) return;

        const agentMeta = agentMetadata[agentId];
        const newMessage = createUIMessage({
          id: crypto.randomUUID(),
          role: 'agent',
          content: packet.message,
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
        });

        setLocalMessages(prev => [...prev, newMessage]);
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
  }, [agentMetadata]);

  // Fetch messages for the selected session
  const { data: messages = [] } = useQuery<MessageRead[]>({
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
      
      // Use functional update to avoid dependency on localMessages
      setLocalMessages(uiMessages);
    }
  }, [messages, agentMetadata]);

  // Keep track of current conversation messages
  const currentMessages = React.useMemo(() => {
    if (!selectedSessionId) return [];
    return localMessages.filter(msg =>
      msg.id && msg.content && (msg.role === 'user' || msg.role === 'agent')
    );
  }, [localMessages, selectedSessionId]);

  // Build conversations from sessions with memoized messages
  const conversations = React.useMemo(() => sessions.map((session) => ({
    id: session.id,
    title: session.title || "Untitled Chat",
    messages: session.id === selectedSessionId ? currentMessages : [],
  })), [sessions, selectedSessionId, currentMessages]);

  // Find the current conversation object
  const currentConversation = React.useMemo(() =>
    conversations.find((conv) => conv.id === selectedSessionId) || null,
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

      setLocalMessages(prev => [...prev, userMessage]);
      await webSocketService.sendTextMessage(agentId, message);
    } catch (error) {
      console.error("Failed to send message:", error);
      setAgentStatuses(prev => ({
        ...prev,
        [agentId]: { connection: 'error', activity: 'error' }
      }));
    }
  };

  const handleCreateConversation = async () => {
    try {
      const newSession = await createSession();
      setSelectedSessionId(newSession.id);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const handleSelectConversation = (conv: { id: string }) => {
    setSelectedSessionId(conv.id);
  };

  const handleSelectAgent = (agentId: string) => {
    setCurrentAgentId(agentId);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteSession(id);
      // If the deleted session was selected, clear the selection
      if (id === selectedSessionId) {
        setSelectedSessionId(null);
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
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
          />
        </ErrorBoundary>
      </ThemeProvider>
    </TooltipPrimitive.Provider>
  );
}

export default App;
