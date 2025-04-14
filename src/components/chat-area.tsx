import React from 'react';
// Removed unused useQuery import
import { MessageDisplay } from '@/components/message-display'; // Keep one
import { InputArea } from '@/components/input-area'; // Keep one
import DarkModeToggle from '@/components/dark-mode-toggle'; // Import the toggle

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
  // Removed session query - title is now static in ChatHeader

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
      <ChatHeader /> {/* Render simplified header */}
      {/* Pass activeSessionId down */}
      <MessageDisplay activeSessionId={activeSessionId} />
      <InputArea activeSessionId={activeSessionId} />
    </section>
  );
};
