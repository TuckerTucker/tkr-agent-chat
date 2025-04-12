import React from 'react';
import { NewChatButton } from '@/components/new-chat-button';
import { ChatList } from '@/components/chat-list';
import { LibrarySection } from '@/components/library-section';

export const ConversationsSidebar: React.FC = () => {
  return (
    <nav
      className="flex flex-col h-full bg-gray-800 text-white border-r border-gray-700"
      aria-label="Chat Conversations"
    >
      <NewChatButton />
      <ChatList />
      <LibrarySection />
    </nav>
  );
};
