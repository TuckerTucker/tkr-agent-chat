import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConversationsSidebar } from '@/components/conversations-sidebar';
import { ChatArea } from '@/components/chat-area';
import { getSessions, getAgents } from '@/services/api'; // Import API functions
import webSocketService from '@/services/websocket'; // Import WebSocket service
import { AgentInfo } from '@/types/api';

export const AppLayout: React.FC = () => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch initial sessions to determine the first active session
  const { data: initialSessions, isLoading: isLoadingInitialSessions } = useQuery({
    queryKey: ['sessions'], // Use the same key as ChatList
    queryFn: getSessions,
    staleTime: 5 * 60 * 1000, // Cache for 5 mins
    refetchOnWindowFocus: false,
  });

  // Fetch available agents (needed for WebSocket connections)
   const { data: availableAgents = [] } = useQuery<AgentInfo[]>({
     queryKey: ['agents'],
     queryFn: getAgents,
     staleTime: Infinity,
     refetchOnWindowFocus: false,
   });

  // Effect to set the initial active session once sessions are loaded
  useEffect(() => {
    if (!activeSessionId && initialSessions && initialSessions.length > 0) {
      // TODO: Could potentially load last active session ID from localStorage here
      console.log("Setting initial active session:", initialSessions[0].id);
      setActiveSessionId(initialSessions[0].id);
    }
    // If no sessions exist after loading, activeSessionId remains null
  }, [initialSessions, activeSessionId]); // Depend on loaded sessions and current activeId

  // Effect to manage WebSocket connections based on activeSessionId and availableAgents
  useEffect(() => {
    // Ensure we have an active session and agents list before connecting
    if (activeSessionId && availableAgents.length > 0) {
      console.log(`Connecting agents for session: ${activeSessionId}`);
      // Disconnect any previous connections first
      webSocketService.disconnectAll();

      // Connect WebSocket for each available agent for the current session
      availableAgents.forEach(agent => {
        webSocketService.connect(activeSessionId, agent.id);
      });

      // Setup WebSocket callbacks (moved from MessageDisplay to here for global handling)
      // This ensures callbacks are set regardless of MessageDisplay being mounted
      webSocketService.setCallbacks({
        onPacket: (agentId, packet) => {
          // Invalidate messages query on final packet to trigger refetch
          if (packet.turn_complete === true) {
             console.log(`[WS Callback] Turn complete for ${agentId}. Invalidating messages query.`);
             // Use queryClient obtained from hook
             queryClient.invalidateQueries({ queryKey: ['messages', activeSessionId] });
          }
          // Note: Real-time streaming display is handled locally in MessageDisplay
          // We *don't* update React Query cache directly with streaming packets here
        },
        onError: (agentId, error) => {
          console.error(`[WS Callback Error] Agent ${agentId}:`, error);
          // TODO: Implement global error handling/display if needed
        },
        onOpen: (agentId) => {
           console.log(`[WS Callback Open] Agent ${agentId} connected.`);
           // TODO: Update global connection status state if needed for UI indicators
        },
        onDisconnect: (agentId) => {
           console.log(`[WS Callback Disconnect] Agent ${agentId} disconnected.`);
           // TODO: Update global connection status state if needed
        },
        onReconnect: (agentId) => {
            console.log(`[WS Callback Reconnect] Agent ${agentId} reconnecting...`);
            // TODO: Update global connection status state if needed
        }
      });

      // Cleanup function: Disconnect all agents when session changes or component unmounts
      return () => {
        console.log(`Disconnecting agents for session: ${activeSessionId}`);
        webSocketService.disconnectAll();
        // Optionally clear callbacks if they shouldn't persist
        // webSocketService.setCallbacks({});
      };
    } else if (!activeSessionId) {
        // If no session is active, ensure all sockets are disconnected
        webSocketService.disconnectAll();
    }

    // Re-run if activeSessionId or the list of availableAgents changes
  }, [activeSessionId, availableAgents, queryClient]);


  // Handler to change the active session
  const handleSetActiveSession = (sessionId: string) => {
    if (sessionId !== activeSessionId) {
      console.log("Setting active session:", sessionId);
      setActiveSessionId(sessionId);
      // Persist to localStorage?
      // localStorage.setItem('lastActiveSessionId', sessionId);
    }
  };

  // Show loading state for initial session load
  if (isLoadingInitialSessions && !activeSessionId) {
      return (
          <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-white">
              Loading sessions...
          </div>
      );
  }

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white">
      <div className="w-72 flex-shrink-0 h-full">
        {/* Pass state and handler down */}
        <ConversationsSidebar
          activeSessionId={activeSessionId}
          setActiveSessionId={handleSetActiveSession}
        />
      </div>
      <main className="flex-1 h-full overflow-hidden">
        {/* Pass activeSessionId down */}
        <ChatArea activeSessionId={activeSessionId} />
      </main>
    </div>
  );
};
