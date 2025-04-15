/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatInput } from '../chat-input';
import * as mentionHighlighter from '../../lib/mention-highlighter';

// Mock the mention-highlighter functions
jest.mock('../../lib/mention-highlighter', () => ({
  findMentionAtCursor: jest.fn(),
  getAgentSuggestions: jest.fn(),
  replaceMention: jest.fn(),
  highlightMentions: jest.fn(),
  detectMarkdown: jest.fn()
}));

describe('ChatInput component', () => {
  const mockOnSend = jest.fn();
  const mockOnTyping = jest.fn();
  const mockAvailableAgents = ['chloe', 'parker', 'librarian'];
  const mockAgentMetadata = {
    chloe: { 
      name: 'Chloe', 
      primaryColor: '210, 100%, 50%' 
    },
    parker: { 
      name: 'Parker', 
      primaryColor: '150, 100%, 40%' 
    },
    librarian: { 
      name: 'Librarian', 
      primaryColor: '25, 100%, 50%' 
    }
  };

  beforeEach(() => {
    mockOnSend.mockClear();
    mockOnTyping.mockClear();
    
    // Reset all mocked functions
    mentionHighlighter.findMentionAtCursor.mockReset();
    mentionHighlighter.getAgentSuggestions.mockReset();
    mentionHighlighter.replaceMention.mockReset();
    mentionHighlighter.highlightMentions.mockReset();
    mentionHighlighter.detectMarkdown.mockReset();
    
    // Default implementation
    mentionHighlighter.findMentionAtCursor.mockReturnValue(null);
    mentionHighlighter.getAgentSuggestions.mockReturnValue([]);
    mentionHighlighter.replaceMention.mockImplementation((text, start, end, replacement) => {
      return text.substring(0, start) + replacement + text.substring(end);
    });
    mentionHighlighter.highlightMentions.mockImplementation((text) => [{ type: 'text', text }]);
    mentionHighlighter.detectMarkdown.mockReturnValue({
      hasBold: false,
      hasItalic: false,
      hasCode: false,
      hasLink: false,
      hasListItem: false,
      hasHeading: false
    });
  });

  it('renders the input component', () => {
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
      />
    );
    
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('sends a message when button is clicked', () => {
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
      />
    );
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    
    const sendButton = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendButton);
    
    expect(mockOnSend).toHaveBeenCalledWith('Hello world');
    expect(textarea.value).toBe('');
  });

  it('sends a message when Enter is pressed (without Shift)', () => {
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
      />
    );
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    
    expect(mockOnSend).toHaveBeenCalledWith('Hello world');
    expect(textarea.value).toBe('');
  });

  it('creates a new line when Shift+Enter is pressed', () => {
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
      />
    );
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    
    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('triggers typing indicator when user types', async () => {
    jest.useFakeTimers();
    
    render(
      <ChatInput 
        onSend={mockOnSend}
        onTyping={mockOnTyping}
        placeholder="Type a message..."
      />
    );
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'H' } });
    
    expect(mockOnTyping).toHaveBeenCalledWith(true);
    mockOnTyping.mockClear();
    
    // Fast-forward 2 seconds
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    
    expect(mockOnTyping).toHaveBeenCalledWith(false);
    
    jest.useRealTimers();
  });

  it('shows @mention suggestions when typing a mention', () => {
    // Mock finding a mention at cursor
    mentionHighlighter.findMentionAtCursor.mockReturnValue({
      fullText: '@ch',
      name: 'ch',
      startIndex: 0,
      endIndex: 3,
      isPartial: true
    });
    
    // Mock getting suggestions
    mentionHighlighter.getAgentSuggestions.mockReturnValue(['chloe', 'chef']);
    
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
        availableAgents={mockAvailableAgents}
        agentMetadata={mockAgentMetadata}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '@ch' } });
    
    // Wait for suggestions to appear
    expect(mentionHighlighter.findMentionAtCursor).toHaveBeenCalled();
    expect(mentionHighlighter.getAgentSuggestions).toHaveBeenCalled();
  });

  it('replaces mention when a suggestion is selected', () => {
    // Mock finding a mention at cursor
    mentionHighlighter.findMentionAtCursor.mockReturnValue({
      fullText: '@ch',
      name: 'ch',
      startIndex: 0,
      endIndex: 3,
      isPartial: true
    });
    
    // Mock getting suggestions
    mentionHighlighter.getAgentSuggestions.mockReturnValue(['chloe']);
    
    mentionHighlighter.replaceMention.mockReturnValue('@chloe ');
    
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
        availableAgents={mockAvailableAgents}
        agentMetadata={mockAgentMetadata}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '@ch' } });
    
    // Tab to select the first suggestion
    fireEvent.keyDown(textarea, { key: 'Tab' });
    
    expect(mentionHighlighter.replaceMention).toHaveBeenCalled();
  });

  it('shows markdown hint when markdown is detected', () => {
    mentionHighlighter.detectMarkdown.mockReturnValue({
      hasBold: true,
      hasItalic: false,
      hasCode: false,
      hasLink: false,
      hasListItem: false,
      hasHeading: false
    });
    
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
        allowMarkdown={true}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '**bold**' } });
    
    expect(mentionHighlighter.detectMarkdown).toHaveBeenCalled();
    expect(screen.getByText('**bold**')).toBeInTheDocument();
  });

  it('disables the send button when the input is empty', () => {
    render(
      <ChatInput 
        onSend={mockOnSend}
        placeholder="Type a message..."
      />
    );
    
    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    
    expect(sendButton).not.toBeDisabled();
  });
});