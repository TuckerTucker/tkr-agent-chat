import React from 'react';
import { ConversationsSidebar } from '@/components/conversations-sidebar';
import { ChatArea } from '@/components/chat-area';

export const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white">
      <div className="w-72 flex-shrink-0 h-full">
        <ConversationsSidebar />
      </div>
      <main className="flex-1 h-full overflow-hidden">
        <ChatArea />
      </main>
    </div>
  );
};
