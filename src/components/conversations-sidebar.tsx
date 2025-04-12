import React from 'react';
import { NewChatButton } from '@/components/new-chat-button';
import { ChatList } from '@/components/chat-list'; // Keep ChatList
import { LibrarySection } from '@/components/library-section'; // Keep LibrarySection

interface ConversationsSidebarProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string) => void;
}

export const ConversationsSidebar: React.FC<ConversationsSidebarProps> = ({
  activeSessionId,
  setActiveSessionId,
}) => {
  return (
    <nav
      className="flex flex-col h-full bg-gray-800 text-white border-r border-gray-700"
      aria-label="Chat Conversations"
    >
      {/* Pass handler down to NewChatButton */}
      <NewChatButton setActiveSessionId={setActiveSessionId} />
      {/* Pass props down to ChatList */}
      <ChatList
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
      />
      <LibrarySection />
    </nav>
  );
};
