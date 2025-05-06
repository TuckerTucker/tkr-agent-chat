/**
 * Socket.IO Service for TKR Multi-Agent Chat System
 * 
 * Handles real-time communication with the API Gateway using Socket.IO, including:
 * - Session management
 * - Message sending/receiving
 * - Agent-to-agent communication
 * - Reconnection with exponential backoff
 * - Offline message queuing
 * - Error handling and recovery
 */

import io from 'socket.io-client';
import EventEmitter from 'eventemitter3';

// Import standardized message schema
import { 
  MessageType, 
  UserTextMessage, 
  AgentTextMessage,
  AgentToAgentMessage,
  SystemMessage,
  ErrorMessage as StandardErrorMessage,
  ContextUpdateMessage,
  TaskUpdateMessage,
  MessageStatus,
  Message
} from '../types/messages';

// Import message adapters
import { 
  createUserTextMessage,
  createAgentTextMessage,
  normalizeMessage,
  standardToLegacy,
  legacyToStandard,
  isStandardFormat,
  isLegacyFormat 
} from '../components/lib/message-adapter';

// Environment variables using Vite
const BASE_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';

// Connection configuration
const RECONNECTION_ATTEMPTS = 10;
const RECONNECTION_DELAY = 1000;
const RECONNECTION_DELAY_MAX = 30000;
const CONNECTION_TIMEOUT = 20000;
const OFFLINE_QUEUE_MAX_SIZE = 100;

// Define the structure of messages received from the backend
export interface AgentStreamingPacket {
  message?: string; // Partial or full text message from agent
  turn_complete?: boolean;
  interrupted?: boolean;
  error?: string; // Error message from the backend
}

// A2A Message Types (Legacy format)
export interface A2AMessage {
  type: string;
  from_agent: string;
  task_id?: string;
  content: any;
  timestamp?: string;
}

// Task Event Types (Legacy format)
export interface TaskEvent {
  type: string;
  task_id: string;
  status?: string;
  context?: any;
  result?: any;
  message?: string;
  timestamp?: string;
}

// Context Event Types (Legacy format)
export interface ContextEvent {
  type: string;
  context_id: string;
  session_id: string;
  source_agent_id: string;
  context_data: any;
  timestamp?: string;
}

// Error message types (Legacy format)
export interface ErrorMessage {
  error_code: string;
  message: string;
  category?: string;
  severity?: string;
  details?: any;
  timestamp?: string;
  request_id?: string;
  recoverable?: boolean;
  retry_suggested?: boolean;
}

// Socket.IO Callbacks
export interface SocketIOCallbacks {
  onMessage?: (agentId: string, packet: AgentStreamingPacket) => void;
  onMessageComplete?: (agentId: string) => void;
  onError?: (agentId: string, error: { code: number; message: string }) => void;
  onConnect?: (agentId: string) => void;
  onDisconnect?: (agentId: string, reason: string) => void;
  onReconnect?: (agentId: string, attempt: number) => void;
  onStatusChange?: (agentId: string, status: AgentStatus) => void;
  onA2AMessage?: (message: A2AMessage) => void;
  onTaskEvent?: (event: TaskEvent) => void;
  onContextUpdate?: (event: ContextEvent) => void;
  onPacket?: (agentId: string, packet: AgentStreamingPacket) => void;
}

// Define the structure for agent status
export interface AgentStatus {
  connection: ConnectionStatus;
  activity: AgentActivityStatus;
}

// Define possible statuses
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
export type AgentActivityStatus = 'idle' | 'thinking' | 'responding' | 'error';

// Message for sending (Legacy format)
export interface OutgoingMessage {
  id: string;
  text: string;
  timestamp: number;
  agentId?: string;
  sessionId?: string;
  type?: string;
}

// Queued message with resolve/reject handlers
interface QueuedMessage {
  message: OutgoingMessage;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timestamp: number;
}

// Connection options interface
interface ConnectionOptions {
  sessionId: string;
  agentId?: string;
  reconnect?: boolean;
  forceNew?: boolean;
  namespace?: string; // Optional Socket.IO namespace to connect to
}

class SocketService extends EventEmitter {
  private socket: any | null = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = RECONNECTION_ATTEMPTS;
  private offlineMode: boolean = false;
  private offlineQueue: QueuedMessage[] = [];
  private lastSessionId: string = '';
  private lastAgentId: string = '';
  private callbacks: SocketIOCallbacks = {};
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private connectionMonitor: NodeJS.Timeout | null = null;
  private pendingMessages: Map<string, QueuedMessage> = new Map();
  
  constructor() {
    super();
    
    // eventemitter3 doesn't need setMaxListeners as it automatically scales
    // unlike Node's EventEmitter which has a default limit of 10
    
    // Enable offline mode by default until connected
    this.offlineMode = true;
    
    // Start connection monitoring
    this.startConnectionMonitoring();
  }
  
  /**
   * Connect to the Socket.IO server
   */
  connect(options: ConnectionOptions): Promise<boolean> {
    const { 
      sessionId, 
      agentId, 
      reconnect = true, 
      forceNew = false, 
      namespace = '' // Default to root namespace
    } = options;
    
    return new Promise((resolve, reject) => {
      // If already connected to the same session/agent, return success
      if (
        this.connected && 
        this.socket && 
        sessionId === this.lastSessionId && 
        (!agentId || agentId === this.lastAgentId)
      ) {
        console.log(`Already connected to session ${sessionId}${agentId ? `, agent ${agentId}` : ''}`);
        resolve(true);
        return;
      }
      
      // If currently connecting, wait for connection or failure
      if (this.connecting && !forceNew) {
        console.log('Connection in progress, waiting...');
        
        const onConnect = () => {
          this.removeListener('error', onError);
          resolve(true);
        };
        
        const onError = (error: any) => {
          this.removeListener('connect', onConnect);
          reject(error);
        };
        
        this.once('connect', onConnect);
        this.once('error', onError);
        return;
      }
      
      // Clean up existing connection if any
      this.disconnect();
      
      // Store session and agent IDs
      this.lastSessionId = sessionId;
      this.lastAgentId = agentId || '';
      
      // Set connecting state
      this.connecting = true;
      
      // Update status for agent if provided
      if (agentId) {
        this.updateAgentStatus(agentId, { connection: 'connecting', activity: 'idle' });
      }
      
      // Determine the appropriate namespace based on connection type
      let targetNamespace = namespace;
      if (!targetNamespace) {
        if (agentId) {
          // If connecting as/to an agent, use the agents namespace
          targetNamespace = '/agents';
        } else {
          // Default to root namespace for general client connections
          targetNamespace = '/';
        }
      }
      
      try {
        // Create Socket.IO connection with appropriate namespace
        this.socket = io(`${BASE_URL}${targetNamespace}`, {
          path: '/socket.io',
          transports: ['polling', 'websocket'],  // Start with polling then upgrade to websocket
          reconnection: reconnect,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: RECONNECTION_DELAY,
          reconnectionDelayMax: RECONNECTION_DELAY_MAX,
          timeout: CONNECTION_TIMEOUT,
          autoConnect: true,
          forceNew: true,  // Force a new connection
          query: {
            session_id: sessionId,
            agent_id: agentId || '',
            client_type: 'client'
          }
        });
        
        console.log(`Connecting to Socket.IO server: ${BASE_URL}${targetNamespace} with session: ${sessionId}, agent: ${agentId || 'none'}`);
        
        // Set up Socket.IO event handlers
        this.setupEventHandlers();
        
        // Handle connection timeout
        const timeout = setTimeout(() => {
          if (!this.connected) {
            this.connecting = false;
            reject(new Error('Connection timeout'));
            
            // Update agent status if provided
            if (agentId) {
              this.updateAgentStatus(agentId, { connection: 'error', activity: 'error' });
            }
          }
        }, CONNECTION_TIMEOUT);
        
        // Handle successful connection
        this.socket.on('connect', () => {
          clearTimeout(timeout);
          this.connected = true;
          this.connecting = false;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.offlineMode = false;
          
          console.log(`Connected to Socket.IO server, session: ${sessionId}${agentId ? `, agent: ${agentId}` : ''}`);
          
          // Update agent status if provided
          if (agentId) {
            this.updateAgentStatus(agentId, { connection: 'connected', activity: 'idle' });
            this.callbacks.onConnect?.(agentId);
          }
          
          // Join session room
          this.joinSession(sessionId, agentId);
          
          // Process offline queue if any
          this.processOfflineQueue();
          
          // Emit connection event
          this.emit('connect');
          
          resolve(true);
        });
        
        // Handle connection error
        this.socket.on('connect_error', (error: any) => {
          clearTimeout(timeout);
          this.connecting = false;
          console.error('Socket.IO connection error:', error);
          
          // Update agent status if provided
          if (agentId) {
            this.updateAgentStatus(agentId, { connection: 'error', activity: 'error' });
            this.callbacks.onError?.(agentId, { code: 500, message: `Connection error: ${error.message}` });
          }
          
          // Emit error event
          this.emit('error', error);
          
          reject(error);
        });
      } catch (error) {
        this.connecting = false;
        console.error('Error creating Socket.IO connection:', error);
        
        // Update agent status if provided
        if (agentId) {
          this.updateAgentStatus(agentId, { connection: 'error', activity: 'error' });
          this.callbacks.onError?.(agentId, { code: 500, message: `Connection error: ${error}` });
        }
        
        reject(error);
      }
    });
  }
  
  /**
   * Set up Socket.IO event handlers
   */
  private setupEventHandlers() {
    if (!this.socket) return;
    
    // Connection events
    this.socket.on('connect', this.handleConnect.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on('connect_error', this.handleConnectError.bind(this));
    this.socket.on('reconnect', this.handleReconnect.bind(this));
    this.socket.on('reconnect_attempt', this.handleReconnectAttempt.bind(this));
    this.socket.on('reconnect_error', this.handleReconnectError.bind(this));
    this.socket.on('reconnect_failed', this.handleReconnectFailed.bind(this));
    
    // Server-sent events
    this.socket.on('message', this.handleMessage.bind(this));
    this.socket.on('error', this.handleError.bind(this));
    this.socket.on('a2a', this.handleA2AMessage.bind(this));
    this.socket.on('task_event', this.handleTaskEvent.bind(this));
    this.socket.on('context', this.handleContextUpdate.bind(this));
    this.socket.on('ping', this.handlePing.bind(this));
    this.socket.on('pong', this.handlePong.bind(this));
    
    // Connection status events
    this.socket.on('connect:status', this.handleConnectionStatus.bind(this));
    this.socket.on('joined', this.handleJoinedRoom.bind(this));
    this.socket.on('left', this.handleLeftRoom.bind(this));
  }
  
  /**
   * Clean up event handlers
   */
  private cleanupEventHandlers() {
    if (!this.socket) return;
    
    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');
    this.socket.off('reconnect');
    this.socket.off('reconnect_attempt');
    this.socket.off('reconnect_error');
    this.socket.off('reconnect_failed');
    
    this.socket.off('message');
    this.socket.off('error');
    this.socket.off('a2a');
    this.socket.off('task_event');
    this.socket.off('context');
    this.socket.off('ping');
    this.socket.off('pong');
    
    this.socket.off('connect:status');
    this.socket.off('joined');
    this.socket.off('left');
  }
  
  /**
   * Join session and agent rooms
   */
  private joinSession(sessionId: string, agentId?: string) {
    if (!this.socket || !this.connected) return;
    
    // Join session room
    this.socket.emit('join', { type: 'session', id: sessionId });
    
    // Join agent room if provided
    if (agentId) {
      this.socket.emit('join', { type: 'agent', id: agentId });
    }
  }
  
  /**
   * Handle successful connection
   */
  private handleConnect() {
    this.connected = true;
    this.connecting = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.offlineMode = false;
    
    console.log('Socket.IO connected');
    
    // Emit connection event to local listeners
    this.emit('connection:status', { connected: true });
  }
  
  /**
   * Handle disconnection
   */
  private handleDisconnect(reason: string) {
    this.connected = false;
    this.offlineMode = true;
    
    console.log(`Socket.IO disconnected: ${reason}`);
    
    // Update agent status if there's a current agent
    if (this.lastAgentId) {
      const currentStatus = this.agentStatuses.get(this.lastAgentId);
      this.updateAgentStatus(this.lastAgentId, { 
        connection: 'disconnected', 
        activity: currentStatus?.activity || 'idle' 
      });
      this.callbacks.onDisconnect?.(this.lastAgentId, reason);
    }
    
    // Emit disconnect event to local listeners
    this.emit('connection:status', { connected: false, reason });
  }
  
  /**
   * Handle connection error
   */
  private handleConnectError(error: any) {
    console.error('Socket.IO connection error:', error);
    
    // Update agent status if there's a current agent
    if (this.lastAgentId) {
      this.updateAgentStatus(this.lastAgentId, { connection: 'error', activity: 'error' });
      this.callbacks.onError?.(this.lastAgentId, { code: 500, message: `Connection error: ${error.message}` });
    }
    
    // Emit error event to local listeners
    this.emit('connection:error', { error });
  }
  
  /**
   * Handle successful reconnection
   */
  private handleReconnect(attempt: number) {
    this.connected = true;
    this.reconnecting = false;
    this.offlineMode = false;
    
    console.log(`Socket.IO reconnected after ${attempt} attempts`);
    
    // Rejoin session and agent rooms
    this.joinSession(this.lastSessionId, this.lastAgentId);
    
    // Update agent status if there's a current agent
    if (this.lastAgentId) {
      this.updateAgentStatus(this.lastAgentId, { connection: 'connected', activity: 'idle' });
      this.callbacks.onReconnect?.(this.lastAgentId, attempt);
    }
    
    // Process offline queue
    this.processOfflineQueue();
    
    // Emit reconnection event to local listeners
    this.emit('connection:status', { connected: true, reconnected: true, attempt });
  }
  
  /**
   * Handle reconnection attempt
   */
  private handleReconnectAttempt(attempt: number) {
    this.reconnecting = true;
    this.reconnectAttempts = attempt;
    
    console.log(`Socket.IO reconnection attempt: ${attempt}`);
    
    // Update agent status if there's a current agent
    if (this.lastAgentId) {
      const currentStatus = this.agentStatuses.get(this.lastAgentId);
      this.updateAgentStatus(this.lastAgentId, { 
        connection: 'reconnecting', 
        activity: currentStatus?.activity || 'idle' 
      });
    }
    
    // Emit reconnection attempt event to local listeners
    this.emit('connection:status', { connected: false, reconnecting: true, attempt });
  }
  
  /**
   * Handle reconnection error
   */
  private handleReconnectError(error: any) {
    console.error('Socket.IO reconnection error:', error);
    
    // Emit reconnection error event to local listeners
    this.emit('connection:error', { error, reconnecting: true });
  }
  
  /**
   * Handle reconnection failure
   */
  private handleReconnectFailed() {
    this.reconnecting = false;
    
    console.error('Socket.IO reconnection failed after max attempts');
    
    // Update agent status if there's a current agent
    if (this.lastAgentId) {
      this.updateAgentStatus(this.lastAgentId, { connection: 'error', activity: 'error' });
      this.callbacks.onError?.(this.lastAgentId, { 
        code: 500, 
        message: 'Reconnection failed after maximum attempts'
      });
    }
    
    // Emit reconnection failed event to local listeners
    this.emit('connection:status', { connected: false, reconnectionFailed: true });
  }
  
  /**
   * Handle incoming message
   */
  private handleMessage(data: any) {
    console.log('Socket.IO message received:', data);
    
    // Skip echoed user messages - if there's no fromAgent/from_agent, and data has toAgent/to_agent, it's an echo
    if (
      (!data.fromAgent && !data.from_agent) && 
      (data.toAgent || data.to_agent) && 
      (data.type === 'text' || data.type === MessageType.TEXT)
    ) {
      console.log('Ignoring echoed user message:', data);
      return;
    }
    
    // Normalize message to standardized format
    const standardMessage = normalizeMessage(data);
    
    // Get agent ID from standardized format
    const agentId = standardMessage.from_agent || '';
    
    // Process by message type
    if (standardMessage.type === MessageType.TEXT && standardMessage.from_agent) {
      // Text message from agent
      const messageText = standardMessage.content as string;
      const isStreaming = !!standardMessage.streaming;
      
      // Determine agent activity status
      let activity: AgentActivityStatus = isStreaming ? 'responding' : 'idle';
      
      // Update agent status
      this.updateAgentStatus(agentId, { connection: 'connected', activity });
      
      // Create packet for callback
      const packet: AgentStreamingPacket = {
        message: messageText,
        turn_complete: standardMessage.turn_complete ?? !isStreaming, // If not streaming, message is complete
        interrupted: false
      };
      
      // Call message handler callback if provided
      this.callbacks.onPacket?.(agentId, packet);
      
      // Emit message event to local listeners
      this.emit('message', { agentId, packet });
      
    } else if (standardMessage.type === MessageType.ERROR) {
      // Error message
      const errorMessage = standardMessage as Partial<StandardErrorMessage>;
      const messageText = errorMessage.content as string;
      
      // Update agent status to error
      this.updateAgentStatus(agentId, { connection: 'connected', activity: 'error' });
      
      // Notify error handler callback
      this.callbacks.onError?.(agentId, { 
        code: 500, 
        message: typeof messageText === 'string' ? messageText : 'Unknown error'
      });
      
      // Create packet for callback
      const packet: AgentStreamingPacket = {
        message: messageText,
        turn_complete: true,
        interrupted: false,
        error: messageText
      };
      
      // Call message handler callback if provided
      this.callbacks.onPacket?.(agentId, packet);
      
      // Emit message event to local listeners
      this.emit('message', { agentId, packet });
      
    } else if (isLegacyFormat(data)) {
      // Handle remaining legacy format messages that couldn't be properly normalized
      const legacyAgentId = data.agent_id || agentId || this.lastAgentId;
      const messageText = data.message || '';
      const turnComplete = data.turn_complete || false;
      
      // Determine agent activity status
      let activity: AgentActivityStatus = 'responding';
      
      if (data.error) {
        activity = 'error';
        // If there's an error in the message, notify error handler
        this.callbacks.onError?.(legacyAgentId, { 
          code: 500, 
          message: typeof data.error === 'string' ? data.error : 'Unknown error' 
        });
      } else if (turnComplete) {
        activity = 'idle';
        // If turn is complete, notify message complete handler
        this.callbacks.onMessageComplete?.(legacyAgentId);
      }
      
      // Update agent status
      if (legacyAgentId) {
        this.updateAgentStatus(legacyAgentId, { connection: 'connected', activity });
      }
      
      // Create packet for callback
      const packet: AgentStreamingPacket = {
        message: messageText,
        turn_complete: turnComplete,
        interrupted: data.interrupted || false,
        error: data.error
      };
      
      // Call message handler callback if provided
      this.callbacks.onPacket?.(legacyAgentId, packet);
      
      // Emit message event to local listeners
      this.emit('message', { agentId: legacyAgentId, packet });
    }
  }
  
  /**
   * Handle error message
   */
  private handleError(error: ErrorMessage) {
    console.error('Socket.IO error:', error);
    
    // Update agent status if there's a current agent
    if (this.lastAgentId) {
      // Only update status to error if the error is critical
      const isCritical = error.severity === 'critical' || error.severity === 'error';
      
      if (isCritical) {
        this.updateAgentStatus(this.lastAgentId, { connection: 'error', activity: 'error' });
      }
      
      // Convert to standardized error for callback
      this.callbacks.onError?.(this.lastAgentId, { 
        code: this.getErrorCodeFromCategory(error.category), 
        message: error.message || 'Unknown error' 
      });
    }
    
    // Automatically retry connection if suggested
    if (error.retry_suggested && this.retryConnection()) {
      console.log('Automatically retrying connection based on server suggestion');
    }
    
    // Emit error event to local listeners
    this.emit('socket:error', error);
  }
  
  /**
   * Convert error category to numeric code
   */
  private getErrorCodeFromCategory(category?: string): number {
    switch (category) {
      case 'connection':
        return 503; // Service Unavailable
      case 'message':
        return 400; // Bad Request
      case 'authentication':
        return 401; // Unauthorized
      case 'authorization':
        return 403; // Forbidden
      case 'rate_limit':
        return 429; // Too Many Requests
      case 'protocol':
        return 422; // Unprocessable Entity
      case 'internal':
        return 500; // Internal Server Error
      case 'client':
        return 400; // Bad Request
      default:
        return 500; // Default to Internal Server Error
    }
  }
  
  /**
   * Handle A2A message
   */
  private handleA2AMessage(message: A2AMessage) {
    console.log('Received A2A message:', message);
    
    // Call A2A message handler callback if provided
    this.callbacks.onA2AMessage?.(message);
    
    // Emit A2A message event to local listeners
    this.emit('a2a', message);
  }
  
  /**
   * Handle task event
   */
  private handleTaskEvent(event: TaskEvent) {
    console.log('Received task event:', event);
    
    // Call task event handler callback if provided
    this.callbacks.onTaskEvent?.(event);
    
    // Emit task event to local listeners
    this.emit('task', event);
  }
  
  /**
   * Handle context update
   */
  private handleContextUpdate(event: ContextEvent) {
    console.log('Received context update:', event);
    
    // Call context update handler callback if provided
    this.callbacks.onContextUpdate?.(event);
    
    // Emit context update event to local listeners
    this.emit('context', event);
  }
  
  /**
   * Handle ping message
   */
  private handlePing(data: any) {
    console.log('Received ping:', data);
    
    // Send pong response
    if (this.socket && this.connected) {
      this.socket.emit('pong', { timestamp: new Date().toISOString() });
    }
  }
  
  /**
   * Handle pong message
   */
  private handlePong(data: any) {
    console.log('Received pong:', data);
    
    // Update connection status - connection is verified
    this.emit('connection:health', { verified: true, timestamp: data.timestamp });
  }
  
  /**
   * Handle connection status message
   */
  private handleConnectionStatus(data: any) {
    console.log('Received connection status:', data);
    
    // Process connection status
    const connected = data.connected || false;
    const agentId = data.agent_id || this.lastAgentId;
    
    if (connected) {
      this.connected = true;
      this.offlineMode = false;
      
      // Update agent status if there's a current agent
      if (agentId) {
        this.updateAgentStatus(agentId, { connection: 'connected', activity: 'idle' });
      }
    } else {
      this.connected = false;
      this.offlineMode = true;
      
      // Update agent status if there's a current agent
      if (agentId) {
        this.updateAgentStatus(agentId, { connection: 'disconnected', activity: 'idle' });
      }
    }
    
    // Emit connection status event to local listeners
    this.emit('connection:status', data);
  }
  
  /**
   * Handle joined room message
   */
  private handleJoinedRoom(data: any) {
    console.log('Joined room:', data);
    
    // Emit joined room event to local listeners
    this.emit('room:joined', data);
  }
  
  /**
   * Handle left room message
   */
  private handleLeftRoom(data: any) {
    console.log('Left room:', data);
    
    // Emit left room event to local listeners
    this.emit('room:left', data);
  }
  
  /**
   * Send a text message
   */
  async sendTextMessage(agentId: string, text: string): Promise<any> {
    if (!text.trim()) return;
    
    // Create a standardized message
    const standardMessage = createUserTextMessage(
      text.trim(),
      this.lastSessionId,
      agentId
    );
    
    // Create legacy format message for compatibility
    const legacyMessage: OutgoingMessage = {
      id: standardMessage.id,
      text: standardMessage.content as string,
      timestamp: Date.now(),
      agentId,
      sessionId: this.lastSessionId,
      type: 'text'
    };
    
    // If offline, queue the message and return
    if (this.offlineMode || !this.connected || !this.socket) {
      return this.queueMessage(legacyMessage);
    }
    
    // Send message
    return new Promise((resolve, reject) => {
      // Add to pending messages (using legacy format for now)
      this.pendingMessages.set(standardMessage.id, {
        message: legacyMessage,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      try {
        // Convert standardized message to format expected by server
        // For backward compatibility, we send both formats (standardized and legacy)
        // eventually we'll use just standardMessage directly
        const formattedMessage = {
          // Standardized fields (snake_case)
          id: standardMessage.id,
          type: standardMessage.type,
          session_id: standardMessage.session_id,
          from_user: standardMessage.from_user,
          to_agent: standardMessage.to_agent,
          content: standardMessage.content,
          timestamp: standardMessage.timestamp,
          
          // Legacy fields (camelCase) - for backward compatibility
          sessionId: standardMessage.session_id,
          text: standardMessage.content,
          fromAgent: undefined,
          toAgent: standardMessage.to_agent
        };
        
        // Send message with acknowledgment and timeout
        this.socket!.timeout(5000).emit('message', formattedMessage, (err: Error | null, ack: any) => {
          // Remove from pending messages
          this.pendingMessages.delete(standardMessage.id);
          
          if (err) {
            console.error('Error sending message:', err);
            this.handleMessageTimeout(standardMessage.id, err);
            reject(err);
          } else {
            console.log('Message sent successfully:', ack);
            
            // Check if the acknowledgment indicates an error
            if (ack && ack.status === 'error') {
              reject(new Error(ack.message || 'Unknown error sending message'));
            } else {
              resolve(ack);
            }
          }
        });
      } catch (error) {
        // Handle immediate errors
        console.error('Error sending message:', error);
        this.pendingMessages.delete(standardMessage.id);
        
        // Queue message for retry if it's a connection error
        this.queueMessage(legacyMessage);
        
        reject(error);
      }
    });
  }
  
  /**
   * Queue a message for sending when connection is restored
   */
  private queueMessage(message: OutgoingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log('Queuing message for later delivery:', message);
      
      // Check if queue is full
      if (this.offlineQueue.length >= OFFLINE_QUEUE_MAX_SIZE) {
        // Remove oldest message
        this.offlineQueue.shift();
      }
      
      // Add message to queue
      this.offlineQueue.push({
        message,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      // Emit queue update event
      this.emit('queue:updated', { 
        queued: true, 
        queueSize: this.offlineQueue.length, 
        message 
      });
    });
  }
  
  /**
   * Process offline queue
   */
  private async processOfflineQueue() {
    if (!this.connected || this.offlineQueue.length === 0) return;
    
    console.log(`Processing offline queue (${this.offlineQueue.length} messages)`);
    
    // Create a copy of the queue and clear it
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];
    
    // Emit queue update event
    this.emit('queue:updated', { queued: false, queueSize: 0 });
    
    // Process messages in order
    for (const { message, resolve, reject } of queue) {
      try {
        // Re-send the message
        const result = await this.sendTextMessage(
          message.agentId || this.lastAgentId,
          message.text
        );
        
        // Resolve the original promise
        resolve(result);
      } catch (error) {
        console.error('Error processing queued message:', error);
        
        // Reject the original promise
        reject(error);
      }
    }
    
    console.log('Offline queue processed');
  }
  
  /**
   * Handle message timeout
   */
  private handleMessageTimeout(messageId: string, error?: Error) {
    // Get pending message
    const pendingMessage = this.pendingMessages.get(messageId);
    if (!pendingMessage) return;
    
    console.error('Message timeout:', messageId);
    
    // Remove from pending messages
    this.pendingMessages.delete(messageId);
    
    // Reject with timeout error
    pendingMessage.reject(error || new Error('Message send timeout'));
    
    // Queue message for retry
    this.queueMessage(pendingMessage.message);
  }
  
  /**
   * Connect to the task namespace and subscribe to a specific task's events
   */
  async connectToTaskNamespace(sessionId: string, taskId: string): Promise<boolean> {
    console.log(`Connecting to task namespace for task ${taskId}...`);
    
    try {
      // Connect to the tasks namespace
      await this.connect({
        sessionId,
        reconnect: true,
        namespace: '/tasks' // Use the tasks namespace
      });
      
      // Subscribe to the task
      await this.subscribeToTask(taskId);
      
      return true;
    } catch (error) {
      console.error(`Failed to connect to task namespace for task ${taskId}:`, error);
      return false;
    }
  }
  
  /**
   * Connect as an agent to the agent namespace
   */
  async connectAsAgent(sessionId: string, agentId: string): Promise<boolean> {
    console.log(`Connecting as agent ${agentId} to agent namespace...`);
    
    try {
      // Connect to the agents namespace
      await this.connect({
        sessionId,
        agentId,
        reconnect: true,
        namespace: '/agents' // Use the agents namespace
      });
      
      return true;
    } catch (error) {
      console.error(`Failed to connect as agent ${agentId}:`, error);
      return false;
    }
  }
  
  /**
   * Send A2A message
   */
  async sendA2AMessage(fromAgentId: string, toAgentId: string, content: any, taskId?: string): Promise<any> {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Socket not connected'));
    }
    
    // Ensure we're connected to the /agents namespace
    if (!this.socket.nsp || this.socket.nsp.name !== '/agents') {
      console.warn('Not connected to /agents namespace, attempting to connect...');
      try {
        await this.connectAsAgent(this.lastSessionId, fromAgentId);
      } catch (error) {
        return Promise.reject(new Error('Failed to connect to agents namespace'));
      }
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Send A2A message with acknowledgment
        this.socket!.timeout(5000).emit('message', {
          type: 'a2a',
          from_agent: fromAgentId,
          to_agent: toAgentId,
          content,
          task_id: taskId,
          timestamp: new Date().toISOString()
        }, (err: Error | null, ack: any) => {
          if (err) {
            console.error('Error sending A2A message:', err);
            reject(err);
          } else {
            console.log('A2A message sent successfully:', ack);
            resolve(ack);
          }
        });
      } catch (error) {
        console.error('Error sending A2A message:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Subscribe to task events
   */
  async subscribeToTask(taskId: string): Promise<void> {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Socket not connected'));
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Send subscription request - use direct 'subscribe' event for tasks namespace
        this.socket!.emit('subscribe', {
          task_id: taskId
        }, (err: Error | null, ack: any) => {
          if (err) {
            console.error('Error subscribing to task:', err);
            reject(err);
          } else {
            console.log('Subscribed to task successfully:', ack);
            resolve();
          }
        });
      } catch (error) {
        console.error('Error subscribing to task:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Unsubscribe from task events
   */
  async unsubscribeFromTask(taskId: string): Promise<void> {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Socket not connected'));
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Send unsubscription request - use direct 'unsubscribe' event for tasks namespace
        this.socket!.emit('unsubscribe', {
          task_id: taskId
        }, (err: Error | null, ack: any) => {
          if (err) {
            console.error('Error unsubscribing from task:', err);
            reject(err);
          } else {
            console.log('Unsubscribed from task successfully:', ack);
            resolve();
          }
        });
      } catch (error) {
        console.error('Error unsubscribing from task:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string, result?: any): Promise<void> {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Socket not connected'));
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Send task update request
        this.socket!.emit('message', {
          type: 'task',
          action: 'update_status',
          task_id: taskId,
          data: {
            status,
            result
          }
        }, (err: Error | null, ack: any) => {
          if (err) {
            console.error('Error updating task status:', err);
            reject(err);
          } else {
            console.log('Task status updated successfully:', ack);
            resolve();
          }
        });
      } catch (error) {
        console.error('Error updating task status:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Disconnect from the Socket.IO server
   * @returns Promise that resolves when disconnect is complete
   */
  disconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      
      console.log('Disconnecting from Socket.IO server');
      
      try {
        // Set flags first to prevent reconnection attempts
        this.connected = false;
        this.connecting = false;
        this.reconnecting = false;
        
        // Clean up event handlers
        this.cleanupEventHandlers();
        
        // Only use timeout if socket is still connected
        if (this.socket.connected) {
          // Attempt clean disconnect with timeout - increased to 5 seconds
          const disconnectTimeout = setTimeout(() => {
            console.log('Forced Socket.IO disconnect due to timeout');
            if (this.socket) {
              this.socket.close();
              this.socket = null;
            }
            resolve();
          }, 5000);
          
          // Set up one-time listener for disconnect event
          this.socket.once('disconnect', () => {
            console.log('Socket.IO disconnected cleanly');
            clearTimeout(disconnectTimeout);
            this.socket = null;
            resolve();
          });
          
          // Close socket
          this.socket.disconnect();
        } else {
          // Socket wasn't connected, just clean up
          this.socket = null;
          resolve();
        }
        
        // Reset state
        this.connected = false;
        this.connecting = false;
        this.reconnecting = false;
        this.offlineMode = true;
        
        // Update agent status if there's a current agent
        if (this.lastAgentId) {
          this.updateAgentStatus(this.lastAgentId, { connection: 'disconnected', activity: 'idle' });
          this.callbacks.onDisconnect?.(this.lastAgentId, 'manual_disconnect');
        }
        
        // Emit disconnect event to local listeners
        this.emit('connection:status', { connected: false, reason: 'manual_disconnect' });
      } catch (error) {
        console.error('Error disconnecting from Socket.IO server:', error);
        this.socket = null;
        resolve(); // Still resolve even on error
      }
    });
  }
  
  /**
   * Start connection monitoring
   */
  private startConnectionMonitoring() {
    // Clear any existing interval
    this.stopConnectionMonitoring();
    
    // Start new interval
    this.connectionMonitor = setInterval(() => {
      this.checkConnection();
    }, 30000); // Check every 30 seconds
  }
  
  /**
   * Stop connection monitoring
   */
  private stopConnectionMonitoring() {
    if (this.connectionMonitor) {
      clearInterval(this.connectionMonitor);
      this.connectionMonitor = null;
    }
  }
  
  /**
   * Check connection status
   */
  private checkConnection() {
    // Skip if not connected or already reconnecting
    if (!this.socket || this.reconnecting) return;
    
    // If socket reports connected but we haven't received any messages
    if (this.socket.connected) {
      // Send ping to verify connection
      this.ping().catch(error => {
        console.error('Ping failed, connection may be stale:', error);
        
        // If ping fails, force reconnection
        this.handleZombieConnection();
      });
    } else if (!this.reconnecting && !this.connecting) {
      // If socket reports disconnected but we're not reconnecting
      console.log('Socket reports disconnected but not reconnecting, attempting reconnection');
      this.reconnect();
    }
  }
  
  /**
   * Handle zombie connection (socket is connected but actually dead)
   */
  handleZombieConnection() {
    console.log('Detected zombie connection, forcing reconnection');
    
    // Force disconnect and reconnect
    if (this.socket) {
      this.socket.disconnect();
    }
    
    this.connected = false;
    this.reconnect();
  }
  
  /**
   * Send ping to verify connection
   */
  ping(): Promise<any> {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Socket not connected'));
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Send ping with timeout
        this.socket!.timeout(5000).emit('ping', { 
          timestamp: new Date().toISOString() 
        }, (err: Error | null, response: any) => {
          if (err) {
            console.error('Ping error:', err);
            reject(err);
          } else {
            console.log('Ping success:', response);
            resolve(response);
          }
        });
      } catch (error) {
        console.error('Error sending ping:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Calculate backoff delay with jitter
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = RECONNECTION_DELAY;
    const maxDelay = RECONNECTION_DELAY_MAX;
    const exponential = Math.min(maxDelay, baseDelay * Math.pow(1.5, attempt));
    const jitter = Math.random() * 0.3 * exponential;
    return Math.floor(exponential + jitter);
  }
  
  /**
   * Manually trigger reconnection
   */
  reconnect() {
    if (this.reconnecting) {
      console.log('Already reconnecting, ignoring duplicate request');
      return;
    }
    
    this.reconnecting = true;
    this.reconnectAttempts = 0;
    
    // Emit reconnecting event
    this.emit('connection:status', { connected: false, reconnecting: true, attempt: 0 });
    
    // If there's a current agent ID, update status
    if (this.lastAgentId) {
      const currentStatus = this.agentStatuses.get(this.lastAgentId);
      this.updateAgentStatus(this.lastAgentId, { 
        connection: 'reconnecting', 
        activity: currentStatus?.activity || 'idle' 
      });
    }
    
    // Define reconnection function
    const attemptReconnect = () => {
      // Check if max attempts reached
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.reconnecting = false;
        
        // Emit reconnection failed event
        this.emit('connection:status', { connected: false, reconnectionFailed: true });
        
        // If there's a current agent ID, update status
        if (this.lastAgentId) {
          this.updateAgentStatus(this.lastAgentId, { connection: 'error', activity: 'error' });
          this.callbacks.onError?.(this.lastAgentId, { 
            code: 500, 
            message: 'Reconnection failed after maximum attempts'
          });
        }
        
        return;
      }
      
      // Calculate delay with jitter
      const delay = this.calculateBackoff(this.reconnectAttempts);
      
      // Emit reconnection attempt event
      this.emit('connection:status', { 
        connected: false, 
        reconnecting: true, 
        attempt: this.reconnectAttempts + 1,
        delay
      });
      
      // Wait for delay and attempt reconnection
      setTimeout(async () => {
        this.reconnectAttempts++;
        
        try {
          // Attempt to reconnect
          await this.connect({
            sessionId: this.lastSessionId,
            agentId: this.lastAgentId,
            reconnect: true,
            forceNew: true
          });
          
          // If successful, we're done
          this.reconnecting = false;
        } catch (error) {
          console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
          
          // Try again
          attemptReconnect();
        }
      }, delay);
    };
    
    // Start reconnection process
    attemptReconnect();
  }
  
  /**
   * Set callback handlers
   */
  setCallbacks(callbacks: SocketIOCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  
  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): AgentStatus {
    return this.agentStatuses.get(agentId) || { connection: 'disconnected', activity: 'idle' };
  }
  
  /**
   * Get all agent statuses
   */
  getAllAgentStatuses(): Map<string, AgentStatus> {
    return new Map(this.agentStatuses);
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && !!this.socket && this.socket.connected;
  }
  
  /**
   * Check if reconnecting
   */
  isReconnecting(): boolean {
    return this.reconnecting;
  }
  
  /**
   * Get offline queue status
   */
  getOfflineQueueStatus(): { offlineMode: boolean; queueSize: number } {
    return {
      offlineMode: this.offlineMode,
      queueSize: this.offlineQueue.length
    };
  }
  
  /**
   * Manually retry connection
   */
  retryConnection(agentId?: string): boolean {
    // If agent ID is provided, validate it's the current one
    if (agentId && agentId !== this.lastAgentId) {
      console.warn(`Cannot retry connection for agent ${agentId}, current agent is ${this.lastAgentId}`);
      return false;
    }
    
    // Only retry if disconnected, error, or zombie connection
    const shouldRetry = 
      !this.connected || 
      !this.socket?.connected ||
      (this.lastAgentId && this.agentStatuses.get(this.lastAgentId)?.connection === 'error');
    
    if (shouldRetry) {
      console.log('Manually retrying connection');
      this.reconnect();
      return true;
    }
    
    return false;
  }
  
  /**
   * Update agent status
   */
  private updateAgentStatus(agentId: string, newStatus: Partial<AgentStatus>) {
    const currentStatus = this.agentStatuses.get(agentId) || { connection: 'disconnected', activity: 'idle' };
    const updatedStatus = { ...currentStatus, ...newStatus };
    
    // Only update and notify if status changed
    if (
      currentStatus.connection !== updatedStatus.connection ||
      currentStatus.activity !== updatedStatus.activity
    ) {
      this.agentStatuses.set(agentId, updatedStatus);
      console.log(`Agent ${agentId} status updated:`, updatedStatus);
      
      // Notify callback
      this.callbacks.onStatusChange?.(agentId, updatedStatus);
      
      // Emit status change event
      this.emit('agent:status', { agentId, status: updatedStatus });
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    console.log('Cleaning up Socket.IO service');
    
    // Stop connection monitoring
    this.stopConnectionMonitoring();
    
    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Clear all listeners
    this.removeAllListeners();
    
    // Reset state
    this.connected = false;
    this.connecting = false;
    this.reconnecting = false;
    this.offlineMode = true;
    this.offlineQueue = [];
    this.pendingMessages.clear();
    this.agentStatuses.clear();
  }
}

// Create singleton instance
const socketService = new SocketService();

// Export singleton
export default socketService;