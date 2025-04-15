import React, { useState } from "react";
import { ThemeProvider } from "./components/ui/components/theme/theme-provider";
import { AppLayout } from "./components/ui/components/ui/app-layout";
import { ErrorBoundary, ErrorMessage } from "./components/ui/components/ui/error-boundary";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getAgents, getMessages, createSession } from "./services/api";
import webSocketService from "./services/websocket";
import { AgentInfo, ChatSessionRead, MessageRead } from "./types/api";
import chloeAvatar from "../agents/chloe/src/assets/chloe.svg";
import philConnorsAvatar from "../agents/phil_connors/src/assets/phil-connors.svg";

import type { APIMessage } from "./components/ui/components/ui/message-list.d";

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
  const [agentStatuses, setAgentStatuses] = useState<Record<string, { connection: string; activity: string }>>({});

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

  // Set up WebSocket callbacks
  React.useEffect(() => {
    webSocketService.setCallbacks({
      onPacket: (agentId, packet) => {
        if (packet.message) {
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
              avatar: agentMeta?.avatar
            },
            deliveryStatus: 'sent'
          });

          setLocalMessages(prev => [...prev, newMessage]);
        }
      },
      onError: (agentId, error) => {
        console.error(`[${agentId}] WebSocket error:`, error);
        setAgentStatuses(prev => ({
          ...prev,
          [agentId]: { connection: 'error', activity: 'error' }
        }));
      },
      onStatusChange: (agentId, status) => {
        console.log(`[${agentId}] Status changed:`, status);
        setAgentStatuses(prev => ({
          ...prev,
          [agentId]: status
        }));
      }
    });

  }, [agentMetadata]);

  // Manage WebSocket connections
  React.useEffect(() => {
    if (selectedSessionId && currentAgentId) {
      webSocketService.connect(selectedSessionId, currentAgentId);
      return () => {
        webSocketService.disconnect(currentAgentId, false);
      };
    }
  }, [selectedSessionId, currentAgentId]);

  // Fetch messages for the selected session
  const { data: messages = [] } = useQuery<MessageRead[]>({
    queryKey: ["messages", selectedSessionId],
    queryFn: () => (selectedSessionId ? getMessages(selectedSessionId) : Promise.resolve([])),
    enabled: !!selectedSessionId,
  });

  // Update local messages when server messages change
  React.useEffect(() => {
    // Convert API messages to UI format
    const uiMessages = messages.map(msg => createUIMessage({
      id: msg.message_uuid,
      role: msg.type === 'user' ? 'user' : 'agent',
      content: msg.parts[0]?.content || '',
      agentId: msg.agent_id,
      agentName: msg.agent_id ? (agentMetadata[msg.agent_id]?.name || msg.agent_id) : undefined,
      timestamp: msg.created_at,
      metadata: {
        ...msg.metadata,
        agentColor: msg.agent_id ? agentMetadata[msg.agent_id]?.color : undefined,
        avatar: msg.agent_id ? agentMetadata[msg.agent_id]?.avatar : undefined
      },
      deliveryStatus: 'sent'
    }));
    setLocalMessages(uiMessages);
  }, [messages, agentMetadata]);

  // Keep track of current conversation messages
  const currentMessages = React.useMemo(() => {
    if (!selectedSessionId) return [];
    return localMessages.filter(msg => 
      msg.id && msg.content && (msg.role === 'user' || (msg.role === 'agent' && msg.agentName))
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
        metadata: {},
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

  return (
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
        />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
