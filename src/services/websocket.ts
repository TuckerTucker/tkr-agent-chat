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
  type?: 'message' | 'pong'; // Message type for heartbeat responses
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
    heartbeatFailures: number;
    lastHeartbeat: number;
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
        heartbeatFailures: 0,
        lastHeartbeat: Date.now(),
        status: { connection: 'connecting', activity: 'idle' }, // Initial status
    };
    this.connections.set(agentId, connection);
    // Also update the persistent status map
    this.agentStatuses.set(agentId, connection.status);


    socket.onopen = () => {
      console.log(`[Agent: ${agentId}] WebSocket connected.`);
      connection.isConnecting = false;
      connection.reconnectAttempts = 0; // Reset on successful connection
      connection.heartbeatFailures = 0; // Reset heartbeat failures
      connection.lastHeartbeat = Date.now(); // Initialize heartbeat timestamp
      this.updateAgentStatus(agentId, { connection: 'connected', activity: 'idle' }); // Update status
      this.startHeartbeat(agentId); // Start heartbeat immediately
      this.callbacks.onOpen?.(agentId);
    };

    socket.onmessage = (event) => {
      let currentActivity: AgentActivityStatus = 'responding'; // Assume responding if packet received
      try {
        const packet: AgentStreamingPacket = JSON.parse(event.data);

        // Handle heartbeat response
        if (packet.type === 'pong') {
          const connection = this.connections.get(agentId);
          if (connection) {
            connection.lastHeartbeat = Date.now();
            connection.heartbeatFailures = 0;
          }
          return;
        }

        // Handle turn completion and interruption
        if (packet.turn_complete || packet.interrupted) {
          currentActivity = 'idle';
          this.updateAgentStatus(agentId, { connection: 'connected', activity: currentActivity });
          
          // Keep connection alive and start heartbeat
          if (packet.turn_complete) {
            console.log(`[Agent: ${agentId}] Turn complete, maintaining connection`);
            this.startHeartbeat(agentId);
          }
          return; // Skip further processing for completion messages
        }

        // Infer agent activity status from packet
        if (packet.error) {
          currentActivity = 'error';
          console.error(`[Agent: ${agentId}] Error packet received:`, packet.error);
          // Format error message to exclude streaming markers
          const errorMsg = packet.error.replace(/\[(\w+)\] Turn complete or interrupted\. StreamingId: [\w-]+/g, '').trim();
          if (errorMsg) {
            this.handleError(agentId, { code: 500, message: errorMsg });
          }
        } else if (packet.message) {
          // If message present, assume still responding/thinking
          currentActivity = 'responding';
        }

        // Update status only if activity changed
        const currentStatus = this.agentStatuses.get(agentId);
        if (currentStatus?.activity !== currentActivity) {
          this.updateAgentStatus(agentId, { connection: 'connected', activity: currentActivity });
        }

        // Only notify of packet if it contains actual content
        if (packet.message || packet.error) {
          this.callbacks.onPacket?.(agentId, packet);
        }
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
      console.log(`[Agent: ${agentId}] WebSocket connection lost: code=${event.code}, reason=${event.reason}`);
      connection.isConnecting = false;

      // Clear any existing timeouts/intervals
      this.clearReconnectTimeout(agentId);
      this.clearHeartbeat(agentId);

      // Handle different close codes
      switch (event.code) {
        case 1000: // Normal closure
          console.log(`[Agent: ${agentId}] Normal closure, no reconnection needed`);
          this.updateAgentStatus(agentId, { 
            connection: 'disconnected', 
            activity: 'idle' 
          });
          this.connections.delete(agentId);
          break;

        case 1006: // Abnormal closure
        case 1011: // Internal error
        case 1012: // Service restart
          console.log(`[Agent: ${agentId}] Abnormal closure (${event.code}), attempting reconnection...`);
          this.updateAgentStatus(agentId, { 
            connection: 'reconnecting', 
            activity: 'idle' 
          });
          if (this.connections.has(agentId)) {
            this.attemptReconnect(connection);
          }
          break;

        default:
          // For unknown codes, check if it's in the normal range (1000-1999) or error range (4000-4999)
          if (event.code >= 4000) {
            console.error(`[Agent: ${agentId}] Error closure (${event.code}), no reconnection`);
            this.updateAgentStatus(agentId, { 
              connection: 'error', 
              activity: 'error' 
            });
            this.connections.delete(agentId);
          } else {
            console.log(`[Agent: ${agentId}] Unexpected closure (${event.code}), attempting reconnection...`);
            this.updateAgentStatus(agentId, { 
              connection: 'reconnecting', 
              activity: 'idle' 
            });
            if (this.connections.has(agentId)) {
              this.attemptReconnect(connection);
            }
          }
      }

      // Notify client of disconnect
      this.callbacks.onDisconnect?.(agentId);
    };
  }

  /**
   * Disconnect a specific agent's WebSocket connection.
   * @param agentId - The ID of the agent to disconnect.
   * @param attemptReconnect - If true, will try to reconnect after disconnecting. (Usually false for manual disconnect)
   */
  // Add heartbeat functionality
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  private startHeartbeat(agentId: string) {
    // Clear any existing heartbeat
    this.clearHeartbeat(agentId);
    
    // Start new heartbeat interval
    const interval = setInterval(() => {
      const connection = this.connections.get(agentId);
      if (connection && connection.socket.readyState === WebSocket.OPEN) {
        try {
          connection.socket.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error(`[Agent: ${agentId}] Heartbeat failed:`, error);
          this.handleConnectionFailure(agentId);
        }
      } else {
        this.handleConnectionFailure(agentId);
      }
    }, 30000); // 30 second interval
    
    this.heartbeatIntervals.set(agentId, interval);
  }
  
  private clearHeartbeat(agentId: string) {
    const interval = this.heartbeatIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(agentId);
    }
  }
  
  private handleConnectionFailure(agentId: string) {
    const connection = this.connections.get(agentId);
    if (!connection) return;

    connection.heartbeatFailures++;
    console.warn(`[Agent: ${agentId}] Connection failure detected (failures: ${connection.heartbeatFailures})`);

    // Check time since last heartbeat
    const timeSinceLastHeartbeat = Date.now() - connection.lastHeartbeat;
    const isStale = timeSinceLastHeartbeat > 60000; // 60 seconds

    // Only attempt reconnect if we have multiple failures or connection is stale
    if (connection.heartbeatFailures >= 3 || isStale) {
      console.error(`[Agent: ${agentId}] Connection deemed unstable, attempting reconnection`);
      this.clearHeartbeat(agentId);
      this.attemptReconnect(connection);
    } else {
      console.log(`[Agent: ${agentId}] Waiting for more heartbeat failures before reconnecting`);
    }
  }

  disconnect(agentId: string, attemptReconnect = false) {
    const connection = this.connections.get(agentId);
    if (!connection) {
      console.log(`[Agent: ${agentId}] No active connection to disconnect.`);
      return;
    }

    console.log(`[Agent: ${agentId}] Disconnecting WebSocket...`);
    this.clearReconnectTimeout(agentId);
    this.clearHeartbeat(agentId);

    // Close the socket with a normal closure code
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.close(1000, "Normal closure");
    }

    // Update status
    this.updateAgentStatus(agentId, { 
      connection: 'disconnected', 
      activity: 'idle' 
    });

    // Remove from connections map
    this.connections.delete(agentId);

    if (attemptReconnect) {
      // Wait a bit before attempting reconnection
      setTimeout(() => {
        this.attemptReconnect(connection);
      }, INITIAL_CONNECT_DELAY);
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
      // Establish the connection with incremented attempt count
      closedConnection.reconnectAttempts = attempts;
      closedConnection.isConnecting = false;
      this.establishConnection(
        closedConnection.sessionId,
        closedConnection.agentId
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
      console.log(`[A2A] Agent ${agentId} connection lost, attempting reconnection...`);
      
      // Keep the connection in our map
      if (this.a2aConnections.has(agentId)) {
        // Attempt immediate reconnection with backoff
        let attempts = 0;
        const maxAttempts = 5;
        const reconnect = () => {
          if (attempts >= maxAttempts) {
            console.error(`[A2A] Failed to reconnect agent ${agentId} after ${maxAttempts} attempts`);
            return;
          }
          
          setTimeout(() => {
            console.log(`[A2A] Reconnection attempt ${attempts + 1} for agent ${agentId}`);
            this.connectA2A(agentId);
            attempts++;
          }, RECONNECT_DELAY * Math.pow(2, attempts));
        };
        
        reconnect();
      }
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
      console.log(`[Task] Connection lost for task ${taskId}, attempting reconnection...`);
      
      // Keep the subscription in our map
      if (this.taskSubscriptions.has(taskId)) {
        // Attempt immediate reconnection with backoff
        let attempts = 0;
        const maxAttempts = 5;
        const reconnect = () => {
          if (attempts >= maxAttempts) {
            console.error(`[Task] Failed to reconnect task ${taskId} after ${maxAttempts} attempts`);
            return;
          }
          
          setTimeout(() => {
            console.log(`[Task] Reconnection attempt ${attempts + 1} for task ${taskId}`);
            this.subscribeToTask(taskId);
            attempts++;
          }, RECONNECT_DELAY * Math.pow(2, attempts));
        };
        
        reconnect();
      }
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


  private handleError(agentId: string, error: { code: number; message: string }): void {
    console.error(`[Agent: ${agentId}] WebSocket error:`, error);
    this.updateAgentStatus(agentId, { connection: 'error', activity: 'error' }); // Update status on error
    this.callbacks.onError?.(agentId, error);
  }

}

// Export singleton instance
export default new WebSocketService();
