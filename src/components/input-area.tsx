import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getAgents } from '@/services/api'; // Import API function
import webSocketService from '@/services/websocket'; // Import WebSocket service
import { AgentInfo } from '@/types/api';
import AgentSelectionIcons from './agent-selection-icons'; // Import the new component

interface InputAreaProps {
  activeSessionId: string | null; // Need session ID to know where to send messages
}

export const InputArea: React.FC<InputAreaProps> = ({ activeSessionId }) => {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false); // Keep file upload state
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available agents for @mention feature
  const { data: availableAgents = [], isLoading: isLoadingAgents } = useQuery<AgentInfo[]>({
    queryKey: ['agents'],
    queryFn: getAgents,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Removed Zustand store state: sendTextMessage, agentConnectionStatus, agentErrors, clearAgentError

  // Simplified check: Allow sending if agents are loaded and a session is active
  const canSendMessage = !isLoadingAgents && availableAgents.length > 0 && !!activeSessionId;

  // --- Mention logic (uses fetched availableAgents) ---
  const getMentionCandidates = () => {
    if (!mentionQuery) return availableAgents;
    return availableAgents.filter(agent =>
      agent.name.toLowerCase().startsWith(mentionQuery.toLowerCase())
    );
  };
  const mentionCandidates = getMentionCandidates();

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    const caret = e.target.selectionStart ?? value.length;
    const textBeforeCaret = value.slice(0, caret);
    const atMatch = textBeforeCaret.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);

    if (atMatch && availableAgents.length > 0) { // Only show dropdown if agents exist
      setMentionQuery(atMatch[1]);
      setShowMentionDropdown(true);
      setMentionDropdownIndex(0);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery('');
    }
  };

  const insertMention = (agent: AgentInfo) => {
    // ... (Keep existing insertMention implementation)
    if (!textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? text.length;
    const value = text;
    const textBeforeCaret = value.slice(0, caret);
    const textAfterCaret = value.slice(caret);

    const newTextBeforeCaret = textBeforeCaret.replace(/(?:^|\s)@([a-zA-Z0-9_]*)$/, match => {
      return (match.startsWith(' ') ? ' ' : '') + `@${agent.name} `;
    });
    const newText = newTextBeforeCaret + textAfterCaret;
    setText(newText);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionDropdownIndex(0);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newTextBeforeCaret.length;
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ... (Keep existing handleKeyDown implementation for mention dropdown)
    if (showMentionDropdown && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionDropdownIndex(i => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionDropdownIndex(i => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionDropdownIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionDropdown(false);
        setMentionQuery('');
        return;
      }
    }
    // Normal send on Enter
    if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- Send logic (uses WebSocket service directly) ---
  const handleSend = () => {
    const trimmedText = text.trim();
    if (!trimmedText || !canSendMessage || !activeSessionId) return;

    // --- Replicate @mention/broadcast logic ---
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const mentionedNames = Array.from(trimmedText.matchAll(mentionRegex)).map(m => m[1].toLowerCase());
    const mentionedAgents = availableAgents.filter(agent =>
      mentionedNames.includes(agent.name.toLowerCase())
    );

    // TODO: Need connection status to send only to connected agents.
    // For now, sending based only on mention or broadcast to all available.
    // This requires the parent component/context to provide connection status.
    // --- TEMPORARY: Send to all mentioned or all available ---
    const targetAgentIds = new Set<string>();
    if (mentionedAgents.length > 0) {
        mentionedAgents.forEach(agent => targetAgentIds.add(agent.id));
        console.log(`Sending message to mentioned agents: ${mentionedAgents.map(a => a.name).join(', ')}`);
    } else {
        availableAgents.forEach(agent => targetAgentIds.add(agent.id));
        console.log(`Broadcasting message to all available agents for session ${activeSessionId}`);
    }

    targetAgentIds.forEach(agentId => {
        // Note: WebSocketService handles the check if the socket for agentId is actually open
        webSocketService.sendTextMessage(agentId, trimmedText);
    });
    // --- End Temporary Logic ---


    setText('');
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionDropdownIndex(0);
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset height after sending
    }
  };

  // --- File upload logic (unchanged) ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ... (Keep existing handleFileSelect implementation)
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      // Removed unused 'event' parameter
      reader.onload = () => {
        console.warn("File upload not implemented for ADK streaming yet.");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset height
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`; // Set to scroll height
    }
  }, [text]);

  // Mention dropdown positioning (unchanged)
  const mentionDropdownStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    bottom: '100%', // Position above the textarea
    marginBottom: '4px', // Add some space
    zIndex: 10,
    background: '#23272a', // Dark background
    border: '1px solid #444',
    borderRadius: 4,
    minWidth: 150, // Ensure enough width
    maxHeight: 180,
    overflowY: 'auto',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
  };

  // Removed error display section

  return (
    <section className="p-4 border-t border-gray-700 relative">
      {/* Removed error display */}
      <AgentSelectionIcons /> {/* Render the agent icons */}
      <form className="flex items-center mt-2" onSubmit={e => { e.preventDefault(); handleSend(); }}> {/* Added mt-2 */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
        <Button
          type="button"
          variant="ghost"
          className="mr-2"
          disabled={isUploading || !canSendMessage} // Simplified disabled logic
          onClick={() => fileInputRef.current?.click()}
          title="Upload file (not implemented)"
        >
          {isUploading ? '📤' : '📎'}
        </Button>
        <div className="relative flex-grow">
          <Textarea
            ref={textareaRef}
            placeholder={
              !canSendMessage
                ? "Connect to an agent to chat..." // Updated placeholder
                : "Type a message... (Shift+Enter for new line, @ to mention)"
            }
            rows={1}
            className="flex-grow resize-none mr-2 bg-gray-800 border border-gray-600 rounded pr-10" // Added padding for send button overlap
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={!canSendMessage || isUploading}
            autoComplete="off"
          />
          {showMentionDropdown && mentionCandidates.length > 0 && (
            <div style={mentionDropdownStyle}>
              {mentionCandidates.map((agent, idx) => (
                <div
                  key={agent.id}
                  className={`px-3 py-1.5 text-sm cursor-pointer ${idx === mentionDropdownIndex ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`}
                  onMouseDown={e => { e.preventDefault(); insertMention(agent); }} // Use onMouseDown to prevent blur
                >
                  <span className="font-semibold">@{agent.name}</span>
                  {/* Optional: Show agent color or description */}
                  {/* <span className="ml-2 text-xs" style={{ color: agent.color }}>●</span> */}
                </div>
              ))}
            </div>
          )}
        </div>
        <Button
          type="submit"
          variant="default"
          disabled={!text.trim() || !canSendMessage || isUploading} // Simplified disabled logic
          className="ml-2" // Ensure space between textarea and button
        >
          Send
        </Button>
      </form>
    </section>
  );
};
