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
import { devtools } from 'zustand/middleware';
import { 
  AgentInfo, 
  ChatSession, 
  Message, 
  MessagePart,
  // Remove A2A specific types if no longer needed elsewhere
} from '../types/api'; 
import webSocketService from '../services/websocket';

// Helper to generate unique IDs for messages if backend doesn't provide them
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

interface ChatState {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  
  // Agents
  availableAgents: AgentInfo[];
  // Track the single agent the WebSocket is currently connected to
  activeConnectionAgentId: string | null; 
  
  // Messages
  messages: Record<string, Message[]>;  // sessionId -> messages
  // Track the ID of the agent message currently being streamed
  streamingAgentMessageId: string | null; 
  
  // Loading/Connection States
  isConnecting: boolean; // WebSocket connecting state
  isLoading: boolean; // General loading state (e.g., fetching agents/sessions)
  error: string | null;

  // Actions
  createSession: (title?: string) => Promise<string | null>; // Returns new session ID or null
  setActiveSession: (sessionId: string) => void;
  loadAgents: () => Promise<void>;
  // Connects WebSocket to a specific agent for the active session
  connectToAgent: (agentId: string) => void; 
  disconnectFromAgent: () => void;
  // Sends text message via WebSocket
  sendTextMessage: (content: string) => void; 
  clearError: () => void;
}

const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      // --- Initial State ---
      sessions: [],
      activeSessionId: null,
      availableAgents: [],
      activeConnectionAgentId: null, // No agent connected initially
      messages: {},
      streamingAgentMessageId: null,
      isConnecting: false,
      isLoading: false,
      error: null,

      // --- Actions ---
      createSession: async (title?: string): Promise<string | null> => { // Add types
        set({ isLoading: true, error: null }); // Move set outside inner try
        try {
          // TODO: Replace with actual API call if session creation endpoint exists
          // const response = await fetch('/api/v1/sessions', { // Example endpoint 
          //   method: 'POST',
          //   headers: { 'Content-Type': 'application/json' },
          //   body: JSON.stringify({ title })
          // });
          // if (!response.ok) throw new Error('Failed to create session');
          // const session: ChatSession = await response.json();
          
          // --- Simulate session creation ---
          const sessionId = `session_${Date.now()}`;
          const session: ChatSession = {
              id: sessionId,
              title: title || `Chat ${Object.keys(get().sessions).length + 1}`,
              created_at: new Date().toISOString(),
              active_agents: [] // No longer tracked here
          };
          // --- End Simulation ---

          set(state => ({
            sessions: [...state.sessions, session],
            activeSessionId: session.id,
            messages: { ...state.messages, [session.id]: [] },
            activeConnectionAgentId: null, // Reset connected agent on new session
            streamingAgentMessageId: null,
          }));
          get().disconnectFromAgent(); // Disconnect any previous WS connection
          return session.id;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Unknown error creating session' });
          return null;
        } finally {
          set({ isLoading: false });
        }
      }, // Add comma

      setActiveSession: (sessionId: string): void => { // Add types
        const { activeSessionId } = get();
        if (activeSessionId === sessionId) return;

        get().disconnectFromAgent(); // Disconnect WS when changing session
        set({ 
            activeSessionId: sessionId, 
            activeConnectionAgentId: null, // Reset connected agent
            streamingAgentMessageId: null,
            error: null // Clear errors on session change
        });
      }, // Add comma

      loadAgents: async (): Promise<void> => { // Add types
        set({ isLoading: true, error: null });
        try {
          // Fetch agents from the existing endpoint
          const response = await fetch('/api/v1/agents'); // Use v1 endpoint
          if (!response.ok) throw new Error('Failed to load agents');
          
          const agentData = await response.json();
          // Assuming the response format is { agents: AgentInfo[] }
          const agents: AgentInfo[] = agentData.agents || []; 
          
          set({ availableAgents: agents });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Unknown error loading agents' });
        } finally {
          set({ isLoading: false });
        }
      }, // Add comma
      
      connectToAgent: (agentId: string): void => { // Add types
          const { activeSessionId, activeConnectionAgentId } = get();
          if (!activeSessionId) {
              set({ error: "Cannot connect: No active session." });
              return;
          }
          if (activeConnectionAgentId === agentId) {
              console.log(`Already connected to agent ${agentId}`);
              return; // Already connected to this agent
          }

          console.log(`Connecting to agent ${agentId} for session ${activeSessionId}...`);
          set({ isConnecting: true, activeConnectionAgentId: agentId, streamingAgentMessageId: null, error: null });

          webSocketService.connect(activeSessionId, agentId);
          webSocketService.setCallbacks({
              onOpen: () => {
                  console.log(`WebSocket opened for agent ${agentId}`);
                  set({ isConnecting: false });
              },
              onPacket: (packet) => {
                  const { activeSessionId, activeConnectionAgentId, streamingAgentMessageId: initialStreamingId } = get();
                  if (!activeSessionId || activeConnectionAgentId !== agentId) return; // Ignore packets if session/agent changed

                  // Explicitly type the local variable
                  let currentStreamingId: string | null = initialStreamingId; 
                  const isFinalChunk = packet.turn_complete === true;
                  const hasMessageContent = typeof packet.message === 'string';

                  // Case 1: Packet contains the final message content AND the completion signal
                  if (hasMessageContent && isFinalChunk) {
                      if (!currentStreamingId) {
                           // If somehow this is the *first* packet, create and finalize
                           const newMessage: Message = {
                                id: generateMessageId(),
                                type: 'agent',
                                agent_id: agentId,
                                session_id: activeSessionId,
                                parts: [{ type: 'text', content: packet.message! }],
                                metadata: { timestamp: new Date().toISOString(), streaming: false } // Final state
                           };
                           set(state => ({
                               messages: { ...state.messages, [activeSessionId]: [...(state.messages[activeSessionId] || []), newMessage] },
                               streamingAgentMessageId: null // Finalized
                           }));
                      } else {
                           // If already streaming, replace content and finalize
                           set(state => {
                               const sessionMessages = state.messages[activeSessionId] || [];
                               const updatedMessages = sessionMessages.map(msg => {
                                   if (msg.id === currentStreamingId) {
                                       return {
                                           ...msg,
                                           parts: [{ ...msg.parts[0], content: packet.message! }], // Replace with final content
                                           metadata: { ...msg.metadata, streaming: false, timestamp: new Date().toISOString() } // Final state
                                       };
                                   }
                                   return msg;
                               });
                               return { 
                                   messages: { ...state.messages, [activeSessionId]: updatedMessages },
                                   streamingAgentMessageId: null // Finalized
                               };
                           });
                      }
                      currentStreamingId = null; // Ensure it's cleared locally
                  } 
                  // Case 2: Packet contains message content but is NOT the final chunk
                  else if (hasMessageContent) {
                      if (!currentStreamingId) {
                          // Start a new streaming message
                          const newMessage: Message = {
                              id: generateMessageId(), 
                              type: 'agent',
                              agent_id: agentId,
                              session_id: activeSessionId,
                              parts: [{ type: 'text', content: packet.message! }], // Use non-null assertion
                              metadata: { timestamp: new Date().toISOString(), streaming: true }
                          };
                          currentStreamingId = newMessage.id!; 
                          set(state => ({
                              messages: {
                                  ...state.messages,
                                  [activeSessionId]: [...(state.messages[activeSessionId] || []), newMessage]
                              },
                              streamingAgentMessageId: currentStreamingId 
                          }));
                      } else {
                          // Append to the existing streaming message
                          set(state => {
                              const sessionMessages = state.messages[activeSessionId] || [];
                              const updatedMessages = sessionMessages.map(msg => {
                                  if (msg.id === currentStreamingId && msg.parts[0]?.type === 'text') {
                                      return {
                                          ...msg,
                                          parts: [{ ...msg.parts[0], content: msg.parts[0].content + packet.message! }], // Append
                                          metadata: { ...msg.metadata, timestamp: new Date().toISOString() }
                                      };
                                  }
                                  return msg;
                              });
                              return { messages: { ...state.messages, [activeSessionId]: updatedMessages } };
                          });
                      }
                  }
                  // Case 3: Packet ONLY contains turn_complete signal
                  else if (isFinalChunk && currentStreamingId) {
                      set(state => {
                          const sessionMessages = state.messages[activeSessionId] || [];
                          const updatedMessages = sessionMessages.map(msg => {
                              if (msg.id === currentStreamingId) {
                                  return { ...msg, metadata: { ...msg.metadata, streaming: false } };
                              }
                              return msg;
                          });
                          return {
                              messages: { ...state.messages, [activeSessionId]: updatedMessages },
                              streamingAgentMessageId: null // Stop tracking
                          };
                      });
                  }
                  
                  // Handle backend errors if sent in packet
                  if (packet.error) {
                      set({ error: `Agent Error: ${packet.error}`, streamingAgentMessageId: null });
                  }
              },
              onError: (error) => {
                  set({ error: error.message, isConnecting: false, streamingAgentMessageId: null });
              },
              onDisconnect: () => {
                  set({ isConnecting: false, activeConnectionAgentId: null, streamingAgentMessageId: null });
                  // Consider if agent should be marked as disconnected or if reconnect handles it
              },
              onReconnect: () => {
                  set({ isConnecting: true, error: "Reconnecting..." });
              }
          });
      }, // Add comma

      disconnectFromAgent: (): void => { // Add types
          console.log("Disconnecting WebSocket...");
          webSocketService.disconnect();
          set({ activeConnectionAgentId: null, isConnecting: false, streamingAgentMessageId: null });
      }, // Add comma

      sendTextMessage: (content: string): void => { // Add types
        const { activeSessionId, activeConnectionAgentId } = get();
        if (!activeSessionId || !activeConnectionAgentId) {
          set({ error: 'Not connected to an agent session.' });
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
          },
          error: null // Clear previous errors on send
        }));

        // Send plain text via WebSocket
        webSocketService.sendTextMessage(content.trim());
      }, // Add comma

      clearError: (): void => { // Add types
        set({ error: null });
      } // Remove comma

      // Removed A2A specific actions
    })
  )
);

export default useChatStore;
