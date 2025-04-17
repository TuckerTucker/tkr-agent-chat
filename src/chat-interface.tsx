"use client"

import { useState, useEffect, useRef } from "react";
import { Moon, Download, ChevronDown, Sun, Menu, X } from "lucide-react";
import { getAgents, getSessions, getMessages } from "@/services/api";
import { ChatWebSocketService } from "@/services/websocket";
import { Agent, ChatSession, ChatMessage } from "@/types/api";

export default function ChatInterface() {
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // New state for backend data
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  // Initialize messages as an empty array and ensure it's never null/undefined
  const [messages, setMessages] = useState<ChatMessage[]>(() => []);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<ChatWebSocketService | null>(null);

  // Fetch agents and sessions on mount
  useEffect(() => {
    getAgents()
      .then((res) => {
        setAgents(res.agents);
        // Auto-select first agent if none selected
        if (!selectedAgent && res.agents && res.agents.length > 0) {
          setSelectedAgent(res.agents[0]);
        }
      })
      .catch(() => setError("Failed to fetch agents"));
    getSessions()
      .then(async (res) => {
        console.log("Fetched sessions:", res);
        if (res && res.length > 0) {
          console.log("First session object:", res[0]);
          setSelectedSession(res[0]);
        } else if (selectedAgent) {
          // No sessions, create a new one for the selected agent
          try {
            const newSession = await import("@/services/api").then(mod => mod.createSession({ agent_id: selectedAgent.id }));
            setSessions([newSession]);
            setSelectedSession(newSession);
            console.log("[ChatInterface] Auto-created new session for agent:", selectedAgent.id, newSession);
          } catch (e) {
            setError("Failed to auto-create new chat session");
          }
        }
        setSessions(res);
      })
      .catch(() => setError("Failed to fetch sessions"));
  }, []);

  // Fetch messages when session is selected
  useEffect(() => {
    if (selectedSession && selectedSession.id) {
      setMessagesLoading(true);
      getMessages(selectedSession.id)
        .then((res) => {
          console.log("[ChatInterface] Fetched messages:", res);
          setMessages(res.messages || []);
        })
        .catch(() => setError("Failed to fetch messages"))
        .finally(() => setMessagesLoading(false));
    } else {
      setMessages([]);
    }
  }, [selectedSession]);

  // Connect WebSocket when agent and session are selected
  useEffect(() => {
    wsRef.current?.close();
    if (selectedAgent && selectedSession) {
      console.log("[ChatInterface] Creating ChatWebSocketService with sessionId:", selectedSession.id, "agentId:", selectedAgent.id);
      wsRef.current = new ChatWebSocketService({
        sessionId: selectedSession.id,
        agentId: selectedAgent.id,
        onMessage: (msg) => {
          console.log("[ChatInterface] Received message from WebSocket:", msg);
          setMessages((prev) => [...(prev || []), msg]);
        },
        onStatus: (status) => setWsStatus(status),
        onError: (err) => setError(err),
        reconnect: true,
      });
    } else {
      console.log("[ChatInterface] Not creating WebSocket: selectedAgent or selectedSession missing", { selectedAgent, selectedSession });
    }
    return () => {
      wsRef.current?.close();
    };
  }, [selectedAgent, selectedSession]);

  // Theme and sidebar logic (unchanged)
  useEffect(() => {
    // Check if theme is stored in localStorage
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    }

    // Close sidebar when clicking outside on mobile
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node) && window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    localStorage.setItem("theme", newTheme);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className={`flex h-screen ${theme === "dark" ? "bg-[#1e1e1e] text-white" : "bg-white text-black"}`}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-10"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Left sidebar */}
      <div
        ref={sidebarRef}
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } fixed md:static z-20 h-full w-[85vw] sm:w-[300px] border-r ${
          theme === "dark" ? "border-gray-800" : "border-gray-200"
        } flex flex-col transition-transform duration-300 ease-in-out`}
      >
        <div
          className={`p-4 border-b ${theme === "dark" ? "border-gray-800" : "border-gray-200"} flex justify-between items-center`}
        >
          <h2 className="text-xl font-semibold">Conversations</h2>
          <button
            className="bg-blue-500 text-white rounded-md px-4 py-1.5 text-sm"
            onClick={async () => {
              try {
                // Optionally, you could prompt for agent or title here
                const newSession = await import("@/services/api").then(mod => mod.createSession());
                // Refresh sessions
                const sessionList = await import("@/services/api").then(mod => mod.getSessions());
                setSessions(sessionList || []);
                setSelectedSession(newSession);
                // Find and select the agent for the new session
                const agent = (agents || []).find(a => a.id === newSession.agent_id) || null;
                setSelectedAgent(agent);
                setMessages([]);
              } catch (e) {
                setError("Failed to create new chat session");
              }
            }}
          >
            New Chat
          </button>
          <button className="md:hidden ml-2" onClick={toggleSidebar}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Conversation list background */}
          <div
            className={`${
              theme === "dark"
                ? "bg-gradient-to-b from-gray-900/50 to-gray-800/30"
                : "bg-gradient-to-b from-gray-100/80 to-blue-50/50"
            }`}
          >
            {/* Chat history from backend */}
            {(sessions || []).length === 0 ? (
              <div className="p-4 text-center text-gray-400">No conversations found.</div>
            ) : sessionsLoading ? (
              <div className="p-4 text-center text-gray-400">Loading conversations...</div>
            ) : (
              (sessions || []).map((session) => {
                // Find agent for this session
                const agent = (agents || []).find((a) => a.id === session.agent_id);
                const isSelected = selectedSession?.id === session.id;
                return (
                  <div
                    key={session.id}
                    className={`p-4 cursor-pointer ${
                      isSelected
                        ? theme === "dark"
                          ? "bg-gray-800/70"
                          : "bg-gray-100/70"
                        : ""
                    } border-b ${theme === "dark" ? "border-gray-800/50" : "border-gray-200/50"}`}
                    onClick={() => {
                      setSelectedSession(session);
                      setSelectedAgent(agent || null);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {agent ? agent.name : "Unknown Agent"}
                      </span>
                      <span className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                        {session.id}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col w-full">
        {/* Chat header */}
        <div
          className={`p-3 md:p-4 border-b ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          } flex justify-between items-center`}
        >
          <div className="flex items-center gap-2">
            <button className="md:hidden p-1.5 rounded-full" onClick={toggleSidebar}>
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg md:text-xl font-semibold">Tucker's Team</h1>
          </div>
          <button
            className={`p-1.5 rounded-full ${theme === "dark" ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Error and status banner */}
        {(error || wsStatus !== "connected") && (
          <div
            className={`px-4 py-2 text-sm ${
              error
                ? "bg-red-500 text-white"
                : wsStatus === "disconnected"
                ? "bg-yellow-500 text-black"
                : "bg-gray-700 text-white"
            }`}
          >
            {error
              ? error
              : wsStatus === "disconnected"
              ? "WebSocket disconnected. Trying to reconnect..."
              : wsStatus}
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
          {messagesLoading ? (
            <div className="text-center text-gray-400">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400">No messages yet.</div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === "user";
              const agent = (agents || []).find((a) => a.id === msg.agent_id);
              const agentColor =
                agent?.color ||
                (msg.agent_id && msg.agent_id === selectedAgent?.id
                  ? "bg-green-500"
                  : "bg-gray-700");
              return isUser ? (
                <div className="flex justify-end" key={msg.message_id}>
                  <div className="flex items-end gap-2 max-w-[85%] md:max-w-[75%]">
                    <div className="bg-blue-500 rounded-2xl px-3 py-2 md:px-4 md:py-2 text-sm md:text-base">
                      {msg.content}
                    </div>
                    <div className="bg-blue-500 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs">
                      You
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 md:gap-3" key={msg.message_id}>
                  <div
                    className={`w-1 rounded-full`}
                    style={{
                      background:
                        agent?.color ||
                        (msg.agent_id === selectedAgent?.id
                          ? "rgb(34 197 94)"
                          : "#555"),
                    }}
                  ></div>
                  <div className="flex-1 max-w-[85%] md:max-w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center"
                        style={{
                          background:
                            agent?.color ||
                            (msg.agent_id === selectedAgent?.id
                              ? "rgb(34 197 94)"
                              : "#555"),
                        }}
                      >
                        {agent?.name?.[0] || "A"}
                      </div>
                      <span className="font-medium text-sm md:text-base">
                        {agent?.name || "Agent"}
                      </span>
                    </div>
                    <p
                      className={`${
                        theme === "dark" ? "text-gray-200" : "text-gray-700"
                      } text-sm md:text-base`}
                    >
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Agent selection */}
        <div
          className={`border-t ${theme === "dark" ? "border-gray-800" : "border-gray-200"} p-2 md:p-3 flex gap-2 overflow-x-auto`}
        >
          {(agents || []).map((agent) => (
            <button
              key={agent.id}
              className={`rounded-full w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center border-2 transition-all duration-150 ${
                selectedAgent?.id === agent.id
                  ? "border-blue-500"
                  : "border-transparent"
              }`}
              style={{
                background: agent.color,
                color: "#fff",
                fontWeight: selectedAgent?.id === agent.id ? "bold" : "normal",
              }}
              aria-label={`Select agent ${agent.name}`}
              onClick={() => setSelectedAgent(agent)}
            >
              {agent.icon_path ? (
                <img
                  src={agent.icon_path}
                  alt={agent.name}
                  className="w-4 h-4 md:w-5 md:h-5"
                  style={{ borderRadius: "50%" }}
                />
              ) : (
                agent.name[0] || "A"
              )}
            </button>
          ))}
        </div>

        {/* Message input */}
        <div className="p-2 md:p-4 flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message... (Shift+Enter for new line)"
            className={`flex-1 ${
              theme === "dark" ? "bg-gray-800" : "bg-gray-100"
            } rounded-lg px-3 py-2 md:px-4 md:py-2 text-sm md:text-base outline-none`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (message.trim() && wsRef.current && wsStatus === "connected") {
                  wsRef.current.sendMessage(message.trim());
                  setMessage("");
                }
              }
            }}
          />
          <button
            className="bg-blue-500 text-white rounded-lg px-4 md:px-6 py-2 text-sm md:text-base whitespace-nowrap"
            onClick={() => {
              if (message.trim() && wsRef.current && wsStatus === "connected") {
                wsRef.current.sendMessage(message.trim());
                setMessage("");
              }
            }}
            disabled={!message.trim() || wsStatus !== "connected"}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
