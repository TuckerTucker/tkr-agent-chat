import { AppLayoutProps, Conversation } from './app-layout.d';
import { ThemeProvider } from '../theme/theme-provider';
import { ThemeSwitch} from '../theme/theme-switch'; 
import { Button } from './button';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { AGENT_THEMES } from '../lib/agent-themes';
import { cn } from '../lib/utils';
import { AgentCard, AgentCardCompact } from './agent-card';
import { ConversationListItem } from './conversation-list-item';
import '../theme/tooltip.css';

/**
 * Main application layout component following the design in _planning/interface.png
 */
export function AppLayout({
  conversations = [],
  currentConversation = null,
  onSendMessage = async () => Promise.resolve(),
  onCreateConversation = () => {},
  onSelectConversation = () => {},
  onRenameConversation = async () => Promise.resolve(),
  onDeleteConversation = async () => Promise.resolve(),
  currentAgentId = 'chloe',
  onSelectAgent = () => {},
  onRetryConnection = () => {},
  availableAgents = [],
  agentMetadata = {},
  agentStatuses = {},
  onLoadMoreMessages = () => {},
  isLoadingMessages = false,
}: AppLayoutProps): React.ReactElement {


  return (
    <ThemeProvider defaultTheme="dark" defaultAgent={AGENT_THEMES[currentAgentId]}>
      <div className="fixed inset-0 flex flex-col min-h-screen bg-background text-foreground antialiased">
        {/* Unified chat container */}
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside 
            className={cn(
              "w-[380px] h-full min-h-0 border-r border-sidebar-border flex-shrink-0",
              "bg-sidebar-background/95 backdrop-blur-sm flex flex-col",
              "shadow-lg"
            )}
            role="navigation" 
            aria-label="Chat conversations"
            tabIndex={0}
          >
            {/* Sidebar header */}
            <div className="border-b border-sidebar-border/50 px-8 py-5 flex justify-between items-center h-20 bg-sidebar-background/95 backdrop-blur-sm">
              <div className="text-2xl font-bold text-sidebar-foreground tracking-wide"><em>TKR Agents</em></div>
              <div className="flex items-center gap-2">
                <ThemeSwitch showAgentIndicator={false} />
              </div>
            </div>
            {/* New Chat button */}
            <div className="px-8 py-4 border-b border-sidebar-border/50">
              <Button 
                onClick={onCreateConversation}
                className="w-full justify-center font-medium text-base py-2.5"
                variant="outline"
              >
                New Chat
              </Button>
            </div>
            
            {/* Sidebar content: conversations */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-sidebar-border/50 scrollbar-track-transparent">
                {conversations.map((conversation: Conversation) => (
                  <ConversationListItem
                    key={conversation.id}
                    id={conversation.id}
                    title={conversation.title}
                    isSelected={currentConversation?.id === conversation.id}
                    onSelect={onSelectConversation}
                    onRename={onRenameConversation}
                    onDelete={onDeleteConversation}
                  />
                ))}
              </div>
            </div>
          </aside>

          {/* Main chat area */}
          <main 
            className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative" 
            role="main" 
            aria-label="Chat area"
          >
            {/* Chat messages */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent">
              {currentConversation && (
                <MessageList 
                  messages={currentConversation.messages || []}
                  loading={isLoadingMessages}
                  onScrollTop={onLoadMoreMessages}
                  getAgentMetadata={(id: string) => ({ 
                    id, 
                    name: agentMetadata[id]?.name || id,
                    avatar: agentMetadata[id]?.avatar
                  })}
                />
              )}
            </div>

            {/* Agent selector and chat input area */}
            <div className="sticky bottom-0 border-t border-border/50 px-8 py-6 flex-shrink-0 bg-background/95 backdrop-blur-sm shadow-2xl z-10">
              <div className="max-w-screen-xl mx-auto">
                <div className="flex flex-col gap-3">
                  {/* Agent selection buttons with detail cards */}
                  <div 
                    className="flex flex-col gap-4"
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
                    {/* Enhanced Agent Cards */}
                    <div className="flex flex-wrap gap-3 mb-2">
                      {availableAgents.map((agentId) => (
                        <AgentCard
                          key={agentId}
                          agentId={agentId}
                          isSelected={agentId === currentAgentId}
                          onSelect={onSelectAgent}
                          onRetryConnection={onRetryConnection}
                          agentInfo={agentMetadata[agentId] || { 
                            id: agentId, 
                            name: agentId,
                            description: "",
                            color: "#666",
                            capabilities: [] 
                          }}
                          status={agentStatuses[agentId] || { 
                            connection: 'disconnected', 
                            activity: 'idle' 
                          }}
                          className="w-[170px]"
                        />
                      ))}
                    </div>
                    
                    {/* Compact Version for Mobile */}
                    <div className="md:hidden flex flex-wrap gap-2">
                      {availableAgents.map((agentId) => (
                        <AgentCardCompact
                          key={`compact-${agentId}`}
                          agentId={agentId}
                          isSelected={agentId === currentAgentId}
                          onSelect={onSelectAgent}
                          onRetryConnection={onRetryConnection}
                          agentInfo={agentMetadata[agentId] || { 
                            id: agentId, 
                            name: agentId,
                            description: "",
                            color: "#666",
                            capabilities: [] 
                          }}
                          status={agentStatuses[agentId] || { 
                            connection: 'disconnected', 
                            activity: 'idle' 
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
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
              </div>
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
