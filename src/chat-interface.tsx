"use client"

import { useState, useEffect, useRef } from "react"
import { Moon, Download, ChevronDown, Sun, Menu, X } from "lucide-react"

export default function ChatInterface() {
  const [message, setMessage] = useState("")
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Check if theme is stored in localStorage
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle("dark", savedTheme === "dark")
    }

    // Close sidebar when clicking outside on mobile
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node) && window.innerWidth < 768) {
        setSidebarOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark"
    setTheme(newTheme)
    document.documentElement.classList.toggle("dark", newTheme === "dark")
    localStorage.setItem("theme", newTheme)
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

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
          <button className="bg-blue-500 text-white rounded-md px-4 py-1.5 text-sm">New Chat</button>
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
            {/* Chat history */}
            {Array(4)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className={`p-4 hover:${theme === "dark" ? "bg-gray-800/70" : "bg-gray-100/70"} cursor-pointer ${
                    i % 2 === 1 ? (theme === "dark" ? "bg-gray-900/40" : "bg-gray-50/60") : ""
                  } border-b ${theme === "dark" ? "border-gray-800/50" : "border-gray-200/50"}`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">New Chat</span>
                    <span className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                      {i === 0 ? "Just now" : `${i} day${i > 1 ? "s" : ""} ago`}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div
          className={`p-4 border-t ${theme === "dark" ? "border-gray-800" : "border-gray-200"} flex items-center justify-between`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">Library</span>
            <span className={`${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(2)</span>
            <ChevronDown className={`w-4 h-4 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`} />
          </div>
          <Download className={`w-4 h-4 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`} />
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

        {/* Chat messages */}
        <div className="flex-1 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
          {/* User message 1 */}
          <div className="flex justify-end">
            <div className="flex items-end gap-2 max-w-[85%] md:max-w-[75%]">
              <div className="bg-blue-500 rounded-2xl px-3 py-2 md:px-4 md:py-2 text-sm md:text-base">hello</div>
              <div className="bg-blue-500 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs">
                T
              </div>
            </div>
          </div>

          {/* Chloe message */}
          <div className="flex gap-2 md:gap-3">
            <div className="w-1 bg-green-500 rounded-full"></div>
            <div className="flex-1 max-w-[85%] md:max-w-full">
              <div className="flex items-center gap-2 mb-1">
                <div className="bg-green-500 rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 md:w-4 md:h-4 text-white" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                </div>
                <span className="font-medium text-sm md:text-base">Chloe</span>
              </div>
              <p className={`${theme === "dark" ? "text-gray-200" : "text-gray-700"} text-sm md:text-base`}>
                Hi there! I notice you've said hello three times. I'm Chloe, and I'm here to help you. Is there
                something specific you'd like assistance with? I'm particularly knowledgeable about git operations, but
                I can help with various other topics as well.
              </p>
            </div>
          </div>

          {/* User message 2 */}
          <div className="flex justify-end">
            <div className="flex items-end gap-2 max-w-[85%] md:max-w-[75%]">
              <div className="bg-blue-500 rounded-2xl px-3 py-2 md:px-4 md:py-2 text-sm md:text-base">
                @architect hello
              </div>
              <div className="bg-blue-500 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs">
                T
              </div>
            </div>
          </div>

          {/* Architect message */}
          <div className="flex gap-2 md:gap-3">
            <div className="w-1 bg-orange-500 rounded-full"></div>
            <div className="flex-1 max-w-[85%] md:max-w-full">
              <div className="flex items-center gap-2 mb-1">
                <div className="bg-orange-500 rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 md:w-4 md:h-4 text-white" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z" />
                  </svg>
                </div>
                <span className="font-medium text-sm md:text-base">Architect</span>
              </div>
              <p className={`${theme === "dark" ? "text-gray-200" : "text-gray-700"} text-sm md:text-base`}>
                Hello! I'm here as a Solutions Architect specializing in modern web application architectures,
                particularly for single-user applications that run locally. I can help you with...
              </p>
            </div>
          </div>
        </div>

        {/* Agent selection */}
        <div
          className={`border-t ${theme === "dark" ? "border-gray-800" : "border-gray-200"} p-2 md:p-3 flex gap-2 overflow-x-auto`}
        >
          <div className="bg-green-500 rounded-full w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 text-white" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <div className="bg-gray-700 rounded-full w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 text-white" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
            </svg>
          </div>
          <div className="text-gray-400 flex items-center">|</div>
          <div className="bg-orange-500 rounded-full w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 text-white" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z" />
            </svg>
          </div>
          <div className="bg-purple-500 rounded-full w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 text-white" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          </div>
          <div className="bg-blue-500 rounded-full w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 text-white" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
            </svg>
          </div>
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
          />
          <button className="bg-blue-500 text-white rounded-lg px-4 md:px-6 py-2 text-sm md:text-base whitespace-nowrap">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
