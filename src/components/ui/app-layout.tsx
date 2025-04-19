import { useState } from 'react';
import { AppLayoutProps, Conversation } from './app-layout.d';
import { ThemeProvider } from '../theme/theme-provider';
import { ThemeSwitch} from '../theme/theme-switch';
import { Button } from './button';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { AGENT_THEMES } from '../lib/agent-themes';
import { cn } from '../lib/utils';

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
    const agentTheme = AGENT_THEMES[agentId] || AGENT_THEMES.default;
    const status = agentStatuses[agentId];

    // Base style using agent's theme color
    let style = agentId === currentAgentId ? agentTheme.primary : `${agentTheme.primary}/30`;

    // Add animation for connecting state
    if (status?.connection === 'connecting') {
      return `${style} animate-pulse`;
    }

    return style;
  };

  // Helper function to get status tooltip text
  const getStatusText = (agentId: string) => {
    const status = agentStatuses[agentId];
    if (!status) return 'Disconnected';
    return `${status.connection.charAt(0).toUpperCase() + status.connection.slice(1)} - ${status.activity}`;
  };

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
                <div 
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    "px-8 py-3.5 cursor-pointer",
                    "transition-all duration-theme",
                    "hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground hover:pl-10",
                    "focus:outline-none focus:ring-2 focus:ring-sidebar-ring focus:bg-sidebar-accent/80",
                    "border-l-2",
                    "group relative",
                    currentConversation?.id === conversation.id
                      ? "bg-sidebar-accent/90 border-sidebar-primary text-sidebar-accent-foreground shadow-sm pl-10"
                      : "border-transparent hover:shadow-sm"
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectConversation(conversation);
                    }
                  }}
                >
                  <h3 className={cn(
                    "font-medium text-sm truncate transition-all duration-theme",
                    currentConversation?.id === conversation.id
                      ? "text-foreground"
                      : "text-foreground/70"
                  )}>
                    {conversation.title || new Date(conversation.id).toLocaleString('en-US', { 
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: 'numeric',
                      hour12: true 
                    })}
                  </h3>
                </div>
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

            {/* Agent selector and chat input area */}
            <div className="sticky bottom-0 border-t border-border/50 px-8 py-6 flex-shrink-0 bg-background/95 backdrop-blur-sm shadow-2xl z-10">
              <div className="max-w-screen-xl mx-auto">
                <div className="flex flex-col gap-3">
                  {/* Agent selection buttons */}
                  <div 
                    className="flex flex-wrap gap-3"
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
                        className={cn(
                          "flex items-center gap-2 px-4 py-2",
                          "rounded-full text-base font-medium",
                          "transition-all duration-theme",
                          "focus:outline-none focus:ring-2 focus:ring-agent-primary",
                          "hover:bg-accent/80 hover:text-accent-foreground hover:shadow-md",
                          agentId === currentAgentId && "ring-2 ring-agent-primary shadow-md"
                        )}
                        role="radio"
                        aria-checked={agentId === currentAgentId}
                        style={{
                          backgroundColor: agentId === currentAgentId ? (() => {
                            const theme = AGENT_THEMES[agentId] || AGENT_THEMES.default;
                            const color = theme.primaryColor;
                            // If RGB format, make it brighter
                            if (color.startsWith('rgb')) {
                              const matches = color.match(/\d+/g);
                              if (matches && matches.length >= 3) {
                                // Increase brightness while keeping color identity
                                const r = Math.min(255, parseInt(matches[0]) * 1.2);
                                const g = Math.min(255, parseInt(matches[1]) * 1.2);
                                const b = Math.min(255, parseInt(matches[2]) * 1.2);
                                return `rgb(${r}, ${g}, ${b})`;
                              }
                            }
                            // For hex format, brighten it
                            return color;
                          })() : undefined,
                          color: agentId === currentAgentId ? "#ffffff" : undefined,
                          boxShadow: agentId === currentAgentId ? (() => {
                            const theme = AGENT_THEMES[agentId] || AGENT_THEMES.default;
                            const color = theme.primaryColor;
                            // If RGB format, extract values for rgba
                            if (color.startsWith('rgb')) {
                              const matches = color.match(/\d+/g);
                              if (matches && matches.length >= 3) {
                                return `0 0 10px rgba(${matches[0]}, ${matches[1]}, ${matches[2]}, 0.5)`;
                              }
                            }
                            // For hex format, use as is
                            return `0 0 10px ${color}80`; // 80 = 50% opacity in hex
                          })() : undefined,
                        }}
                        onClick={() => onSelectAgent(agentId)}
                        aria-pressed={agentId === currentAgentId}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2.5 h-2.5 rounded-full transition-colors duration-theme"
                            style={{
                              backgroundColor: (() => {
                                const theme = AGENT_THEMES[agentId] || AGENT_THEMES.default;
                                const color = theme.primaryColor;
                                // For unselected state, create a semi-transparent version of the color
                                if (agentId !== currentAgentId) {
                                  // If the color is rgb format
                                  if (color.startsWith('rgb')) {
                                    return color.replace(')', ', 0.3)');
                                  }
                                  // If the color is hex format
                                  return color + '4D'; // 4D = 30% opacity in hex
                                }
                                return color;
                              })(),
                              animation: agentStatuses[agentId]?.connection === 'connecting' ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : undefined
                            }}
                            title={getStatusText(agentId)}
                          />
                          {agentMetadata[agentId]?.name || agentId}
                        </div>
                      </Button>
                    ))}
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
