import React, { useEffect, useState, useRef } from "react";
import { getAgents, getSessions, getMessages } from "@/services/api";
import { ChatWebSocketService } from "@/services/websocket";
import { Agent, ChatSession, ChatMessage } from "@/types/api";

/**
 * Example component demonstrating how to connect frontend to backend:
 * - Fetches agent list and chat sessions
 * - Allows selecting an agent and session
 * - Connects to WebSocket for real-time chat
 * - Displays messages and allows sending new messages
 */
const ChatConnectorExample: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<ChatWebSocketService | null>(null);

  // Fetch agents and sessions on mount
  useEffect(() => {
    getAgents()
      .then((res) => setAgents(res.agents))
      .catch((e) => setError("Failed to fetch agents"));
    getSessions()
      .then((res) => setSessions(res))
      .catch((e) => setError("Failed to fetch sessions"));
  }, []);

  // Fetch messages when session is selected
  useEffect(() => {
    if (selectedSession) {
      getMessages(selectedSession.id)
        .then((res) => setMessages(res.messages))
        .catch((e) => setError("Failed to fetch messages"));
    } else {
      setMessages([]);
    }
  }, [selectedSession]);

  // Connect WebSocket when agent and session are selected
  useEffect(() => {
    wsRef.current?.close();
    if (selectedAgent && selectedSession) {
      wsRef.current = new ChatWebSocketService({
        sessionId: selectedSession.id,
        agentId: selectedAgent.id,
        onMessage: (msg) => setMessages((prev) => [...prev, msg]),
        onStatus: (status) => setWsStatus(status),
        onError: (err) => setError(err),
        reconnect: true,
      });
    }
    return () => {
      wsRef.current?.close();
    };
  }, [selectedAgent, selectedSession]);

  const handleSend = () => {
    if (input.trim() && wsRef.current) {
      wsRef.current.sendMessage(input.trim());
      setInput("");
    }
  };

  return (
    <div style={{ border: "1px solid #ccc", padding: 16, maxWidth: 500 }}>
      <h2>Chat Connector Example</h2>
      {error && <div style={{ color: "red" }}>Error: {error}</div>}

      <div>
        <label>
          Agent:
          <select
            value={selectedAgent?.id || ""}
            onChange={(e) => {
              const agent = agents.find((a) => a.id === e.target.value) || null;
              setSelectedAgent(agent);
            }}
          >
            <option value="">Select agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label>
          Session:
          <select
            value={selectedSession?.id || ""}
            onChange={(e) => {
              const session = sessions.find((s) => s.id === e.target.value) || null;
              setSelectedSession(session);
            }}
          >
            <option value="">Select session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span>WebSocket status: {wsStatus}</span>
      </div>

      <div style={{ border: "1px solid #eee", minHeight: 100, margin: "8px 0", padding: 8 }}>
        {messages.map((msg) => (
          <div key={msg.message_id} style={{ marginBottom: 4 }}>
            <b>{msg.sender === "user" ? "You" : selectedAgent?.name || "Agent"}:</b> {msg.content}
          </div>
        ))}
      </div>

      <div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{ width: "70%" }}
        />
        <button onClick={handleSend} disabled={!input.trim() || wsStatus !== "connected"}>
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatConnectorExample;
