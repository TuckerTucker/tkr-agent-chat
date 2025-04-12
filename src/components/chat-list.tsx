import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatListItem } from '@/components/chat-list-item';
import { getSessions } from '@/services/api'; // Import API function
// Removed useChatStore import

interface ChatListProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ activeSessionId, setActiveSessionId }) => {
  // Fetch sessions using React Query
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['sessions'], // Unique key for this query
    queryFn: getSessions, // Function to fetch data
  });

  // TODO: activeSessionId needs to be managed elsewhere (e.g., context or parent state)
  // const activeSessionId = /* Get from context/props */;

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Loading chats...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Error loading chats: {error.message}</div>;
  }

  return (
    <ScrollArea className="flex-grow p-2" aria-label="List of conversations">
      <div role="list">
        {sessions?.map((session) => (
          <ChatListItem
            key={session.id}
            chatId={session.id}
            chatTitle={session.title || `Chat ${session.id.substring(0, 4)}`}
            isActive={session.id === activeSessionId} // Use prop for active state
            onClick={setActiveSessionId} // Pass down the handler
          />
        ))}
        {(!sessions || sessions.length === 0) && (
          <p className="text-gray-500 text-sm text-center p-4">No chats yet.</p>
        )}
      </div>
    </ScrollArea>
  );
};
