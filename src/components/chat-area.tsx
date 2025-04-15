import React, { useEffect } from 'react'; // Import useEffect
import { useQuery } from '@tanstack/react-query';
import { MessageDisplay } from '@/components/message-display';
import { InputArea } from '@/components/input-area';
import DarkModeToggle from '@/components/dark-mode-toggle';
import { getAgents, getSession } from '@/services/api';
import { AgentInfo, ChatSessionRead } from '@/types/api';
import webSocketService from '@/services/websocket'; // Import WebSocket service

// Simplified ChatHeader component
const ChatHeader: React.FC = () => {
  return (
    <header className="p-4 border-b border-gray-700 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">
          Tucker's Team {/* Static title */}
        </h1>
        <DarkModeToggle /> {/* Render the toggle */}
      </div>
    </header>
  );
};

interface ChatAreaProps {
  activeSessionId: string | null; // Receive activeSessionId as a prop
}

export const ChatArea: React.FC<ChatAreaProps> = ({ activeSessionId }) => {
  // Fetch all available agents
  const { data: availableAgents = [], isLoading: isLoadingAgents } = useQuery<AgentInfo[]>({
    queryKey: ['agents'],
    queryFn: getAgents,
    staleTime: Infinity, // Cache agents indefinitely unless invalidated
    refetchOnWindowFocus: false,
  });

  // Fetch details of the active session (using ChatSessionRead as returned by API)
  const { data: activeSessionData, isLoading: isLoadingSession } = useQuery<ChatSessionRead>({ // Expect ChatSessionRead
    queryKey: ['session', activeSessionId],
    queryFn: () => getSession(activeSessionId!),
    enabled: !!activeSessionId,
    staleTime: 5 * 60 * 1000,
  });

  // TEMPORARY: Since active_agents isn't available from getSession,
  // pass all available agent IDs until the API is updated.
  const activeAgentIds = availableAgents.map(agent => agent.id);

  // Effect to manage WebSocket connections based on active session and agents
  useEffect(() => {
    if (activeSessionId && activeAgentIds.length > 0) {
      console.log(`ChatArea Effect: Connecting agents for session ${activeSessionId}`, activeAgentIds);
      activeAgentIds.forEach(agentId => {
        webSocketService.connect(activeSessionId, agentId);
      });
    }

    // Cleanup function: Disconnect all agents when session changes or component unmounts
    return () => {
      console.log(`ChatArea Effect Cleanup: Disconnecting all agents (previous session: ${activeSessionId})`);
      webSocketService.disconnectAll();
    };
  }, [activeSessionId, activeAgentIds]); // Rerun effect if session or agent list changes

  if (!activeSessionId) {
    // Show loading state while session or agents are loading initially
    if (isLoadingSession || isLoadingAgents) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-900 text-white">
                <div className="text-gray-400">Loading session...</div>
            </div>
        );
    }
    return (
       <div className="flex items-center justify-center h-full bg-gray-900 text-white">
         <div className="text-gray-400">Select or create a chat session.</div>
       </div>
     );
  }

  // Note: Loading/error for messages is handled within MessageDisplay
  // Note: Loading/error for agents is handled within MessageDisplay and InputArea

  return (
    <section className="flex flex-col h-full bg-gray-900 text-white">
      <ChatHeader /> {/* Render simplified header */}
      {/* Pass activeSessionId down */}
      <MessageDisplay activeSessionId={activeSessionId} />
      {/* Pass agent lists down to InputArea */}
      <InputArea
        activeSessionId={activeSessionId}
        availableAgents={availableAgents} // Pass fetched available agents
        activeAgentIds={activeAgentIds} // Pass extracted active agent IDs
        // Consider passing isLoadingAgents if InputArea needs it
      />
    </section>
  );
};
