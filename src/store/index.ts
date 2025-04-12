/**
 * Zustand Store for TKR Multi-Agent Chat System (ADK Streaming Model)
 * 
 * Manages:
 * - Chat sessions (creation simulated locally)
 * - Available agents (fetched from API)
 * - Active WebSocket connection state (connected agent ID)
 * - Message history for each session, including streaming updates
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware'; // Added persist
import { 
  AgentInfo, 
  ChatSession, 
  Message, 
  // MessagePart, // Part is defined within Message now
} from '../types/api'; 
import webSocketService from '../services/websocket';

// Helper to generate unique IDs (consider moving to utils)
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Define connection status types
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface ChatState {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  
  // Agents
  availableAgents: AgentInfo[];
  // Track status for *each* agent connection
  agentConnectionStatus: Record<string, ConnectionStatus>; 
  agentErrors: Record<string, string | null>; // Store errors per agent
  
  // Messages
  messages: Record<string, Message[]>;  // sessionId -> messages
  // Track streaming message ID *per agent*
  streamingAgentMessageIds: Record<string, string | null>; 
  
  // Loading/Error States
  isLoading: boolean; // General loading state (e.g., fetching agents/sessions)
  // Removed global error, using agentErrors now
  // error: string | null; 

  // Actions
  initializeStore: () => Promise<void>; // New action for setup
  createSession: (title?: string) => Promise<string | null>; // Returns new session ID or null
  setActiveSession: (sessionId: string) => void;
  loadAgents: () => Promise<void>;
  // Removed connectToAgent and disconnectFromAgent
  // Sends text message via WebSocket (will broadcast for now)
  sendTextMessage: (content: string) => void; 
  clearAgentError: (agentId: string) => void; // Clear error for a specific agent
  // Internal helper (optional)
  _connectAgent: (sessionId: string, agentId: string) => void;
  _disconnectAgent: (agentId: string) => void;
  _connectAllAgents: (sessionId: string) => void;
  _disconnectAllAgents: () => void;
}

// Add persist middleware for sessions and messages
const useChatStore = create<ChatState>()(
  devtools(
    persist( // Wrap with persist
      (set, get) => ({
        // --- Initial State ---
        sessions: [],
        activeSessionId: null,
        availableAgents: [],
        agentConnectionStatus: {}, // Initialize as empty object
        agentErrors: {}, // Initialize as empty object
        messages: {},
        streamingAgentMessageIds: {}, // Initialize as empty object
        isLoading: false,
        // error: null, // Removed global error

        // --- Actions ---

        // New Initialization Action
        initializeStore: async () => {
          console.log("Initializing chat store...");
          set({ isLoading: true });
          await get().loadAgents(); // Load agents first
          
          // Setup WebSocket callbacks *once*
          webSocketService.setCallbacks({
            onOpen: (agentId) => {
              console.log(`[Store] WebSocket opened for agent ${agentId}`);
              set(state => ({
                agentConnectionStatus: { ...state.agentConnectionStatus, [agentId]: 'connected' },
                agentErrors: { ...state.agentErrors, [agentId]: null }, // Clear error on connect
              }));
            },
            onPacket: (agentId, packet) => {
              const { activeSessionId, streamingAgentMessageIds } = get();
              // Ensure packet is for the active session (important if connections persist across sessions somehow)
              // Note: WebSocketService currently disconnects on session change, so this might be redundant
              // const connection = webSocketService.connections.get(agentId); // Need access to service internals or store session per agent
              // if (!activeSessionId || connection?.sessionId !== activeSessionId) return; 
              if (!activeSessionId) return; // Simplified check

              let currentStreamingId = streamingAgentMessageIds[agentId] ?? null;
              const isFinalChunk = packet.turn_complete === true;
              const hasMessageContent = typeof packet.message === 'string' && packet.message.length > 0;

              // --- Streaming Logic (adapted for multi-agent) ---
              if (hasMessageContent) {
                // Always start a new message if turn_complete is true or no current streaming ID
                if (!currentStreamingId || isFinalChunk) {
                  const newMessage: Message = {
                    id: generateMessageId(),
                    type: 'agent',
                    agent_id: agentId,
                    session_id: activeSessionId,
                    parts: [{ type: 'text', content: packet.message! }],
                    metadata: { timestamp: new Date().toISOString(), streaming: !isFinalChunk }
                  };
                  currentStreamingId = newMessage.id!;
                  set(state => ({
                    messages: {
                      ...state.messages,
                      [activeSessionId]: [...(state.messages[activeSessionId] || []), newMessage]
                    },
                    streamingAgentMessageIds: { ...state.streamingAgentMessageIds, [agentId]: isFinalChunk ? null : currentStreamingId }
                  }));
                } else {
                  // Append to existing streaming message for this agent
                  set(state => {
                    const sessionMessages = state.messages[activeSessionId] || [];
                    const updatedMessages = sessionMessages.map(msg => {
                      if (msg.id === currentStreamingId && msg.agent_id === agentId && msg.parts[0]?.type === 'text') {
                        return {
                          ...msg,
                          parts: [{ ...msg.parts[0], content: msg.parts[0].content + packet.message! }],
                          metadata: { ...msg.metadata, timestamp: new Date().toISOString(), streaming: !isFinalChunk }
                        };
                      }
                      return msg;
                    });
                    return { 
                        messages: { ...state.messages, [activeSessionId]: updatedMessages },
                        streamingAgentMessageIds: isFinalChunk 
                            ? { ...state.streamingAgentMessageIds, [agentId]: null } 
                            : state.streamingAgentMessageIds 
                    };
                  });
                }
              } else if (isFinalChunk && currentStreamingId) {
                // Final chunk signal without content, finalize the existing message
                set(state => {
                  const sessionMessages = state.messages[activeSessionId] || [];
                  const updatedMessages = sessionMessages.map(msg => {
                    if (msg.id === currentStreamingId && msg.agent_id === agentId) {
                      return { ...msg, metadata: { ...msg.metadata, streaming: false } };
                    }
                    return msg;
                  });
                  return {
                    messages: { ...state.messages, [activeSessionId]: updatedMessages },
                    streamingAgentMessageIds: { ...state.streamingAgentMessageIds, [agentId]: null }
                  };
                });
              }
              // --- End Streaming Logic ---

              // Handle backend errors if sent in packet
              if (packet.error) {
                console.error(`[Store] Agent Error from packet (Agent: ${agentId}): ${packet.error}`);
                set(state => ({
                  agentErrors: { ...state.agentErrors, [agentId]: `Agent Error: ${packet.error}` },
                  streamingAgentMessageIds: { ...state.streamingAgentMessageIds, [agentId]: null } // Stop streaming on error
                }));
              }
            },
            onError: (agentId, error) => {
              console.error(`[Store] WebSocket Error (Agent: ${agentId}): ${error.message}`);
              set(state => ({
                agentConnectionStatus: { ...state.agentConnectionStatus, [agentId]: 'error' },
                agentErrors: { ...state.agentErrors, [agentId]: error.message },
                streamingAgentMessageIds: { ...state.streamingAgentMessageIds, [agentId]: null } // Stop streaming
              }));
            },
            onDisconnect: (agentId) => {
              console.log(`[Store] WebSocket disconnected for agent ${agentId}`);
              set(state => ({
                agentConnectionStatus: { ...state.agentConnectionStatus, [agentId]: 'disconnected' },
                streamingAgentMessageIds: { ...state.streamingAgentMessageIds, [agentId]: null } // Stop streaming
              }));
            },
            onReconnect: (agentId) => {
              console.log(`[Store] WebSocket reconnecting for agent ${agentId}...`);
              set(state => ({
                agentConnectionStatus: { ...state.agentConnectionStatus, [agentId]: 'connecting' },
                agentErrors: { ...state.agentErrors, [agentId]: 'Reconnecting...' }, // Indicate reconnecting
              }));
            }
          });

          // After loading agents, check if a session exists and connect agents
          const { activeSessionId: currentSessionId, sessions: currentSessions } = get();
          if (currentSessionId) {
            get()._connectAllAgents(currentSessionId);
          } else if (currentSessions.length > 0) {
            // If no active session but sessions exist, activate the first one
            get().setActiveSession(currentSessions[0].id); 
          } else {
            // If no sessions exist, create one
            await get().createSession();
          }
          set({ isLoading: false });
          console.log("Store initialized.");
        },

        createSession: async (title?: string): Promise<string | null> => {
          set({ isLoading: true });
          get()._disconnectAllAgents(); // Disconnect agents from previous session (if any)
          
          try {
            // --- Simulate session creation ---
            const sessionId = `session_${Date.now()}`;
            const session: ChatSession = {
                id: sessionId,
                title: title || `Chat ${get().sessions.length + 1}`, // Use get() for length
                created_at: new Date().toISOString(),
                active_agents: [] // Add back empty array to satisfy type
            };
            // --- End Simulation ---

            set(state => ({
              sessions: [...state.sessions, session],
              activeSessionId: session.id,
              messages: { ...state.messages, [session.id]: [] }, // Initialize messages for new session
              agentConnectionStatus: {}, // Reset connection status
              agentErrors: {}, // Reset errors
              streamingAgentMessageIds: {}, // Reset streaming state
            }));
            
            get()._connectAllAgents(session.id); // Connect agents for the new session
            return session.id;
          } catch (error) {
             // Handle error appropriately, maybe set a global error state if needed
             console.error("Error creating session:", error);
             set({ isLoading: false }); // Ensure loading is turned off
             return null;
          } finally {
            // set({ isLoading: false }); // Moved to try/catch
          }
        },

        setActiveSession: (sessionId: string): void => {
          const { activeSessionId: currentActiveSessionId, availableAgents } = get();
          if (currentActiveSessionId === sessionId) return;

          console.log(`Setting active session to ${sessionId}`);
          get()._disconnectAllAgents(); // Disconnect agents from the old session

          set({ 
              activeSessionId: sessionId, 
              agentConnectionStatus: {}, // Reset status for the new session
              agentErrors: {},
              streamingAgentMessageIds: {},
          });

          // Connect agents for the newly activated session
          get()._connectAllAgents(sessionId);
        },

        loadAgents: async (): Promise<void> => {
          // Don't set isLoading here if called from initializeStore
          // set({ isLoading: true }); 
          let currentAgents: AgentInfo[] = [];
          try {
            const response = await fetch('/api/v1/agents'); 
            if (!response.ok) throw new Error(`Failed to load agents: ${response.statusText}`);
            
            const agentData = await response.json();
            currentAgents = agentData.agents || []; 
            
            set({ availableAgents: currentAgents });
            console.log("Available agents loaded:", currentAgents.map(a => a.name));

            // Optional: Handle agent changes while a session is active
            // (e.g., disconnect agents no longer available, connect new ones)
            // This requires comparing currentAgents with the previous state.
            // For simplicity, we'll rely on session change/creation to handle connections.

          } catch (error) {
             console.error("Error loading agents:", error);
             // Set a global error or handle appropriately
             // set({ error: error instanceof Error ? error.message : 'Unknown error loading agents' });
          } finally {
            // Don't set isLoading here if called from initializeStore
            // set({ isLoading: false });
          }
        },
        
        // Removed connectToAgent and disconnectFromAgent actions

        sendTextMessage: (content: string): void => {
          const { activeSessionId, agentConnectionStatus, availableAgents } = get();
          if (!activeSessionId) {
            console.error('Cannot send message: No active session.');
            return;
          }
          if (!content.trim()) return;

          // Add user message to local state immediately
          const userMessage: Message = {
            id: generateMessageId(),
            type: 'user',
            session_id: activeSessionId,
            parts: [{ type: 'text', content: content.trim() }],
            metadata: { timestamp: new Date().toISOString() }
          };
          set(state => ({
            messages: {
              ...state.messages,
              [activeSessionId]: [...(state.messages[activeSessionId] || []), userMessage]
            }
          }));

          // --- @mention logic ---
          // 1. Parse content for @agentName
          // 2. Find corresponding agentId(s)
          // 3. Send only to those agentIds using webSocketService.sendTextMessage(agentId, content)
          const mentionRegex = /@([a-zA-Z0-9_]+)/g;
          const mentionedNames = Array.from(content.matchAll(mentionRegex)).map(m => m[1].toLowerCase());
          const mentionedAgents = availableAgents.filter(agent =>
            mentionedNames.includes(agent.name.toLowerCase())
          );
          const connectedMentionedAgents = mentionedAgents.filter(agent =>
            agentConnectionStatus[agent.id] === 'connected'
          );

          if (connectedMentionedAgents.length > 0) {
            // Send only to mentioned agents
            console.log(`Sending message to mentioned agents: ${connectedMentionedAgents.map(a => a.name).join(', ')}`);
            connectedMentionedAgents.forEach(agent => {
              webSocketService.sendTextMessage(agent.id, content.trim());
            });
          } else {
            // No mentions, broadcast to all connected agents
            console.log(`Broadcasting message to all connected agents for session ${activeSessionId}`);
            availableAgents.forEach(agent => {
              if (agentConnectionStatus[agent.id] === 'connected') {
                webSocketService.sendTextMessage(agent.id, content.trim());
              }
            });
          }
        },

        clearAgentError: (agentId: string): void => {
          set(state => ({
            agentErrors: { ...state.agentErrors, [agentId]: null }
          }));
        },

        // --- Internal Helper Actions ---
        _connectAgent: (sessionId: string, agentId: string) => {
            set(state => ({
                agentConnectionStatus: { ...state.agentConnectionStatus, [agentId]: 'connecting' },
                agentErrors: { ...state.agentErrors, [agentId]: null } // Clear error on connect attempt
            }));
            webSocketService.connect(sessionId, agentId);
        },
        _disconnectAgent: (agentId: string) => {
            webSocketService.disconnect(agentId);
            // Status update handled by onDisconnect callback
        },
        _connectAllAgents: (sessionId: string) => {
            console.log(`Connecting all available agents for session ${sessionId}...`);
            const { availableAgents } = get();
            availableAgents.forEach(agent => {
                get()._connectAgent(sessionId, agent.id);
            });
        },
        _disconnectAllAgents: () => {
            console.log("Disconnecting all agents...");
            webSocketService.disconnectAll();
            // Status updates handled by onDisconnect callbacks
            // We might need to reset local status explicitly if callbacks don't fire reliably on bulk disconnect
            set({ agentConnectionStatus: {}, agentErrors: {}, streamingAgentMessageIds: {} }); 
        },

      }),
      {
        name: 'tkr-chat-storage', // Name for localStorage key
        partialize: (state) => ({ 
            sessions: state.sessions, 
            messages: state.messages,
            activeSessionId: state.activeSessionId,
            // Do not persist connection status or agents list
        }), 
      }
    ) // End persist
  ) // End devtools
);

export default useChatStore;
