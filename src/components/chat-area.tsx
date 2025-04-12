import React, { useEffect } from 'react';
import { MessageDisplay } from '@/components/message-display';
import { InputArea } from '@/components/input-area';
import useChatStore from '@/store';
import { AgentInfo } from '@/types/api'; // Import AgentInfo type

// Define connection status types locally if not imported
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface ChatHeaderProps {
  title: string;
}

// Helper component for displaying agent status
const AgentStatusIndicator: React.FC<{ agent: AgentInfo }> = ({ agent }) => {
  const status = useChatStore(state => state.agentConnectionStatus[agent.id] || 'disconnected');
  const error = useChatStore(state => state.agentErrors[agent.id]);
  const clearError = useChatStore(state => state.clearAgentError);

  let bgColor = 'bg-gray-500'; // Default: disconnected
  let title = `${agent.name}: Disconnected`;
  let animate = false;

  switch (status) {
    case 'connected':
      bgColor = 'bg-green-500';
      title = `${agent.name}: Connected`;
      break;
    case 'connecting':
      bgColor = 'bg-yellow-500';
      title = `${agent.name}: Connecting...`;
      animate = true;
      break;
    case 'error':
      bgColor = 'bg-red-500';
      title = `${agent.name}: Error - ${error || 'Unknown error'}`;
      break;
  }

  return (
    <div 
      className="flex items-center gap-1 text-xs text-gray-300 cursor-help" 
      title={title}
      onClick={() => status === 'error' && clearError(agent.id)} // Allow clearing error on click
    >
      <span 
        className={`w-3 h-3 rounded-full inline-block ${bgColor} ${animate ? 'animate-pulse' : ''}`} 
        style={{ backgroundColor: status === 'connected' ? agent.color : undefined }} // Use agent color only when connected
      />
      <span>{agent.name}</span>
      {status === 'error' && <span className="text-red-400">(Error)</span>}
    </div>
  );
};


const ChatHeader: React.FC<ChatHeaderProps> = ({ title }) => {
  const availableAgents = useChatStore(state => state.availableAgents);
  // Removed state related to single connection: activeConnectionAgentId, connectToAgent, disconnectFromAgent, isConnecting

  return (
    <header className="p-4 border-b border-gray-700 flex flex-col gap-3">
      {/* Session Title */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {/* Removed Disconnect Button */}
      </div>

      {/* Agent Connection Status Display */}
      <div>
        <span className="text-sm text-gray-400 mr-2">Agent Status:</span>
        <div className="flex gap-3 items-center flex-wrap">
          {availableAgents.map(agent => (
            <AgentStatusIndicator key={agent.id} agent={agent} />
          ))}
          {!availableAgents.length && <span className="text-sm text-gray-500">No agents available.</span>}
        </div>
      </div>
    </header>
  );
};

export const ChatArea: React.FC = () => {
  // All hooks must be called at the top, before any returns!
  const { 
    initializeStore,
    activeSessionId, 
    sessions, 
    isLoading
  } = useChatStore();
  const agentErrors = useChatStore(state => state.agentErrors);
  const hasErrors = Object.values(agentErrors).some(e => e !== null);

  // Initialize store on mount
  useEffect(() => {
    initializeStore();
    // Run only once on mount
  }, [initializeStore]); 

  // Show loading state while initializing
  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="text-gray-400">Initializing chat...</div>
      </div>
    );
  }
  
  // Handle case where no session could be created or activated after init
  const activeSession = sessions.find(s => s.id === activeSessionId);
  if (!activeSession) {
     return (
       <div className="flex items-center justify-center h-full bg-gray-900 text-white">
         <div className="text-gray-400">No active chat session. Create one from the sidebar.</div>
       </div>
     );
  }

  return (
    <section className="flex flex-col h-full bg-gray-900 text-white">
      {/* Display agent-specific errors (optional, could be handled by indicators) */}
      {/* {hasErrors && (
         <div className="p-2 bg-red-800 text-center text-sm">
           Agent connection errors detected. Check status indicators.
         </div>
      )} */}
      <ChatHeader title={activeSession.title || 'New Chat'} />
      <MessageDisplay />
      <InputArea />
    </section>
  );
};
