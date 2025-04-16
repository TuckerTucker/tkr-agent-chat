import { useState } from 'react';
import { AppLayoutProps, Conversation } from './app-layout.d';
import { ThemeProvider } from '../theme/theme-provider';
import { ThemeSwitch} from '../theme/theme-switch';
import { Button } from './button';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { AGENT_THEMES } from '../lib/agent-themes';

/**
 * Main application layout component following the design in _planning/interface.png
 * 
 * @param {Object} props - Component props
 * @param {Array} props.conversations - Array of conversation objects
 * @param {Object} props.currentConversation - Current active conversation
 * @param {Function} props.onSendMessage - Function to handle sending messages
 * @param {Function} props.onCreateConversation - Function to create a new conversation
 * @param {Function} props.onSelectConversation - Function to select a conversation
 * @param {React.ReactNode} props.children - Optional children components
 * @returns {JSX.Element} The application layout
 */

export function AppLayout({
  conversations = [],
  currentConversation = null,
  onSendMessage = async () => Promise.resolve(),
  onCreateConversation = () => {},
  onSelectConversation = () => {},
  currentAgentId = 'chloe',
  onSelectAgent = () => {},
  availableAgents = [],
  agentMetadata = {},
  agentStatuses = {},
}: AppLayoutProps): React.ReactElement {

  // Helper function to get status indicator color
  const getStatusColor = (agentId: string) => {
    const status = agentStatuses[agentId];
    if (!status) return 'bg-gray-400';
    switch (status.connection) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  // Helper function to get status tooltip text
  const getStatusText = (agentId: string) => {
    const status = agentStatuses[agentId];
    if (!status) return 'Disconnected';
    return `${status.connection.charAt(0).toUpperCase() + status.connection.slice(1)} - ${status.activity}`;
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };
  return (
    <ThemeProvider defaultTheme="dark" defaultAgent={AGENT_THEMES[currentAgentId]}>
      <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
        {/* Backdrop overlay for mobile */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm sm:hidden z-40"
            onClick={toggleSidebar}
            aria-hidden="true"
          />
        )}
        {/* Sidebar */}
        <aside 
          className={`w-[320px] h-full min-h-0 border-r border-border/50 bg-sidebar flex flex-col flex-shrink-0 fixed sm:relative inset-y-0 left-0 z-50 transition-transform duration-200 shadow-lg ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
          }`}
          role="navigation" 
          aria-label="Chat conversations"
          tabIndex={0}
        >
          {/* Sidebar header */}
          <div className="border-b border-border px-6 py-4 flex justify-between items-center h-16 bg-card/70">
            <div className="text-xl font-bold text-primary tracking-wide"><em>TKR Agents</em></div>
            <div className="flex items-center gap-2">
              <ThemeSwitch showAgentIndicator={false} />
            </div>
          </div>
          {/* Sidebar content: conversations and new chat */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              {conversations.map((conversation: Conversation) => (
                <div 
                  key={conversation.id}
                  onClick={() => {
                    onSelectConversation(conversation);
                    setIsSidebarOpen(false);
                  }}
                  className={`px-6 py-2.5 cursor-pointer transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    currentConversation?.id === conversation.id 
                      ? 'bg-accent/20 border-l-2 border-primary' 
                      : 'border-l-2 border-transparent'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectConversation(conversation);
                    }
                  }}
                >
                  <h3 className="font-medium text-sm truncate text-foreground/80">{conversation.title || 'Untitled Chat'}</h3>
                </div>
              ))}
            </div>
            <div className="px-6 py-3">
              <Button 
                onClick={onCreateConversation}
                className="w-full justify-center font-medium text-sm"
                variant="outline"
              >
                New Chat
              </Button>
            </div>
          </div>
          {/* Sidebar footer menu docked to bottom */}
          <div className="px-6 py-4 border-t border-border space-y-1 bg-sidebar-accent/5">
            <Button 
              variant="ghost" 
              className="w-full justify-start font-medium text-sm"
            >
              Chat
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start font-medium text-sm text-muted-foreground"
              disabled
            >
              Library
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start font-medium text-sm text-muted-foreground"
              disabled
            >
              Settings
            </Button>
          </div>
        </aside>
        
        {/* Main content */}
        <main 
          className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative w-full" 
          role="main" 
          aria-label="Chat area"
        >
          {/* Mobile menu button */}
          <button
            onClick={toggleSidebar}
            className="sm:hidden fixed top-4 left-4 p-2 rounded-md bg-sidebar/90 backdrop-blur-sm hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-primary/50 z-50 shadow-lg border border-border/50"
            aria-label="Toggle sidebar menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
          {/* Chat content */}
          <div className="flex-1 min-h-0 overflow-hidden pt-16 sm:pt-0">
            {currentConversation && (
              <MessageList 
                messages={currentConversation.messages || []}
                loading={false}
                onScrollTop={() => {}}
                getAgentMetadata={(id: string) => ({ 
                  id, 
                  name: agentMetadata[id]?.name || id,
                  avatar: agentMetadata[id]?.avatar
                })}
              />
            )}
          </div>
          
          {/* Agent selector and input */}
          <div className="border-t border-border px-6 py-4 flex-shrink-0 flex flex-col gap-3 bg-card/50 backdrop-blur-sm">
            {/* Agent selection buttons */}
            <div 
              className="flex flex-wrap gap-2" 
              role="radiogroup" 
              aria-label="Select agent"
              onKeyDown={(e) => {
                const currentIndex = availableAgents.indexOf(currentAgentId);
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const nextIndex = (currentIndex + 1) % availableAgents.length;
                  onSelectAgent(availableAgents[nextIndex]);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const prevIndex = (currentIndex - 1 + availableAgents.length) % availableAgents.length;
                  onSelectAgent(availableAgents[prevIndex]);
                }
              }}
            >
              {availableAgents.map((agentId) => (
                <Button
                  key={agentId}
                  variant={agentId === currentAgentId ? "default" : "secondary"}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    agentId === currentAgentId ? "ring-2 ring-primary" : ""
                  }`}
                  role="radio"
                  aria-checked={agentId === currentAgentId}
                  style={{
                    backgroundColor: agentMetadata[agentId]?.color || undefined,
                    color: agentId === currentAgentId ? "#fff" : undefined,
                  }}
                  onClick={() => onSelectAgent(agentId)}
                  aria-pressed={agentId === currentAgentId}
                >
                  {/* Icons temporarily disabled
                  {agentMetadata[agentId]?.avatar ? (
                    <img
                      src={agentMetadata[agentId].avatar}
                      alt={agentMetadata[agentId].name}
                      className="w-4 h-4 rounded-full mr-1"
                    />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-[10px] font-bold mr-1">
                      {agentMetadata[agentId]?.name?.[0] || agentId[0]}
                    </span>
                  )} */}
                  <div className="flex items-center gap-2">
                    <div 
                      className={`w-2 h-2 rounded-full ${getStatusColor(agentId)}`} 
                      title={getStatusText(agentId)}
                    />
                    {agentMetadata[agentId]?.name || agentId}
                  </div>
                </Button>
              ))}
            </div>
            <ChatInput
              onSend={onSendMessage}
              availableAgents={availableAgents}
              agentMetadata={agentMetadata}
              currentAgentId={currentAgentId}
              allowMarkdown={true}
              placeholder="Type a message..."
              disabled={!agentStatuses[currentAgentId] || agentStatuses[currentAgentId].connection !== 'connected'}
              onTyping={() => {}}
            />
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
