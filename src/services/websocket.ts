/**
 * WebSocket Service for TKR Multi-Agent Chat System
 * 
 * Handles real-time communication with the API Gateway, including:
 * - Session management
 * - Message sending/receiving
 * - Reconnection logic
 */

// Removed unused WebSocketMessage, ErrorResponse imports
// import { WebSocketMessage, ErrorResponse } from '../types/api';

// API Gateway WebSocket URLs using environment variables
const WS_BASE_URL = import.meta.env.VITE_WS_URL ? `${import.meta.env.VITE_WS_URL}/ws/v1` : 'ws://localhost:8000/ws/v1';
const WS_A2A_BASE_URL = import.meta.env.VITE_WS_URL ? `${import.meta.env.VITE_WS_URL}/ws/v1/a2a` : 'ws://localhost:8000/ws/v1/a2a';
const RECONNECT_DELAY = 5000; // Increased initial delay
const INITIAL_CONNECT_DELAY = 2000; // Delay before first connection attempt

// Define the structure of messages received from the backend ADK stream
interface AgentStreamingPacket {
  message?: string; // Partial or full text message from agent
  turn_complete?: boolean;
  interrupted?: boolean;
  error?: string; // Error message from the backend
}

// A2A Message Types
export interface A2AMessage {
  type: string;
  from_agent: string;
  task_id?: string;
  content: any;
}

export interface TaskEvent {
  type: 'task_state' | 'task_update' | 'error';
  task_id: string;
  status?: string;
  context?: any;
  result?: any;
  message?: string;
}

export interface WebSocketCallbacks {
  // Existing callbacks
  onPacket?: (agentId: string, packet: AgentStreamingPacket) => void;
  onError?: (agentId: string, error: { code: number; message: string }) => void;
  onReconnect?: (agentId: string) => void;
  onDisconnect?: (agentId: string) => void;
  onOpen?: (agentId: string) => void;
  onStatusChange?: (agentId: string, status: AgentStatus) => void;
  // New A2A callbacks
  onA2AMessage?: (message: A2AMessage) => void;
  onTaskEvent?: (event: TaskEvent) => void;
}

// Define the structure for agent status
export interface AgentStatus {
  connection: ConnectionStatus;
  activity: AgentActivityStatus;
}

// Define possible statuses
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
type AgentActivityStatus = 'idle' | 'thinking' | 'responding' | 'error';


// Type for managing individual connection state
interface AgentConnection {
    socket: WebSocket;
    sessionId: string;
    agentId: string;
    connectionUrl: string;
    reconnectAttempts: number;
    reconnectTimeout: NodeJS.Timeout | null;
    isConnecting: boolean;
    // Add status tracking to the connection object
    status: AgentStatus;
}

class WebSocketService {
  // Existing connection management
  private connections: Map<string, AgentConnection> = new Map();
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private callbacks: WebSocketCallbacks = {};
  private maxReconnectAttempts = 7; // Increased from 5 to 7 for more resilience
  private reconnectBackoffMultiplier = 1.5; // Use a more moderate backoff multiplier (was implicitly 2)
  private maxReconnectDelay = 30000; // Cap reconnect delay at 30 seconds

  // Connection monitoring
  private connectionMonitorInterval: NodeJS.Timeout | null = null;
  private readonly CONNECTION_MONITOR_FREQUENCY = 15000; // Check every 15 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // Mark as error if no activity for 60 seconds

  // A2A connection management
  private a2aConnections: Map<string, WebSocket> = new Map(); // agentId -> WebSocket
  private taskSubscriptions: Map<string, WebSocket> = new Map(); // taskId -> WebSocket
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map(); // For managing reconnection timeouts

  /**
   * Connect to the WebSocket server for chat communication
   */
  connect(sessionId: string, agentId: string) {
    // Get last known status or default
    const initialStatus = this.agentStatuses.get(agentId) ?? { connection: 'disconnected', activity: 'idle' };
    this.updateAgentStatus(agentId, { ...initialStatus, connection: 'connecting' });

    const existingConnection = this.connections.get(agentId);
    
    // If there's an existing connection in OPEN state with the same session, just return
    if (existingConnection && 
        existingConnection.socket.readyState === WebSocket.OPEN && 
        existingConnection.sessionId === sessionId) {
      console.log(`[Agent: ${agentId}] Already connected to session ${sessionId}`);
      return;
    }
    
    // If there's an existing connection in any state, disconnect it first
    if (existingConnection) {
      console.log(`[Agent: ${agentId}] Cleaning up existing connection before reconnecting`);
      this.disconnect(agentId, false);
    }

    // Add delay before initial connection attempt
    setTimeout(() => {
      this.establishConnection(sessionId, agentId);
    }, INITIAL_CONNECT_DELAY);
    
    // Start connection monitoring if it's not already running
    this.startConnectionMonitoring();
  }
  
  /**
   * Start the connection monitoring interval to detect and clean up stale connections
   */
  private startConnectionMonitoring() {
    // Only start if not already monitoring
    if (this.connectionMonitorInterval) return;
    
    console.log(`Starting connection monitoring (every ${this.CONNECTION_MONITOR_FREQUENCY / 1000}s)`);
    
    // Create a heartbeat timestamp map to track last activity
    const lastActivity = new Map<string, number>();
    
    this.connectionMonitorInterval = setInterval(() => {
      const now = Date.now();
      
      // Check all connections
      this.connections.forEach((connection, agentId) => {
        // Skip connections that aren't in OPEN state
        if (connection.socket.readyState !== WebSocket.OPEN) return;
        
        // Initialize activity timestamp if not present
        if (!lastActivity.has(agentId)) {
          lastActivity.set(agentId, now);
          return;
        }
        
        const lastActiveTime = lastActivity.get(agentId) || 0;
        const inactiveTime = now - lastActiveTime;
        
        // If inactive for too long, mark as potential zombie
        if (inactiveTime > this.CONNECTION_TIMEOUT) {
          console.warn(`[Agent: ${agentId}] Connection appears stale (inactive for ${Math.round(inactiveTime / 1000)}s)`);
          
          // Send a ping to check if still alive
          try {
            // Use a ping-like message
            connection.socket.send(JSON.stringify({ type: "ping" }));
            
            // Update status to indicate potential issue
            this.updateAgentStatus(agentId, { 
              connection: 'error',
              activity: this.agentStatuses.get(agentId)?.activity ?? 'idle'
            });
            
            // If ping doesn't get a response, the onclose handler will trigger
            // and handle the reconnection logic
          } catch (error) {
            console.error(`[Agent: ${agentId}] Failed to ping stale connection:`, error);
            // Force disconnect and attempt reconnect
            this.disconnect(agentId, true);
          }
        }
      });
      
      // Update activity timestamps on successful messages
      // This is done by updating the map when messages are received in onmessage handler
      
    }, this.CONNECTION_MONITOR_FREQUENCY);
  }
  
  /**
   * Stop the connection monitoring interval
   */
  private stopConnectionMonitoring() {
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
      this.connectionMonitorInterval = null;
    }
  }

  private establishConnection(sessionId: string, agentId: string) {
    // We should never have an existing connection at this point since we clean it up in connect()
    // But let's double-check to be safe
    const currentConnection = this.connections.get(agentId);
    if (currentConnection) {
      console.warn(`[Agent: ${agentId}] Found unexpected existing connection during establishConnection. Cleaning up.`);
      this.disconnect(agentId, false);
    }

    const connectionUrl = `${WS_BASE_URL}/chat/${sessionId}/${agentId}`;
    console.log(`Connecting agent ${agentId} to WebSocket at ${connectionUrl}...`);

    let socket: WebSocket;
    try {
        socket = new WebSocket(connectionUrl);
    } catch (error) {
        console.error(`[Agent: ${agentId}] WebSocket connection failed:`, error);
        this.handleError(agentId, { code: 503, message: "WebSocket connection failed" });
        // Don't create connection object, attemptReconnect will handle if needed later
        // We might need a way to track failed initial attempts if reconnect is desired
        return; 
    }

    // Create and store connection state immediately
    const connection: AgentConnection = {
        socket,
        sessionId,
        agentId,
        connectionUrl,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isConnecting: true, // Mark as connecting
        status: { connection: 'connecting', activity: 'idle' }, // Initial status
    };
    this.connections.set(agentId, connection);
    // Also update the persistent status map
    this.agentStatuses.set(agentId, connection.status);


    socket.onopen = () => {
      console.log(`[Agent: ${agentId}] WebSocket connected.`);
      connection.isConnecting = false;
      connection.reconnectAttempts = 0; // Reset on successful connection
      this.updateAgentStatus(agentId, { connection: 'connected', activity: 'idle' }); // Update status
      this.callbacks.onOpen?.(agentId);
    };

    socket.onmessage = (event) => {
      // Record activity timestamp for connection monitoring
      (this as any).lastActivityTimestamps = (this as any).lastActivityTimestamps || new Map<string, number>();
      (this as any).lastActivityTimestamps.set(agentId, Date.now());
      
      let currentActivity: AgentActivityStatus = 'responding'; // Assume responding if packet received
      
      try {
        // Try to parse as JSON
        let packet: AgentStreamingPacket | { type: string };
        try {
          packet = JSON.parse(event.data);
        } catch (parseError) {
          // If not JSON, treat as plain text and create a message packet
          packet = { message: event.data };
        }
        
        // Handle ping/pong messages for connection health checks
        if ('type' in packet && packet.type === 'pong') {
          console.log(`[Agent: ${agentId}] Received pong, connection verified`);
          // Update status to connected if previously in error state
          const currentStatus = this.agentStatuses.get(agentId);
          if (currentStatus?.connection === 'error') {
            this.updateAgentStatus(agentId, { connection: 'connected', activity: currentStatus.activity });
          }
          return; // Don't process further for ping/pong messages
        }
        
        // Infer agent activity status from packet
        if ('error' in packet && packet.error) {
            currentActivity = 'error';
            console.error(`[Agent: ${agentId}] Error packet received:`, packet.error);
            
            // Provide more context in the UI about the error
            this.handleError(agentId, { 
              code: 500, 
              message: typeof packet.error === 'string' 
                ? packet.error 
                : 'An error occurred while processing the request'
            });
        } else if ('turn_complete' in packet && packet.turn_complete) {
            currentActivity = 'idle'; // Turn complete, back to idle
        } else if ('interrupted' in packet && packet.interrupted) {
            currentActivity = 'idle'; // Interrupted, back to idle (or maybe 'interrupted' status?)
            console.log(`[Agent: ${agentId}] Turn interrupted.`);
        } else if ('message' in packet && packet.message) {
            // If only message, assume still responding/thinking
            // We could add a 'thinking' state if the backend sends specific signals
            currentActivity = 'responding';
        }

        // Update status and ensure connection is marked as connected
        // This helps recover from error states when normal messages resume
        const currentStatus = this.agentStatuses.get(agentId);
        
        // Always update connection state to 'connected' on successful message receipt
        let newConnectionState: ConnectionStatus = 'connected';
        
        // Only update if status has changed
        if (currentStatus?.connection !== newConnectionState || currentStatus?.activity !== currentActivity) {
            this.updateAgentStatus(agentId, { 
              connection: newConnectionState, 
              activity: currentActivity 
            });
        }

        // Forward packet to callback if it's a valid stream packet
        if ('message' in packet || 'turn_complete' in packet || 'interrupted' in packet || 'error' in packet) {
          this.callbacks.onPacket?.(agentId, packet as AgentStreamingPacket);
        }
      } catch (error) {
        console.error(`[Agent: ${agentId}] Failed to process WebSocket packet:`, error);
        this.updateAgentStatus(agentId, { connection: 'connected', activity: 'error' }); // Mark activity as error
        
        // Notify client with more detailed error
        this.callbacks.onError?.(agentId, { 
          code: 400, 
          message: `Failed to process message: ${(error as Error).message || 'Unknown error'}`
        });
      }
    };

    socket.onerror = (event) => {
      console.error(`[Agent: ${agentId}] WebSocket error event:`, event);
      connection.isConnecting = false;
      // Update status on WebSocket error event
      this.updateAgentStatus(agentId, { ...this.agentStatuses.get(agentId) ?? { connection: 'error', activity: 'idle' }, connection: 'error' });
      // Don't trigger reconnect here, onclose will handle it
    };

    socket.onclose = (event) => {
      console.log(`[Agent: ${agentId}] WebSocket disconnected: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
      connection.isConnecting = false;
      const wasConnectionManaged = this.connections.has(agentId); // Check if it was in our map

      // Determine final connection status based on close code
      const finalConnectionStatus: ConnectionStatus = event.code === 1000 ? 'disconnected' : 'error';
      // Keep last known activity status unless connection is now an error
      const finalActivityStatus = finalConnectionStatus === 'error' ? 'error' : (this.agentStatuses.get(agentId)?.activity ?? 'idle');

      // Update the persistent status map
      this.updateAgentStatus(agentId, { connection: finalConnectionStatus, activity: finalActivityStatus });

      // Clean up the connection state *before* attempting reconnect
      this.clearReconnectTimeout(agentId); // Clear any existing timer
      this.connections.delete(agentId); // Remove from active connections map

      this.callbacks.onDisconnect?.(agentId); // Notify client of disconnect

      // Only attempt reconnect if it was previously managed by us
      // And if the disconnect wasn't clean (or based on specific codes)
      // Let's simplify: always attempt reconnect if it was in the map, unless explicitly disconnected
      if (wasConnectionManaged && event.code !== 1000) { // Don't reconnect on normal closure (code 1000)
          this.attemptReconnect(connection); // Pass the old connection state (includes attempt count)
      }
    };
  }

  /**
   * Disconnect a specific agent's WebSocket connection.
   * @param agentId - The ID of the agent to disconnect.
   * @param attemptReconnect - If true, will try to reconnect after disconnecting. (Usually false for manual disconnect)
   */
  disconnect(agentId: string, attemptReconnect = false) {
    const connection = this.connections.get(agentId);
    if (!connection) {
      console.log(`[Agent: ${agentId}] No active connection to disconnect.`);
      return;
    }

    console.log(`[Agent: ${agentId}] Disconnecting WebSocket...`);
    this.clearReconnectTimeout(agentId); // Stop any pending reconnect attempts for this agent

    connection.socket.onclose = null; // Prevent the default onclose handler (which might reconnect)
    connection.socket.close(1000, "Client initiated disconnect"); // Use code 1000 for normal closure

    this.connections.delete(agentId); // Remove from map immediately

    // Manually trigger callback if needed, as onclose is bypassed
    // this.callbacks.onDisconnect?.(agentId); 

    if (attemptReconnect) {
        // This is less common for manual disconnects, but possible
        this.attemptReconnect(connection); 
    }
  }

  /**
   * Attempt to reconnect a specific agent's connection.
   * Uses improved exponential backoff strategy with capped max delay.
   */
  private attemptReconnect(closedConnection: AgentConnection) {
    // Check if we should attempt reconnection
    if (closedConnection.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`[Agent: ${closedConnection.agentId}] Max reconnection attempts reached. Stopping.`);
      this.callbacks.onError?.(closedConnection.agentId, { 
        code: 503, 
        message: 'Connection failed after multiple attempts.' 
      });
      
      // After max attempts, mark as error but allow manual reconnection later
      this.updateAgentStatus(closedConnection.agentId, { 
        connection: 'error', 
        activity: 'error'
      });
      return;
    }

    // Clear any existing reconnect timeout
    this.clearReconnectTimeout(closedConnection.agentId);

    // Calculate delay with exponential backoff
    const attempts = closedConnection.reconnectAttempts + 1;
    
    // Calculate delay with more moderate backoff and capped maximum
    let delay = RECONNECT_DELAY * Math.pow(this.reconnectBackoffMultiplier, attempts - 1);
    
    // Add some jitter to prevent all clients reconnecting simultaneously
    // (beneficial in high traffic scenarios)
    const jitter = Math.random() * 1000; // Random jitter up to 1s
    delay = Math.min(delay + jitter, this.maxReconnectDelay);
    
    console.log(`[Agent: ${closedConnection.agentId}] Attempting to reconnect in ${Math.round(delay / 1000)}s (${attempts}/${this.maxReconnectAttempts})...`);

    // Update status and notify UI
    this.updateAgentStatus(closedConnection.agentId, { 
      connection: 'reconnecting', 
      activity: this.agentStatuses.get(closedConnection.agentId)?.activity ?? 'idle' 
    });
    this.callbacks.onReconnect?.(closedConnection.agentId);

    // Store reconnect timeout
    const timeoutId = setTimeout(() => {
      try {
        // Create new connection with incremented attempt count
        const newConnection: AgentConnection = {
          ...closedConnection,
          reconnectAttempts: attempts,
          isConnecting: false,
          socket: new WebSocket(closedConnection.connectionUrl)
        };

        // Set the new connection
        this.connections.set(closedConnection.agentId, newConnection);
        
        // Establish the connection
        this.establishConnection(
          closedConnection.sessionId,
          closedConnection.agentId
        );
      } catch (error) {
        console.error(`[Agent: ${closedConnection.agentId}] Failed to create WebSocket during reconnection:`, error);
        // If socket creation fails, try again
        this.attemptReconnect({
          ...closedConnection,
          reconnectAttempts: attempts
        });
      }
    }, delay);

    this.reconnectTimeouts.set(closedConnection.agentId, timeoutId);
  }

  /**
   * Clear any pending reconnection timeout for a specific agent.
   */
  private clearReconnectTimeout(agentId: string) {
    const timeoutId = this.reconnectTimeouts.get(agentId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.reconnectTimeouts.delete(agentId);
    }
  }

  /**
   * Connect to the A2A WebSocket endpoint for agent-to-agent communication
   */
  connectA2A(agentId: string) {
    console.log(`[A2A] Connecting agent ${agentId} to A2A WebSocket...`);
    const socket = new WebSocket(`${WS_A2A_BASE_URL}/agent/${agentId}`);

    socket.onopen = () => {
      console.log(`[A2A] Agent ${agentId} connected to A2A WebSocket`);
      this.a2aConnections.set(agentId, socket);
    };

    socket.onmessage = (event) => {
      try {
        const message: A2AMessage = JSON.parse(event.data);
        console.log(`[A2A] Received message for agent ${agentId}:`, message);
        this.callbacks.onA2AMessage?.(message);
      } catch (error) {
        console.error(`[A2A] Failed to parse A2A message:`, error);
      }
    };

    socket.onerror = (event) => {
      console.error(`[A2A] WebSocket error for agent ${agentId}:`, event);
      this.handleError(agentId, { code: 500, message: 'A2A WebSocket error' });
    };

    socket.onclose = () => {
      console.log(`[A2A] Agent ${agentId} disconnected from A2A WebSocket`);
      this.a2aConnections.delete(agentId);
      // Implement reconnection logic similar to chat WebSocket
      setTimeout(() => this.connectA2A(agentId), RECONNECT_DELAY);
    };
  }

  /**
   * Subscribe to task events
   */
  subscribeToTask(taskId: string) {
    console.log(`[Task] Subscribing to task ${taskId} events...`);
    const socket = new WebSocket(`${WS_A2A_BASE_URL}/tasks/${taskId}`);

    socket.onopen = () => {
      console.log(`[Task] Connected to task ${taskId} events`);
      this.taskSubscriptions.set(taskId, socket);
    };

    socket.onmessage = (event) => {
      try {
        const taskEvent: TaskEvent = JSON.parse(event.data);
        console.log(`[Task] Received event for task ${taskId}:`, taskEvent);
        this.callbacks.onTaskEvent?.(taskEvent);
      } catch (error) {
        console.error(`[Task] Failed to parse task event:`, error);
      }
    };

    socket.onerror = (event) => {
      console.error(`[Task] WebSocket error for task ${taskId}:`, event);
    };

    socket.onclose = () => {
      console.log(`[Task] Unsubscribed from task ${taskId} events`);
      this.taskSubscriptions.delete(taskId);
      // Implement reconnection logic if needed
    };
  }

  /**
   * Send a message to another agent through A2A WebSocket
   */
  async sendA2AMessage(fromAgentId: string, toAgentId: string, content: any, taskId?: string) {
    const socket = this.a2aConnections.get(fromAgentId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`No active A2A connection for agent ${fromAgentId}`);
    }

    const message = {
      type: 'agent_message',
      to_agent: toAgentId,
      content,
      task_id: taskId
    };

    try {
      socket.send(JSON.stringify(message));
      console.log(`[A2A] Sent message from ${fromAgentId} to ${toAgentId}`);
    } catch (error) {
      console.error(`[A2A] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Update task status or context
   */
  async updateTask(taskId: string, action: 'update_status' | 'update_context', data: any) {
    const socket = this.taskSubscriptions.get(taskId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`No active subscription for task ${taskId}`);
    }

    const message = {
      action,
      ...data
    };

    try {
      socket.send(JSON.stringify(message));
      console.log(`[Task] Sent ${action} for task ${taskId}`);
    } catch (error) {
      console.error(`[Task] Failed to update task:`, error);
      throw error;
    }
  }

  /**
   * Send a text message to a specific agent's WebSocket.
   * Formats the message as a JSON object as expected by the backend.
   */
  async sendTextMessage(agentId: string, text: string) {
    const connection = this.connections.get(agentId);

    // If no connection exists or it's not in OPEN state, attempt to wait for connection
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      if (!connection) {
        console.error(`[Agent: ${agentId}] No connection found. Cannot send message.`);
        this.callbacks.onError?.(agentId, { code: 400, message: 'No WebSocket connection found' });
        return;
      }

      // If connection exists but not ready, wait for a short time
      if (connection.socket.readyState === WebSocket.CONNECTING) {
        console.log(`[Agent: ${agentId}] WebSocket still connecting, waiting...`);
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Connection timeout'));
            }, 5000); // 5 second timeout

            connection.socket.addEventListener('open', () => {
              clearTimeout(timeout);
              resolve(true);
            }, { once: true });

            connection.socket.addEventListener('error', () => {
              clearTimeout(timeout);
              reject(new Error('Connection failed'));
            }, { once: true });
          });
        } catch (error) {
          console.error(`[Agent: ${agentId}] Failed to establish connection:`, error);
          this.callbacks.onError?.(agentId, { code: 408, message: 'Connection timeout or failed' });
          return;
        }
      }
    }

    // Recheck connection state after waiting
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      console.error(`[Agent: ${agentId}] WebSocket not ready after waiting. Cannot send message.`);
      this.callbacks.onError?.(agentId, { code: 400, message: 'WebSocket not connected' });
      return;
    }

    try {
      // Create a properly formatted JSON message object
      const messageObject = {
        type: "text",
        text: text
      };
      
      console.log(`[Agent: ${agentId}] Sending text message:`, text);
      connection.socket.send(JSON.stringify(messageObject));
    } catch (error) {
      console.error(`[Agent: ${agentId}] Failed to send message:`, error);
      this.handleError(agentId, { code: 500, message: `Failed to send message: ${error}` });
    }
  }

  /**
   * Set callback handlers for WebSocket events
   */
  setCallbacks(callbacks: WebSocketCallbacks): void {
    // Ensure callbacks are updated for all existing connections if needed,
    // though typically set once during initialization.
    this.callbacks = callbacks;
  }

  // Updated internal error handling to include agentId
  // Centralized status update method
  private updateAgentStatus(agentId: string, newStatus: Partial<AgentStatus>) {
      const currentStatus = this.agentStatuses.get(agentId) ?? { connection: 'disconnected', activity: 'idle' };
      const updatedStatus = { ...currentStatus, ...newStatus };

      // Only update and notify if the status actually changed
      if (JSON.stringify(currentStatus) !== JSON.stringify(updatedStatus)) {
          this.agentStatuses.set(agentId, updatedStatus);
          // Update status on the active connection object if it exists
          const connection = this.connections.get(agentId);
          if (connection) {
              connection.status = updatedStatus;
          }
          console.log(`[Agent: ${agentId}] Status changed:`, updatedStatus);
          this.callbacks.onStatusChange?.(agentId, updatedStatus); // Notify listeners
      }
  }

  /** Get the current status for a specific agent */
  getAgentStatus(agentId: string): AgentStatus {
    return this.agentStatuses.get(agentId) ?? { connection: 'disconnected', activity: 'idle' };
  }

  /** Get statuses for all known agents */
  getAllAgentStatuses(): Map<string, AgentStatus> {
    return new Map(this.agentStatuses); // Return a copy
  }

  /**
   * Manually try to reconnect an agent that was previously in error state
   * @param agentId The agent ID to reconnect
   * @returns True if reconnection was attempted, false if agent wasn't in error state
   */
  retryConnection(agentId: string): boolean {
    const status = this.agentStatuses.get(agentId);
    const connection = this.connections.get(agentId);
    
    // Only retry if the connection is in error state
    if (status?.connection === 'error' || connection?.socket.readyState !== WebSocket.OPEN) {
      console.log(`[Agent: ${agentId}] Manually retrying connection...`);
      
      // Disconnect first to clean up
      this.disconnect(agentId, false);
      
      // Then attempt to reconnect if we have the session info
      if (connection?.sessionId) {
        this.connect(connection.sessionId, agentId);
        return true;
      } else {
        console.error(`[Agent: ${agentId}] Cannot retry without session ID`);
      }
    }
    
    return false;
  }
  
  /**
   * Clean up all connections and stop monitoring
   * Should be called when the application is shutting down
   */
  cleanup(): void {
    console.log(`Cleaning up all WebSocket connections...`);
    
    // Stop the connection monitor
    this.stopConnectionMonitoring();
    
    // Disconnect all regular connections
    for (const agentId of this.connections.keys()) {
      this.disconnect(agentId, false);
    }
    
    // Clean up A2A connections
    for (const [agentId, socket] of this.a2aConnections.entries()) {
      try {
        socket.close(1000, "Application shutdown");
      } catch (error) {
        console.error(`[A2A] Error closing connection for agent ${agentId}:`, error);
      }
    }
    this.a2aConnections.clear();
    
    // Clean up task subscriptions
    for (const [taskId, socket] of this.taskSubscriptions.entries()) {
      try {
        socket.close(1000, "Application shutdown");
      } catch (error) {
        console.error(`[Task] Error closing subscription for task ${taskId}:`, error);
      }
    }
    this.taskSubscriptions.clear();
    
    // Clear all timeouts
    for (const timeoutId of this.reconnectTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.reconnectTimeouts.clear();
  }

  private handleError(agentId: string, error: { code: number; message: string }): void {
    console.error(`[Agent: ${agentId}] WebSocket error:`, error);
    this.updateAgentStatus(agentId, { connection: 'error', activity: 'error' }); // Update status on error
    this.callbacks.onError?.(agentId, error);
  }

}

// Export singleton instance
export default new WebSocketService();
