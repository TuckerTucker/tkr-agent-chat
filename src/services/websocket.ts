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

// API Gateway WebSocket URLs
const WS_BASE_URL = 'ws://localhost:8000/ws/v1';
const WS_A2A_BASE_URL = 'ws://localhost:8000/ws/v1/a2a'; // A2A WebSocket endpoint
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
interface A2AMessage {
  type: string;
  from_agent: string;
  task_id?: string;
  content: any;
}

interface TaskEvent {
  type: 'task_state' | 'task_update' | 'error';
  task_id: string;
  status?: string;
  context?: any;
  result?: any;
  message?: string;
}

interface WebSocketCallbacks {
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
  private maxReconnectAttempts = 5;

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

    // Add delay before initial connection attempt
    setTimeout(() => {
      this.establishConnection(sessionId, agentId, existingConnection);
    }, INITIAL_CONNECT_DELAY);
  }

  private establishConnection(sessionId: string, agentId: string, existingConnection: AgentConnection | undefined) {

    // Avoid reconnecting if already connected/connecting for this agent
    if (existingConnection && (existingConnection.socket.readyState === WebSocket.OPEN || existingConnection.socket.readyState === WebSocket.CONNECTING)) {
      // If session ID changed, disconnect old and connect new (or handle differently if needed)
      if (existingConnection.sessionId !== sessionId) {
          console.warn(`Agent ${agentId} is connected to session ${existingConnection.sessionId}, reconnecting to ${sessionId}`);
          this.disconnect(agentId, false); // Disconnect old session connection first
      } else {
          console.log(`WebSocket already connected or connecting for agent ${agentId}.`);
          return;
      }
    }
    
    // Avoid multiple concurrent connection attempts for the same agent
    if (existingConnection?.isConnecting) {
        console.log(`WebSocket connection attempt already in progress for agent ${agentId}.`);
        return;
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
      let currentActivity: AgentActivityStatus = 'responding'; // Assume responding if packet received
      try {
        const packet: AgentStreamingPacket = JSON.parse(event.data);
        // console.log(`[Agent: ${agentId}] WebSocket packet received:`, packet);

        // Infer agent activity status from packet
        if (packet.error) {
            currentActivity = 'error';
            console.error(`[Agent: ${agentId}] Error packet received:`, packet.error);
            // Optionally trigger onError callback here too?
            // this.handleError(agentId, { code: 500, message: packet.error });
        } else if (packet.turn_complete) {
            currentActivity = 'idle'; // Turn complete, back to idle
        } else if (packet.interrupted) {
            currentActivity = 'idle'; // Interrupted, back to idle (or maybe 'interrupted' status?)
            console.log(`[Agent: ${agentId}] Turn interrupted.`);
        } else if (packet.message) {
            // If only message, assume still responding/thinking
            // We could add a 'thinking' state if the backend sends specific signals
            currentActivity = 'responding';
        }

        // Update status only if activity changed
        const currentStatus = this.agentStatuses.get(agentId);
        if (currentStatus?.activity !== currentActivity) {
            this.updateAgentStatus(agentId, { connection: 'connected', activity: currentActivity });
        }

        this.callbacks.onPacket?.(agentId, packet);
      } catch (error) {
        console.error(`[Agent: ${agentId}] Failed to parse WebSocket packet:`, error);
        this.updateAgentStatus(agentId, { connection: 'connected', activity: 'error' }); // Mark as error on parse fail
        // Optionally notify client of format error
        // this.callbacks.onError?.(agentId, { code: 400, message: 'Invalid packet format' });
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
   * Uses exponential backoff strategy.
   */
  private attemptReconnect(closedConnection: AgentConnection) {
    // Check if we should attempt reconnection
    if (closedConnection.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`[Agent: ${closedConnection.agentId}] Max reconnection attempts reached. Stopping.`);
      this.callbacks.onError?.(closedConnection.agentId, { code: 503, message: 'Connection failed after multiple attempts.' });
      return;
    }

    // Clear any existing reconnect timeout
    this.clearReconnectTimeout(closedConnection.agentId);

    // Calculate delay with exponential backoff
    const attempts = closedConnection.reconnectAttempts + 1;
    const delay = RECONNECT_DELAY * Math.pow(2, attempts - 1);
    console.log(`[Agent: ${closedConnection.agentId}] Attempting to reconnect in ${delay / 1000}s (${attempts}/${this.maxReconnectAttempts})...`);

    // Update status and notify UI
    this.updateAgentStatus(closedConnection.agentId, { 
      connection: 'reconnecting', 
      activity: this.agentStatuses.get(closedConnection.agentId)?.activity ?? 'idle' 
    });
    this.callbacks.onReconnect?.(closedConnection.agentId);

    // Store reconnect timeout
    const timeoutId = setTimeout(() => {
      // Create new connection with incremented attempt count
      const newConnection: AgentConnection = {
        ...closedConnection,
        reconnectAttempts: attempts,
        isConnecting: false,
        socket: new WebSocket(closedConnection.connectionUrl)
      };

      // Establish the connection
      this.establishConnection(
        closedConnection.sessionId,
        closedConnection.agentId,
        newConnection
      );
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
   * Send a plain text message to a specific agent's WebSocket.
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
      console.log(`[Agent: ${agentId}] Sending text message:`, text);
      connection.socket.send(text);
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


  private handleError(agentId: string, error: { code: number; message: string }): void {
    console.error(`[Agent: ${agentId}] WebSocket error:`, error);
    this.updateAgentStatus(agentId, { connection: 'error', activity: 'error' }); // Update status on error
    this.callbacks.onError?.(agentId, error);
  }

}

// Export singleton instance
export default new WebSocketService();
