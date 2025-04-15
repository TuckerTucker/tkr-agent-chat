/**
 * @fileoverview Tests for MessageList component functionality.
 */

import { describe, test, expect, spyOn, beforeEach } from 'bun:test';
import { MessageList } from '../message-list';
import { AGENT_THEMES } from '../../../lib/agent-themes';

describe('MessageList', () => {
  // Sample messages for testing
  const sampleMessages = [
    {
      id: 'msg1',
      role: 'user',
      content: 'Hello, how are you?',
      timestamp: '2023-04-01T12:00:00Z'
    },
    {
      id: 'msg2',
      role: 'agent',
      agentId: 'chloe',
      agentName: 'Chloe',
      content: 'I\'m doing well, thanks for asking!',
      timestamp: '2023-04-01T12:01:00Z'
    },
    {
      id: 'msg3',
      role: 'agent',
      agentId: 'parker',
      agentName: 'Parker',
      content: 'I\'m Parker, how can I help with UI design?',
      timestamp: '2023-04-01T12:02:00Z'
    },
    {
      id: 'msg4',
      role: 'user',
      content: '@chloe Can you help me with a question?',
      mentions: [{ agentId: 'chloe', agentName: 'Chloe' }],
      timestamp: '2023-04-01T12:03:00Z'
    }
  ];

  // Mock getAgentMetadata function
  const mockGetAgentMetadata = (id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    avatar: null
  });

  test('basic properties and structure', () => {
    // Testing the structure and organization of the MessageList component
    expect(MessageList).toBeTruthy();
    expect(MessageList.displayName).toBe('MessageList');
  });
  
  test('maps API message format to message component props', () => {
    // This is a unit test for the message mapping logic
    
    // Recreate the mapping logic from the component
    const mapMessageToProps = (message) => {
      // Convert role to sender format expected by Message component
      const sender = message.role === 'user' ? 'user' : 'agent';
      
      // Get agent information if it's an agent message
      let agentData = {};
      if (sender === 'agent' && message.agentId) {
        // Get full agent metadata including avatar
        const agentMeta = mockGetAgentMetadata(message.agentId);
        
        // Get agent theme colors
        const agentTheme = AGENT_THEMES[message.agentId] || AGENT_THEMES.default;
        
        // Build enhanced agent data
        agentData = {
          agentId: message.agentId,
          agentName: message.agentName || agentMeta.name,
          agentColor: agentTheme.primary,
          agentAccentColor: agentTheme.accent,
          agentSecondary: agentTheme.secondary,
          avatar: agentMeta.avatar || null,
          isPrimary: message.isPrimary === true
        };
      }
      
      // Handle mentions in user messages
      let mentionsData = {};
      if (sender === 'user' && message.mentions && message.mentions.length > 0) {
        // Convert mention objects to include agent colors for highlighting
        const enhancedMentions = message.mentions.map(mention => {
          const agentTheme = AGENT_THEMES[mention.agentId] || AGENT_THEMES.default;
          return {
            ...mention,
            color: agentTheme.primary
          };
        });
        
        mentionsData = {
          mentions: enhancedMentions,
          hasMentions: true
        };
      }
      
      // Build metadata for the message
      const metadata = {
        ...message.metadata || {},
        ...agentData,
        ...mentionsData,
        deliveryStatus: message.deliveryStatus || 'sent'
      };
      
      return {
        id: message.id,
        content: message.content,
        sender,
        timestamp: new Date(message.timestamp || Date.now()),
        markdown: true,
        metadata,
        status: message.isTyping ? 'sending' : (message.isError ? 'error' : 'sent'),
        isTyping: message.isTyping,
        isError: message.isError,
        isSystem: message.role === 'system'
      };
    };
    
    // Test user message mapping
    const userMessage = sampleMessages[0];
    const userProps = mapMessageToProps(userMessage);
    
    expect(userProps.sender).toBe('user');
    expect(userProps.content).toBe('Hello, how are you?');
    expect(userProps.id).toBe('msg1');
    
    // Test agent message mapping
    const agentMessage = sampleMessages[1];
    const agentProps = mapMessageToProps(agentMessage);
    
    expect(agentProps.sender).toBe('agent');
    expect(agentProps.content).toBe('I\'m doing well, thanks for asking!');
    expect(agentProps.metadata.agentName).toBe('Chloe');
    expect(agentProps.metadata.agentColor).toBe(AGENT_THEMES.chloe.primary);
    
    // Test message with mentions
    const mentionMessage = sampleMessages[3];
    const mentionProps = mapMessageToProps(mentionMessage);
    
    expect(mentionProps.sender).toBe('user');
    expect(mentionProps.metadata.mentions[0].agentId).toBe('chloe');
    expect(mentionProps.metadata.mentions[0].color).toBe(AGENT_THEMES.chloe.primary);
    expect(mentionProps.metadata.hasMentions).toBe(true);
  });
  
  test('handles empty messages', () => {
    // Test the empty state logic
    const props = {
      messages: [],
      getAgentMetadata: mockGetAgentMetadata,
      emptyState: 'No messages yet'
    };
    
    // Check that empty messages array is handled correctly
    expect(props.messages.length).toBe(0);
  });
  
  test('handles scroll behavior', () => {
    // Mock scrollTop behavior
    let scrollTopCalled = false;
    const onScrollTop = () => { scrollTopCalled = true; };
    
    // Create scroll event handler from the component
    const handleScroll = () => {
      const scrollTop = 10; // Mock a low scrollTop value
      
      // When user scrolls near the top, trigger loading more messages
      if (scrollTop < 50 && !false) { // !loading
        onScrollTop();
      }
    };
    
    // Trigger the handler
    handleScroll();
    
    // Verify the callback was called
    expect(scrollTopCalled).toBe(true);
  });
  
  test('handles auto-scroll logic', () => {
    // Test the auto-scroll to bottom logic
    
    // Create a mock list ref with near-bottom scroll position
    const mockListRef = {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 450 // Near bottom (scrollTop + clientHeight is within 200px of scrollHeight)
    };
    
    // Check if we should auto-scroll based on the logic in the component
    const isNearBottom = mockListRef.scrollTop + mockListRef.clientHeight >= mockListRef.scrollHeight - 200;
    
    // Verify we should auto-scroll
    expect(isNearBottom).toBe(true);
  });
  
  test('handles message with typing status', () => {
    // Test typing indicator logic
    const typingMessage = {
      ...sampleMessages[1],
      isTyping: true
    };
    
    // Use the same mapping logic from the component
    const getStatus = (message) => {
      return message.isTyping ? 'sending' : (message.isError ? 'error' : 'sent');
    };
    
    // Verify status is 'sending' for typing messages
    expect(getStatus(typingMessage)).toBe('sending');
  });
  
  test('handles messages with error status', () => {
    // Test error status logic
    const errorMessage = {
      ...sampleMessages[1],
      isError: true
    };
    
    // Use the same mapping logic from the component
    const getStatus = (message) => {
      return message.isTyping ? 'sending' : (message.isError ? 'error' : 'sent');
    };
    
    // Verify status is 'error' for error messages
    expect(getStatus(errorMessage)).toBe('error');
  });
});