import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageDisplay } from '@/components/message-display';
import { InputArea } from '@/components/input-area';
import { getSession } from '@/services/api'; // API function to get session details
// Removed useChatStore and AgentInfo imports

// Removed AgentStatusIndicator component

interface ChatHeaderProps {
  title: string;
  isLoading: boolean; // Add loading state for title
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ title, isLoading }) => {
  // Removed fetching availableAgents and agent status logic

  return (
    <header className="p-4 border-b border-gray-700 flex flex-col gap-3">
      {/* Session Title */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">
          {isLoading ? 'Loading...' : title}
        </h1>
      </div>
      {/* Removed Agent Connection Status Display */}
    </header>
  );
};

interface ChatAreaProps {
  activeSessionId: string | null; // Receive activeSessionId as a prop
}

export const ChatArea: React.FC<ChatAreaProps> = ({ activeSessionId }) => {
  // Removed Zustand hooks (initializeStore, sessions, isLoading, agentErrors)

  // Fetch active session details for the title
  const { data: activeSession, isLoading: isLoadingSession, error: sessionError } = useQuery({
    queryKey: ['session', activeSessionId], // Query key includes session ID
    queryFn: () => activeSessionId ? getSession(activeSessionId) : Promise.reject(new Error("No active session")),
    enabled: !!activeSessionId, // Only run query if activeSessionId exists
    staleTime: 5 * 60 * 1000, // Cache session details for 5 minutes
    refetchOnWindowFocus: false,
  });

  // Handle loading and error states for the active session query
  if (!activeSessionId) {
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
      {/* Display session loading/error in header */}
      <ChatHeader
        title={sessionError ? 'Error loading title' : (activeSession?.title || 'Chat')}
        isLoading={isLoadingSession}
      />
      {/* Pass activeSessionId down */}
      <MessageDisplay activeSessionId={activeSessionId} />
      <InputArea activeSessionId={activeSessionId} />
    </section>
  );
};
