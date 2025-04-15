import { AppLayoutProps } from './app-layout.d';
import { ThemeProvider } from '../theme/theme-provider';
import { ThemeSwitch} from '../theme/theme-switch';
import { Button } from './button';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { AGENT_THEMES } from '../../lib/agent-themes';

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
  return (
    <ThemeProvider defaultTheme="light" defaultAgent={AGENT_THEMES[currentAgentId]}>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-border flex flex-col bg-card">
        <div className="border-b border-border px-4 py-3 flex justify-between items-center min-h-[4rem] bg-card/50">
            <div className="text-lg font-semibold text-foreground/90"><em>TKR Agents</em></div>
            <div className="flex items-center gap-2">
              <ThemeSwitch showAgentIndicator={false} />
            </div>
          </div>
          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            <div className="py-2">
              {conversations.map((conversation) => (
                <div 
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  className={`px-4 py-2 cursor-pointer hover:bg-accent/10 ${currentConversation?.id === conversation.id ? 'bg-accent/20' : ''}`}
                >
                  <h3 className="font-medium text-sm truncate text-foreground/80">{conversation.title || 'Untitled Chat'}</h3>
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 py-2">
            <Button 
              onClick={onCreateConversation}
              className="w-full justify-center font-medium text-sm"
              variant="outline"
            >
              New Chat
            </Button>
          </div>
          {/* menu section */}
          <div className="p-4 border-t border-border justify-items-stretch min-h-[6rem] space-y-1">
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
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Chat content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
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
            <div className="border-t border-border p-4 min-h-[7rem] flex flex-col gap-2 bg-card/50 backdrop-blur-sm" >
              {/* Agent selection buttons */}
              <div className="flex flex-wrap gap-2">
                {availableAgents.map((agentId) => (
                  <Button
                    key={agentId}
                    variant={agentId === currentAgentId ? "default" : "secondary"}
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      agentId === currentAgentId ? "ring-2 ring-primary" : ""
                    }`}
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
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
