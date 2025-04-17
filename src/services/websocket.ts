/**
 * WebSocket service for chat communication with backend (api_gateway)
 * Connects to /ws/v1/chat/{session_id}/{agent_id}
 * Handles sending/receiving messages, reconnection, and events
 */

import { ChatMessage, MessageSendRequest, WebSocketEvent } from "@/types/api";

type MessageHandler = (msg: ChatMessage) => void;
type StatusHandler = (status: string, message?: string) => void;
type ErrorHandler = (error: string) => void;

interface WebSocketServiceOptions {
  sessionId: string;
  agentId: string;
  onMessage: MessageHandler;
  onStatus?: StatusHandler;
  onError?: ErrorHandler;
  reconnect?: boolean;
}

export class ChatWebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private options: WebSocketServiceOptions;
  private reconnect: boolean;
  private reconnectTimeout: number = 2000;
  private isClosedByUser = false;
  private currentMessageContent = ""; // Accumulate message chunks

  constructor(options: WebSocketServiceOptions) {
    this.options = options;
    this.url = `/ws/v1/chat/${encodeURIComponent(options.sessionId)}/${encodeURIComponent(options.agentId)}`;
    this.reconnect = options.reconnect ?? true;
    const wsUrl = this.getFullUrl();
    // Use a clear, visible log
    console.log("%c[WebSocket] Connecting to:", "color: orange; font-weight: bold;", wsUrl);
    this.connect();
  }

  private getFullUrl(): string {
    // Use ws://localhost:8000 as the backend base for local dev
    const base = window.location.hostname === "localhost" ? "ws://localhost:8000" : "";
    return `${base}${this.url}`;
  }

  private connect() {
    this.ws = new WebSocket(this.getFullUrl());
    this.ws.onopen = () => {
      this.options.onStatus?.("connected");
    };
    this.ws.onmessage = (event) => {
      console.log("[WebSocket] Raw event.data:", event.data);
      try {
        const data = JSON.parse(event.data);
        // Handle backend format: {message: "...", turn_complete: boolean}
        if (typeof data.message === "string") {
          this.currentMessageContent += data.message;
        } else if (data.type === "message_saved") {
          // When message_saved is received, create and send the message
          const chatMsg: ChatMessage = {
            message_id: data.message_uuid, // Use the UUID from backend
            session_id: this.options.sessionId,
            agent_id: data.agent_id,
            sender: "agent",
            content: this.currentMessageContent,
            timestamp: new Date().toISOString(),
          };
          console.log("[WebSocket] Received complete message:", chatMsg);
          this.options.onMessage(chatMsg);
        } else if (data.turn_complete) {
          // Reset accumulator when turn is complete
          this.currentMessageContent = "";
        } else if (data.type === "message" && data.data) {
          console.log("[WebSocket] Received message event:", data.data);
          this.options.onMessage(data.data as ChatMessage);
        } else if (data.type === "status") {
          this.options.onStatus?.(data.data.status, data.data.message);
        } else if (data.type === "error") {
          this.options.onError?.(data.data.error);
        } else {
          console.log("[WebSocket] Unhandled event type:", data);
        }
      } catch (e) {
        this.options.onError?.("Malformed WebSocket message");
        console.error("[WebSocket] Malformed message:", event.data, e);
      }
    };
    this.ws.onerror = (event) => {
      console.error("[WebSocket] Connection error:", this.getFullUrl(), event);
      this.options.onError?.("WebSocket error");
    };
    this.ws.onclose = () => {
      this.options.onStatus?.("disconnected");
      if (!this.isClosedByUser && this.reconnect) {
        setTimeout(() => this.connect(), this.reconnectTimeout);
      }
    };
  }

  sendMessage(content: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError?.("WebSocket not connected");
      return;
    }
    const msg: MessageSendRequest = {
      session_id: this.options.sessionId,
      agent_id: this.options.agentId,
      content,
    };
    this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.isClosedByUser = true;
    this.ws?.close();
  }
}
