import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { MentionSuggestion } from "./mention-suggestion";
import type { 
  MentionMatch,
  MentionSegment
} from "../../lib/mention-highlighter";
import { 
  findMentionAtCursor, 
  getAgentSuggestions, 
  replaceMention, 
  highlightMentions,
  detectMarkdown
} from "../../lib/mention-highlighter";
import type { ChatInputProps } from './chat-input.d';

export const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(({
  onSend,
  onTyping,
  disabled = false,
  placeholder = "Type a message...",
  allowMarkdown = true,
  availableAgents = [],
  agentMetadata = {},
  currentAgentId,
  className,
  ...props
}, ref) => {
  const [message, setMessage] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState<number>(0);
  const [suggestionsPosition, setSuggestionsPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [activeMention, setActiveMention] = useState<MentionMatch | null>(null);
  const [showMarkdownHint, setShowMarkdownHint] = useState(false);
  
  // Refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const visibleInputRef = useRef<HTMLDivElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  
  // Initialize merged ref
  const handleRef = (element: HTMLTextAreaElement | null) => {
    // Handle textarea ref
    textareaRef.current = element;
    
    // Handle forwarded ref
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  };
  
  // Auto-resize textarea based on content
  useEffect(() => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 200);
    textarea.style.height = `${newHeight}px`;
    
    // Update visible input with highlighted content
    if (visibleInputRef.current) {
      updateHighlightedInput();
    }
  }, [message]);
  
  // Update the highlighted input display
  const updateHighlightedInput = useCallback(() => {
    if (!visibleInputRef.current) return;
    
    // Get the highlighted segments
    const segments = highlightMentions(message, availableAgents);
    
    // Check for markdown features
    const markdownFeatures = detectMarkdown(message);
    const hasMarkdown = Object.values(markdownFeatures).some(value => value);
    setShowMarkdownHint(hasMarkdown);
    
    // Clear previous content
    while (visibleInputRef.current.firstChild) {
      visibleInputRef.current.removeChild(visibleInputRef.current.firstChild);
    }
    
    // Create spans for each segment
    segments.forEach((segment: MentionSegment) => {
      const span = document.createElement('span');
      span.textContent = segment.text;
      
      if (segment.type === 'mention') {
        span.className = 'mention bg-primary/10 text-primary font-medium rounded px-1';
      } 
      else if (segment.type === 'invalid-mention') {
        span.className = 'invalid-mention bg-destructive/10 text-destructive rounded px-1';
      } 
      
      if (visibleInputRef.current) {
        visibleInputRef.current.appendChild(span);
      }
    });
    
    // Add a trailing space to ensure proper height calculation
    if (message.endsWith('\n')) {
      visibleInputRef.current.appendChild(document.createTextNode('\n '));
    }
  }, [message, availableAgents]);
  
  // Handle cursor position changes
  const handleCursorChange = useCallback(() => {
    if (!textareaRef.current) return;
    
    // Get current cursor position
    const cursorPos = textareaRef.current.selectionStart;
    setCursorPosition(cursorPos);
    
    // Check if cursor is within a @mention
    const mention = findMentionAtCursor(message, cursorPos);
    
    if (mention && mention.isPartial) {
      // Show suggestions for partial mention
      setActiveMention(mention);
      
      // Get filtered suggestions
      const filteredSuggestions = getAgentSuggestions(
        mention.name, 
        availableAgents,
        5
      );
      
      setSuggestions(filteredSuggestions);
      setActiveSuggestion(0);
      
      // Position the suggestions dropdown near the @mention
      if (textareaRef.current) {
        // Get the textarea's position and text properties
        const { selectionStart } = textareaRef.current;
        const textBeforeCursor = message.substring(0, selectionStart);
        const lineBreaks = (textBeforeCursor.match(/\n/g) || []).length;
        
        // Calculate approximate position
        const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight) || 20;
        const paddingTop = parseInt(getComputedStyle(textareaRef.current).paddingTop) || 0;
        const paddingLeft = parseInt(getComputedStyle(textareaRef.current).paddingLeft) || 0;
        
        // Get scrollTop from textarea
        const scrollTop = textareaRef.current.scrollTop;
        
        // Calculate the position relative to the textarea
        const top = paddingTop + (lineBreaks * lineHeight) - scrollTop + 30; // 30px below the current line
        const leftPos = Math.max(paddingLeft, 10);
        
        setSuggestionsPosition({ top, left: leftPos });
      }
    } else {
      // Clear suggestions if not in a @mention
      setSuggestions([]);
      setActiveMention(null);
    }
  }, [message, availableAgents]);
  
  // Trigger handleCursorChange when the cursor moves or message changes
  useEffect(() => {
    handleCursorChange();
  }, [cursorPosition, message, handleCursorChange]);
  
  // Handle textarea cursor position changes
  const handleSelectionChange = () => {
    if (!textareaRef.current) return;
    setCursorPosition(textareaRef.current.selectionStart);
  };
  
  // Add selection change event listener
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('click', handleSelectionChange);
      textarea.addEventListener('keyup', handleSelectionChange);
      
      return () => {
        textarea.removeEventListener('click', handleSelectionChange);
        textarea.removeEventListener('keyup', handleSelectionChange);
      };
    }
  }, []);
  
  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: string) => {
    if (!activeMention) return;
    
    // Create the replacement (complete @mention)
    const replacement = `@${suggestion}`;
    
    // Update the message with the suggestion
    const newMessage = replaceMention(
      message, 
      activeMention.startIndex, 
      activeMention.endIndex, 
      replacement
    );
    
    // Update the message and cursor position
    setMessage(newMessage);
    
    // Calculate new cursor position after the inserted mention
    const newCursorPos = activeMention.startIndex + replacement.length;
    
    // Set cursor position after the component updates
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPosition(newCursorPos);
      }
    }, 0);
    
    // Clear suggestions
    setSuggestions([]);
    setActiveMention(null);
  };
  
  // Trigger typing indicator
  useEffect(() => {
    if (!onTyping) return;
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    if (message.trim()) {
      onTyping(true);
      
      // Set typing to false after 1.5 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 1500);
    } else {
      onTyping(false);
    }
    
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message, onTyping]);
  
  // Handle message submission
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled || isSending) return;
    
    try {
      setIsSending(true);
      await onSend(trimmedMessage, currentAgentId || 'default');
      setMessage("");
      
      // Focus textarea after sending
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      
      // Clear suggestions
      setSuggestions([]);
      setActiveMention(null);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };
  
  // Handle key presses for submission and suggestions navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle message sending with Enter (but allow Shift+Enter for new lines)
    if (e.key === 'Enter' && !e.shiftKey) {
      // If suggestions are open, select the active suggestion instead
      if (suggestions.length > 0) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[activeSuggestion]);
        return;
      }
      
      e.preventDefault();
      handleSend();
      return;
    }
    
    // Handle suggestion navigation with arrow keys
    if (suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveSuggestion(prev => 
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          setActiveSuggestion(prev => 
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          break;
          
        case 'Escape':
          e.preventDefault();
          setSuggestions([]);
          setActiveMention(null);
          break;
          
        case 'Tab':
          // Select the active suggestion
          e.preventDefault();
          handleSelectSuggestion(suggestions[activeSuggestion]);
          break;
      }
    }
  };
  
  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    setCursorPosition(e.target.selectionStart);
  };
  
  // Get markdown placeholder text
  const getMarkdownHint = () => {
    if (!allowMarkdown) return null;
    
    return (
      <div className="text-xs text-muted-foreground mt-1 flex gap-2">
        <span className="inline-flex items-center">
          <kbd className="px-1 bg-muted rounded text-[10px] mr-1">**bold**</kbd>
        </span>
        <span className="inline-flex items-center">
          <kbd className="px-1 bg-muted rounded text-[10px] mr-1">*italic*</kbd>
        </span>
        <span className="inline-flex items-center">
          <kbd className="px-1 bg-muted rounded text-[10px] mr-1">`code`</kbd>
        </span>
        <span className="inline-flex items-center">
          <kbd className="px-1 bg-muted rounded text-[10px] mr-1">@mention</kbd>
        </span>
      </div>
    );
  };
  
  return (
    <div 
      className={cn("chat-input-container relative", className)}
      role="form"
      aria-label="Message input form"
    >      
      {/* Input area */}
      <div className="flex items-end gap-2 bg-background border border-input rounded-md p-2 focus-within:ring-2 focus-within:ring-primary focus-within:ring-opacity-50">
        <div className="flex-1 relative min-h-[40px] max-h-[200px]">
          {/* Hidden textarea for actual input */}
          <textarea
            ref={handleRef}
            className="absolute inset-0 resize-none bg-transparent outline-none p-2 w-full overflow-hidden"
            placeholder={placeholder}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            aria-label="Message input"
            aria-multiline="true"
            aria-required="true"
            style={{ caretColor: 'auto' }}
            {...props}
          />
          
          {/* Visible div for syntax highlighting */}
          <div 
            ref={visibleInputRef}
            className="whitespace-pre-wrap break-words overflow-hidden invisible p-2 min-h-[40px]"
            aria-hidden="true"
          >
            {message}
          </div>
        </div>
        
        <Button
          type="button"
          size="icon"
          disabled={disabled || !message.trim() || isSending}
          onClick={handleSend}
          className="h-10 w-10 shrink-0 rounded-full"
          aria-label="Send message"
        >
          <svg 
            className="h-5 w-5" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </Button>
      </div>
      
      {/* Markdown hint - show either when explicitly enabled or when markdown is detected */}
      {(allowMarkdown && (showMarkdownHint || message.length === 0)) && getMarkdownHint()}
      
      {/* Mention suggestions */}
      {suggestions.length > 0 && activeMention && (
        <MentionSuggestion
          ref={suggestionsRef}
          suggestions={suggestions}
          onSelect={handleSelectSuggestion}
          activeIndex={activeSuggestion}
          position={suggestionsPosition}
          agents={agentMetadata}
        />
      )}
    </div>
  );
});

ChatInput.displayName = "ChatInput";
