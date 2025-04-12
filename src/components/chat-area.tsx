import React, { useEffect } from 'react';
import { MessageDisplay } from '@/components/message-display';
import { InputArea } from '@/components/input-area';
import useChatStore from '@/store';

interface ChatHeaderProps {
  title: string;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ title }) => {
  const availableAgents = useChatStore(state => state.availableAgents);
  const activeConnectionAgentId = useChatStore(state => state.activeConnectionAgentId);
  const connectToAgent = useChatStore(state => state.connectToAgent);
  const disconnectFromAgent = useChatStore(state => state.disconnectFromAgent);
  const isConnecting = useChatStore(state => state.isConnecting);

  return (
    <header className="p-4 border-b border-gray-700 flex flex-col gap-3">
      {/* Session Title */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {activeConnectionAgentId && (
           <button 
             onClick={disconnectFromAgent}
             className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-400 rounded"
           >
             Disconnect from {availableAgents.find(a => a.id === activeConnectionAgentId)?.name || 'Agent'}
           </button>
        )}
      </div>

      {/* Agent Connection Selection */}
      <div>
        <span className="text-sm text-gray-400 mr-2">Connect to:</span>
        <div className="flex gap-2 items-center flex-wrap">
          {availableAgents.map(agent => {
            const isConnected = agent.id === activeConnectionAgentId;
            const connectingToThis = isConnecting && agent.id === activeConnectionAgentId;
            
            return (
              <button
                key={agent.id}
                onClick={() => !isConnected && connectToAgent(agent.id)}
                disabled={isConnecting || isConnected}
                className={`
                  flex items-center gap-1 px-2 py-1 text-xs rounded border
                  ${isConnected 
                    ? 'bg-green-600 border-green-500 cursor-default' 
                    : connectingToThis
                    ? 'bg-yellow-600 border-yellow-500 cursor-wait animate-pulse'
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed'}
                `}
                title={isConnected ? `Connected to ${agent.name}` : `Connect to ${agent.name}`}
              >
                <span 
                  className="w-3 h-3 rounded-full inline-block" 
                  style={{ backgroundColor: agent.color }} 
                />
                <span>{agent.name}</span>
                {connectingToThis && <span className="text-xs">(Connecting...)</span>}
              </button>
            );
          })}
          {!availableAgents.length && <span className="text-sm text-gray-500">No agents available.</span>}
        </div>
      </div>
    </header>
  );
};

export const ChatArea: React.FC = () => {
  // Remove duplicate declarations below
  const { 
    createSession, // Keep this one
    loadAgents, // Keep this one
    activeSessionId, 
    sessions, 
    error, 
    clearError, 
    setActiveSession, // Get setActiveSession action
    isLoading // Get isLoading state
  } = useChatStore();

  // Initialize on mount: Load agents and ensure a session is active
  useEffect(() => {
    const init = async () => {
      await loadAgents();
      // Use state variables directly, not get()
      if (sessions.length === 0) { 
        await createSession(); 
      } else if (!activeSessionId && sessions.length > 0) {
        setActiveSession(sessions[0].id);
      }
    };
    init();
  // Add dependencies: loadAgents, createSession, sessions, activeSessionId, setActiveSession
  // This ensures re-initialization if these change unexpectedly, though ideally it runs once.
  }, [loadAgents, createSession, sessions, activeSessionId, setActiveSession]); 


  // Show loading state while fetching initial data or if sessions array is empty
  if (isLoading && sessions.length === 0) { 
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="text-gray-400">Loading agents and session...</div>
      </div>
    );
  }
  
  // Handle case where no session could be created or activated
  const activeSession = sessions.find(s => s.id === activeSessionId);
  if (!activeSession) {
     return (
       <div className="flex items-center justify-center h-full bg-gray-900 text-white">
         <div className="text-gray-400">No active chat session. Create one from the sidebar.</div>
         {/* Optionally add a button here to trigger createSession */}
       </div>
     );
  }

  return (
    <section className="flex flex-col h-full bg-gray-900 text-white">
      {/* Display persistent errors */}
      {error && (
         <div className="p-2 bg-red-800 text-center text-sm">
           {error}
           <button onClick={clearError} className="ml-2 underline text-red-300">Dismiss</button>
         </div>
      )}
      <ChatHeader title={activeSession.title || 'New Chat'} />
      <MessageDisplay />
      <InputArea /> {/* InputArea will be disabled if no agent is connected */}
    </section>
  );
};
