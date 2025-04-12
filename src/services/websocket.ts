/**
 * WebSocket Service for TKR Multi-Agent Chat System
 * 
 * Handles real-time communication with the API Gateway, including:
 * - Session management
 * - Message sending/receiving
 * - Reconnection logic
 */

import { Message, WebSocketMessage, ErrorResponse } from '../types/api'; // Removed AgentUpdateEvent

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
  onPacket?: (packet: AgentStreamingPacket) => void; // Callback for each packet
  // onAgentUpdate?: (event: AgentUpdateEvent) => void; // Removed A2A callback
  onError?: (error: { code: number; message: string }) => void; // Simplified error
  onReconnect?: () => void;
  onDisconnect?: () => void;
  onOpen?: () => void; // Callback when connection opens
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private currentSessionId: string | null = null;
  private currentAgentId: string | null = null;
  private connectionUrl: string | null = null; // Store the full URL for reconnects
  private callbacks: WebSocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false; // Prevent multiple connection attempts

  /**
   * Connect to the WebSocket server for a specific session and agent.
   */
  connect(sessionId: string, agentId: string) {
    // Don't reconnect if already connected to the same session/agent
    if (
      this.socket && 
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) &&
      this.currentSessionId === sessionId &&
      this.currentAgentId === agentId
    ) {
      console.log(`WebSocket already connected or connecting to session ${sessionId}, agent ${agentId}.`);
      return;
    }
    
    // If connecting to a different session/agent, disconnect the old one first
    if (this.socket) {
        this.disconnect(false); // Don't trigger reconnect attempt
    }

    if (this.isConnecting) {
        console.log("WebSocket connection attempt already in progress.");
        return;
    }

    this.isConnecting = true;
    this.currentSessionId = sessionId;
    this.currentAgentId = agentId;
    this.connectionUrl = `${WS_BASE_URL}/chat/${sessionId}/${agentId}`; // New URL format
    
    console.log(`Connecting to WebSocket at ${this.connectionUrl}...`);
    
    try {
        this.socket = new WebSocket(this.connectionUrl);
    } catch (error) {
        console.error("WebSocket connection failed:", error);
        this.isConnecting = false;
        this.handleError({ code: 503, message: "WebSocket connection failed" });
        this.attemptReconnect(); // Still attempt reconnect on initial failure
        return;
    }

    this.socket.onopen = () => {
      console.log('WebSocket connected.');
      this.isConnecting = false;
      this.reconnectAttempts = 0; // Reset on successful connection
      this.callbacks.onOpen?.();
    };

    this.socket.onmessage = (event) => {
      try {
        const packet: AgentStreamingPacket = JSON.parse(event.data);
        console.log('WebSocket packet received:', packet);
        this.callbacks.onPacket?.(packet);
      } catch (error) {
        console.error('Failed to parse WebSocket packet:', error);
        // Optionally notify client of format error
        // this.callbacks.onError?.({ code: 400, message: 'Invalid packet format' });
      }
    };

    this.socket.onerror = (event) => {
      console.error('WebSocket error event:', event);
      this.isConnecting = false; // Ensure connection flag is reset
      // Don't trigger reconnect here, onclose will handle it
    };

    this.socket.onclose = (event) => {
      console.log(`WebSocket disconnected: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
      this.isConnecting = false;
      const wasConnected = this.socket !== null; // Check if it was ever connected
      this.socket = null;
      this.callbacks.onDisconnect?.();
      
      // Only attempt reconnect if it was previously connected or failed initially
      if (wasConnected || this.reconnectAttempts > 0) {
          this.attemptReconnect();
      }
    };
  }

  /**
   * Disconnect from the WebSocket server.
   * @param attemptReconnect - If true, will try to reconnect after disconnecting. Default is false.
   */
  disconnect(attemptReconnect = false) {
    this.clearReconnectTimeout(); // Stop any pending reconnect attempts
    if (this.socket) {
      console.log('Disconnecting WebSocket...');
      this.socket.onclose = null; // Prevent automatic reconnect from onclose handler
      this.socket.close();
    }
    this.socket = null;
    this.currentSessionId = null;
    this.currentAgentId = null;
    this.connectionUrl = null;
    this.isConnecting = false;
    
    if (attemptReconnect) {
        // Optionally trigger a reconnect attempt manually if needed
        // this.attemptReconnect(); 
    } else {
        this.reconnectAttempts = 0; // Reset attempts if disconnect was intentional
    }
  }

  /**
   * Send a plain text message through the WebSocket (for ADK streaming).
   */
  sendTextMessage(text: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
       console.error('WebSocket not connected. Cannot send message.');
       this.callbacks.onError?.({ code: 400, message: 'WebSocket not connected' });
       return;
    }

    try {
      console.log('Sending text message:', text);
      this.socket.send(text); // Send plain text
    } catch (error) {
      console.error('Failed to send message:', error);
      // Pass a structured error object
      this.handleError({ code: 500, message: `Failed to send message: ${error}` }); 
    }
  }

  /**
   * Set callback handlers for WebSocket events
   */
  setCallbacks(callbacks: WebSocketCallbacks): void {
    this.callbacks = callbacks;
  }

  // Simplified internal error handling
  private handleError(error: { code: number; message: string }): void {
    console.error('WebSocket error:', error);
    this.callbacks.onError?.(error);
  }

  /**
   * Attempt to reconnect to the WebSocket server using the stored URL.
   */
   private attemptReconnect() {
     if (this.isConnecting) return; // Don't attempt if already trying
     
     if (this.reconnectAttempts >= this.maxReconnectAttempts) {
       console.log('Max reconnection attempts reached. Stopping.');
       this.callbacks.onError?.({ code: 503, message: 'Connection failed after multiple attempts.' });
       return;
     }
 
     this.reconnectAttempts++;
     const delay = RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
     console.log(`Attempting to reconnect in ${delay / 1000}s (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
     
     this.clearReconnectTimeout(); // Clear previous timeout just in case
     this.reconnectTimeout = setTimeout(() => {
       this.callbacks.onReconnect?.();
       // Reconnect using the stored session and agent IDs
       if (this.currentSessionId && this.currentAgentId) {
         this.connect(this.currentSessionId, this.currentAgentId);
       } else {
         console.error("Cannot reconnect: session or agent ID missing.");
       }
     }, delay);
  }

  /**
   * Clear any pending reconnection timeout
   */
  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

// Export singleton instance
export default new WebSocketService();
