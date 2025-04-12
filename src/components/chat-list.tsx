import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatListItem } from '@/components/chat-list-item';
import useChatStore from '@/store'; // Use the new store

export const ChatList: React.FC = () => {
  // Use renamed state slices
  const sessions = useChatStore((state) => state.sessions); 
  const activeSessionId = useChatStore((state) => state.activeSessionId); 

  return (
    <ScrollArea className="flex-grow p-2" aria-label="List of conversations"> {/* As per .clinerules */}
      <div role="list"> {/* Explicit role for accessibility */}
        {sessions.map((session) => ( // Iterate over sessions
          <ChatListItem
            key={session.id}
            chatId={session.id}
            chatTitle={session.title || `Chat ${session.id.substring(0, 4)}`} // Use title or fallback
            isActive={session.id === activeSessionId} // Compare with activeSessionId
          />
        ))}
        {sessions.length === 0 && ( // Check sessions.length instead of chats.length
          <p className="text-gray-500 text-sm text-center p-4">No chats yet.</p>
        )}
      </div>
    </ScrollArea>
  );
};
