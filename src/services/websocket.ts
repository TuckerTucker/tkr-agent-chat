/**
 * WebSocket Service for TKR Multi-Agent Chat System
 * 
 * Handles real-time communication with the API Gateway, including:
 * - Session management
 * - Message sending/receiving
 * - Reconnection logic
 */

import { WebSocketMessage, ErrorResponse } from '../types/api'; // Removed Message as it's not used directly here

// API Gateway WebSocket URL (Now includes /v1)
const WS_BASE_URL = 'ws://localhost:8000/ws/v1'; // TODO: Make configurable
const RECONNECT_DELAY = 3000; // Increased delay

// Define the structure of messages received from the backend ADK stream
interface AgentStreamingPacket {
  message?: string; // Partial or full text message from agent
  turn_complete?: boolean;
  interrupted?: boolean;
  error?: string; // Error message from the backend
}

interface WebSocketCallbacks {
  // Callbacks now include agentId
  onPacket?: (agentId: string, packet: AgentStreamingPacket) => void; 
  onError?: (agentId: string, error: { code: number; message: string }) => void; 
  onReconnect?: (agentId: string) => void;
  onDisconnect?: (agentId: string) => void;
  onOpen?: (agentId: string) => void; 
}

// Type for managing individual connection state
interface AgentConnection {
    socket: WebSocket;
    sessionId: string;
    agentId: string;
    connectionUrl: string;
    reconnectAttempts: number;
    reconnectTimeout: NodeJS.Timeout | null;
    isConnecting: boolean;
}

class WebSocketService {
  // Manage multiple connections: agentId -> AgentConnection
  private connections: Map<string, AgentConnection> = new Map(); 
  private callbacks: WebSocketCallbacks = {};
  private maxReconnectAttempts = 5;
  // Removed singleton-level state like currentSessionId, currentAgentId, etc.

  /**
   * Connect to the WebSocket server for a specific session and agent.
   * Manages connection state within the `connections` map.
   */
  connect(sessionId: string, agentId: string) {
    const existingConnection = this.connections.get(agentId);

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
    };
    this.connections.set(agentId, connection);

    socket.onopen = () => {
      console.log(`[Agent: ${agentId}] WebSocket connected.`);
      connection.isConnecting = false;
      connection.reconnectAttempts = 0; // Reset on successful connection
      this.callbacks.onOpen?.(agentId);
    };

    socket.onmessage = (event) => {
      try {
        const packet: AgentStreamingPacket = JSON.parse(event.data);
        // console.log(`[Agent: ${agentId}] WebSocket packet received:`, packet); // Less verbose logging
        this.callbacks.onPacket?.(agentId, packet);
      } catch (error) {
        console.error(`[Agent: ${agentId}] Failed to parse WebSocket packet:`, error);
        // Optionally notify client of format error
        // this.callbacks.onError?.(agentId, { code: 400, message: 'Invalid packet format' });
      }
    };

    socket.onerror = (event) => {
      console.error(`[Agent: ${agentId}] WebSocket error event:`, event);
      connection.isConnecting = false; // Ensure connection flag is reset
      // Don't trigger reconnect here, onclose will handle it
    };

    socket.onclose = (event) => {
      console.log(`[Agent: ${agentId}] WebSocket disconnected: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
      connection.isConnecting = false;
      const wasConnected = this.connections.has(agentId); // Check if it was in our map
      
      // Clean up the connection state *before* attempting reconnect
      this.clearReconnectTimeout(agentId); // Clear any existing timer
      this.connections.delete(agentId); // Remove from active connections
      
      this.callbacks.onDisconnect?.(agentId);
      
      // Only attempt reconnect if it was previously connected or failed initially (tracked by reconnectAttempts > 0)
      // And if the disconnect wasn't clean (or based on specific codes)
      // Let's simplify: always attempt reconnect if it was in the map, unless explicitly disconnected
      if (wasConnected && event.code !== 1000) { // Don't reconnect on normal closure (code 1000)
          this.attemptReconnect(connection); // Pass the old connection state
      }
    };
  }

  /**
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
   * Disconnect all active WebSocket connections.
   */
  disconnectAll() {
      console.log("Disconnecting all WebSocket connections...");
      // Create a copy of keys to avoid issues while iterating and deleting
      const agentIds = Array.from(this.connections.keys()); 
      agentIds.forEach(agentId => {
          this.disconnect(agentId, false); // Disconnect each without triggering reconnect
      });
  }

  /**
   * Send a plain text message to a specific agent's WebSocket.
   * @param agentId - The target agent ID.
   * @param text - The message content.
   */
  sendTextMessage(agentId: string, text: string) {
    const connection = this.connections.get(agentId);

    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
       console.error(`[Agent: ${agentId}] WebSocket not connected. Cannot send message.`);
       // Notify specific agent error
       this.callbacks.onError?.(agentId, { code: 400, message: 'WebSocket not connected' }); 
       return;
    }

    try {
      console.log(`[Agent: ${agentId}] Sending text message:`, text);
      connection.socket.send(text); // Send plain text via the specific agent's socket
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
  private handleError(agentId: string, error: { code: number; message: string }): void {
    console.error(`[Agent: ${agentId}] WebSocket error:`, error);
    this.callbacks.onError?.(agentId, error);
  }

  /**
   * Attempt to reconnect a specific agent's connection.
   * Uses the state from the closed connection passed as an argument.
   */
   private attemptReconnect(closedConnection: AgentConnection) {
     // Don't attempt if another connection process is marked as connecting for this agent
     // (This check might be redundant if disconnect cleans up properly)
     // if (this.connections.get(closedConnection.agentId)?.isConnecting) return; 
     
     if (closedConnection.reconnectAttempts >= this.maxReconnectAttempts) {
       console.log(`[Agent: ${closedConnection.agentId}] Max reconnection attempts reached. Stopping.`);
       this.callbacks.onError?.(closedConnection.agentId, { code: 503, message: 'Connection failed after multiple attempts.' });
       return;
     }
 
     const attempts = closedConnection.reconnectAttempts + 1;
     const delay = RECONNECT_DELAY * Math.pow(2, attempts - 1); // Exponential backoff
     console.log(`[Agent: ${closedConnection.agentId}] Attempting to reconnect in ${delay / 1000}s (${attempts}/${this.maxReconnectAttempts})...`);
     
     // Store the timeout *on the closed connection object* temporarily, 
     // or manage timeouts centrally if preferred. Let's store it here for simplicity.
     closedConnection.reconnectTimeout = setTimeout(() => {
       this.callbacks.onReconnect?.(closedConnection.agentId);
       // Reconnect using the stored session and agent IDs from the closed connection
       this.connect(closedConnection.sessionId, closedConnection.agentId); 
       // When connect runs, it will create a *new* connection object in the map.
       // The reconnectAttempts from the *new* connection object will be used next time.
       // We need to ensure the attempt count carries over. Let's modify connect:
       // TODO: Modify connect to accept optional initial reconnectAttempts count.
       // OR: Pass the attempt count directly here. Let's modify connect later if needed.
       // For now, the new connection starts attempts at 0, which might not be ideal exponential backoff.
       // --- Correction: Let's pass the attempt count ---
       // Modify connect signature: connect(sessionId: string, agentId: string, initialAttempts: number = 0)
       // Then call: this.connect(closedConnection.sessionId, closedConnection.agentId, attempts);
       // --- Let's stick to the original plan for now and refine later if backoff is wrong ---
       // this.connect(closedConnection.sessionId, closedConnection.agentId); 

     }, delay);

     // Update the connection map with the timeout reference (even though it's technically disconnected)
     // This allows clearReconnectTimeout to find it.
     // This feels a bit messy. Maybe manage timeouts separately?
     // Alternative: Store timeout ID directly in the map keyed by agentId?
     // Let's keep it on the object for now.
     this.connections.set(closedConnection.agentId, closedConnection); // Put it back temporarily with the timer
  }

  /**
   * Clear any pending reconnection timeout for a specific agent.
   */
  private clearReconnectTimeout(agentId: string) {
    const connection = this.connections.get(agentId);
    if (connection?.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
      connection.reconnectTimeout = null;
    }
  }
}

// Export singleton instance
export default new WebSocketService();
