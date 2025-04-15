import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getAgents } from '@/services/api'; // Import API function
import webSocketService from '@/services/websocket'; // Import WebSocket service
import { AgentInfo } from '@/types/api';
import AgentSelectionIcons from './agent-selection-icons';

interface InputAreaProps {
  activeSessionId: string | null;
  availableAgents: AgentInfo[]; // Add prop for all available agents
  activeAgentIds: string[]; // Add prop for active agent IDs in this session
  // Consider adding isLoadingAgents if needed from parent
}

export const InputArea: React.FC<InputAreaProps> = ({
  activeSessionId,
  availableAgents, // Use prop
  activeAgentIds,
}) => {
  const [text, setText] = useState('');
  // State for agents selected via icon clicks
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Removed internal agent fetching - availableAgents is now a prop
  // const { data: availableAgents = [], isLoading: isLoadingAgents } = useQuery<AgentInfo[]>({ ... });

  // Simplified check: Allow sending if agents are provided and a session is active
  // Assuming isLoading is handled by the parent component passing the props
  const canSendMessage = availableAgents.length > 0 && !!activeSessionId;

  // --- Mention logic (uses availableAgents prop) ---
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

  // Handler for agent icon clicks
  const handleAgentClick = (agentId: string) => {
    setSelectedAgentIds((prevSelected) => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(agentId)) {
        newSelected.delete(agentId);
      } else {
        newSelected.add(agentId);
      }
      console.log('Agents selected via icons:', Array.from(newSelected)); // For debugging
      return newSelected;
    });
  };

  // --- Send logic (uses WebSocket service directly) ---
  const handleSend = () => {
    const trimmedText = text.trim();
    if (!trimmedText || !canSendMessage || !activeSessionId) return;

    let targetAgentIds = new Set<string>();

    // 1. Prioritize agents selected via icons
    if (selectedAgentIds.size > 0) {
      targetAgentIds = new Set(selectedAgentIds);
      console.log(`Sending message to agents selected via icons: ${Array.from(targetAgentIds).join(', ')}`);
    } else {
      // 2. Fallback: Check for @mentions
      const mentionRegex = /@([a-zA-Z0-9_]+)/g;
      const mentionedNames = Array.from(trimmedText.matchAll(mentionRegex)).map(m => m[1].toLowerCase());
      const mentionedAgents = availableAgents.filter(agent =>
        mentionedNames.includes(agent.name.toLowerCase())
      );

      if (mentionedAgents.length > 0) {
        mentionedAgents.forEach(agent => targetAgentIds.add(agent.id));
        console.log(`Sending message to mentioned agents: ${mentionedAgents.map(a => a.name).join(', ')}`);
      } else {
        // 3. Fallback: Broadcast to all *active* agents in the session
        // Use the activeAgentIds prop passed down from ChatArea
        activeAgentIds.forEach(id => targetAgentIds.add(id));
        console.log(`Broadcasting message to all active agents in session ${activeSessionId}: ${activeAgentIds.join(', ')}`);
      } // Closing brace for the inner else (broadcast)
    } // Add missing closing brace for the outer else (mention/broadcast fallback)

    // Send the message via WebSocket to each target agent
    // TODO: Check connection status for each agent before sending if possible
    targetAgentIds.forEach(agentId => {
      webSocketService.sendTextMessage(agentId, trimmedText);
    });

    // Clear input and icon selection state after sending
    setText('');
    setSelectedAgentIds(new Set()); // Clear icon selections
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
      {/* Pass agent lists, selected state, and handler down */}
      <AgentSelectionIcons
        availableAgents={availableAgents}
        activeAgentIds={activeAgentIds}
        selectedAgentIds={selectedAgentIds} // Pass state down
        onAgentClick={handleAgentClick} // Pass handler down
      />
      {/* Use gap-2 for consistent spacing between form elements */}
      <form className="flex items-center mt-2 gap-2" onSubmit={e => { e.preventDefault(); handleSend(); }}>
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
          // className="mr-2" // Removed margin, handled by gap
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
            // Removed mr-2, handled by gap. Keep pr-10 if needed for visual overlap with send button, or adjust send button positioning.
            className="flex-grow resize-none bg-gray-800 border border-gray-600 rounded pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
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
          // className="ml-2" // Removed margin, handled by gap
        >
          Send
        </Button>
      </form>
    </section>
  );
};
