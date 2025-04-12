import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import useChatStore from '@/store';
import { AgentInfo } from '@/types/api';

export const InputArea: React.FC = () => {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Zustand store
  const sendTextMessage = useChatStore(state => state.sendTextMessage);
  const agentConnectionStatus = useChatStore(state => state.agentConnectionStatus);
  const availableAgents = useChatStore(state => state.availableAgents);
  const agentErrors = useChatStore(state => state.agentErrors);
  const clearAgentError = useChatStore(state => state.clearAgentError);

  // Allow sending if any agent is connected
  const isAnyAgentConnected = Object.values(agentConnectionStatus).includes('connected');

  // Mention logic
  const getMentionCandidates = () => {
    if (!mentionQuery) return availableAgents;
    return availableAgents.filter(agent =>
      agent.name.toLowerCase().startsWith(mentionQuery.toLowerCase())
    );
  };
  const mentionCandidates = getMentionCandidates();

  // Detect @mention trigger and update dropdown state
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // Find the last "@" before the caret
    const caret = e.target.selectionStart ?? value.length;
    const textBeforeCaret = value.slice(0, caret);
    const atMatch = textBeforeCaret.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentionDropdown(true);
      setMentionDropdownIndex(0);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery('');
    }
  };

  // Insert @mention at caret
  const insertMention = (agent: AgentInfo) => {
    if (!textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? text.length;
    const value = text;
    const textBeforeCaret = value.slice(0, caret);
    const textAfterCaret = value.slice(caret);

    // Replace the last "@..." with "@agentName "
    const newTextBeforeCaret = textBeforeCaret.replace(/(?:^|\s)@([a-zA-Z0-9_]*)$/, match => {
      // Preserve leading space if present
      return (match.startsWith(' ') ? ' ' : '') + `@${agent.name} `;
    });
    const newText = newTextBeforeCaret + textAfterCaret;
    setText(newText);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionDropdownIndex(0);

    // Move caret to after inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newTextBeforeCaret.length;
      }
    }, 0);
  };

  // Keyboard navigation for mention dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    // Normal send on Enter (if not in mention dropdown)
    if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
      e.preventDefault();
      handleSend();
    }
  };

  // Send logic
  const handleSend = () => {
    if (!text.trim() || !isAnyAgentConnected) return;
    sendTextMessage(text);
    setText('');
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionDropdownIndex(0);
  };

  // File upload logic (unchanged)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        // Not implemented for ADK streaming
        // Optionally, show a toast or warning here
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

  // Mention dropdown positioning (basic, below textarea)
  const mentionDropdownStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    bottom: '100%',
    zIndex: 10,
    background: '#23272a',
    border: '1px solid #444',
    borderRadius: 4,
    minWidth: 120,
    maxHeight: 180,
    overflowY: 'auto',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
  };

  // Error display: show any agent error
  const firstError = Object.values(agentErrors).find(e => e);

  return (
    <section className="p-4 border-t border-gray-700 relative">
      {firstError && (
        <div className="text-red-500 text-sm mb-2 text-center">
          {firstError}
          <button
            onClick={() => {
              // Clear all errors
              availableAgents.forEach(agent => clearAgentError(agent.id));
            }}
            className="ml-2 text-red-400 hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}
      <form className="flex items-center" onSubmit={e => { e.preventDefault(); handleSend(); }}>
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
          disabled={isUploading || !isAnyAgentConnected}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? '📤' : '📎'}
        </Button>
        <div className="relative flex-grow">
          <Textarea
            ref={textareaRef}
            placeholder={
              !isAnyAgentConnected
                ? "Waiting for agent connection..."
                : "Type a message... (Shift+Enter for new line, @ to mention an agent)"
            }
            rows={1}
            className="flex-grow resize-none mr-2 bg-gray-800 border border-gray-600 rounded"
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={!isAnyAgentConnected || isUploading}
            autoComplete="off"
          />
          {showMentionDropdown && mentionCandidates.length > 0 && (
            <div style={mentionDropdownStyle}>
              {mentionCandidates.map((agent, idx) => (
                <div
                  key={agent.id}
                  className={`px-3 py-1 cursor-pointer ${idx === mentionDropdownIndex ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`}
                  onMouseDown={e => { e.preventDefault(); insertMention(agent); }}
                >
                  <span className="font-semibold">@{agent.name}</span>
                  <span className="ml-2 text-xs" style={{ color: agent.color }}>{agent.color}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <Button
          type="submit"
          variant="default"
          disabled={!text.trim() || !isAnyAgentConnected || isUploading}
        >
          Send
        </Button>
      </form>
    </section>
  );
};
