import React, { useState } from 'react'; // Import useState
import { ConversationsSidebar } from './conversations-sidebar';
import { ChatArea } from './chat-area';

/**
 * Defines the main layout structure of the application.
 * It arranges the ConversationsSidebar and ChatArea components side-by-side,
 * managing the active chat session state.
 */
const AppLayout: React.FC = () => {
  // State to keep track of the active session ID
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-gray-700">
        <ConversationsSidebar
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-grow">
        <ChatArea activeSessionId={activeSessionId} />
      </div>
    </div>
  );
};

export default AppLayout;
