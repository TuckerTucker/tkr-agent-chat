import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { NewChatListItem } from '@/components/new-chat-list-item'; // Import the new item component
import { getSessions } from '@/services/api'; // Import API function
import { ChatSessionRead } from '@/types/api'; // Import correct Session type

interface ChatListProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string) => void;
}

/**
 * Displays the list of chat sessions.
 * Uses a standard div with overflow-y-auto for scrolling.
 */
export const ChatList: React.FC<ChatListProps> = ({ activeSessionId, setActiveSessionId }) => {
  // Fetch sessions using React Query
  const { data: sessions, isLoading, error } = useQuery<ChatSessionRead[], Error>({ // Use correct type
    queryKey: ['sessions'], // Unique key for this query
    queryFn: getSessions, // Function to fetch data
  });

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-gray-400">Loading chats...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-sm text-red-500">Error loading chats: {error.message}</div>;
  }

  return (
    // Container div that grows and scrolls vertically
    <div
      className="flex-grow overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500 scrollbar-track-transparent"
      aria-label="List of conversations"
      role="list" // Use role="list" on the container
    >
      {sessions?.map((session) => (
        <NewChatListItem // Use the new list item component
          key={session.id}
          chatId={session.id}
          // Provide a default title if none exists
          chatTitle={session.title || `Chat ${session.id.substring(0, 6)}...`}
          isActive={session.id === activeSessionId} // Use prop for active state
          onClick={setActiveSessionId} // Pass down the handler
        />
      ))}
      {(!sessions || sessions.length === 0) && (
        <p className="text-gray-500 text-sm text-center p-4">No chats yet.</p>
      )}
    </div>
  );
};
