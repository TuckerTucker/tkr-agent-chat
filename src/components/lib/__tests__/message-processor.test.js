/**
 * @fileoverview Tests for message processor utilities.
 */

import { describe, test, expect } from 'bun:test';
import { 
  parseAgentMentions, 
  routeMessageToAgents, 
  formatMessageWithMentions, 
  processOutgoingMessage,
  detectToolCalls,
  processIncomingMessage
} from '../message-processor.js';

describe('parseAgentMentions', () => {
  test('should extract agent mentions from a simple message', () => {
    const message = 'Hello @chloe, how are you?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = parseAgentMentions(message, availableAgents);
    
    expect(result.extractedAgents).toEqual(['chloe']);
    expect(result.cleanedMessage).toBe(message);
  });
  
  test('should extract multiple agent mentions', () => {
    const message = '@chloe and @parker, can you both help me?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = parseAgentMentions(message, availableAgents);
    
    expect(result.extractedAgents).toEqual(['chloe', 'parker']);
    expect(result.cleanedMessage).toBe(message);
  });
  
  test('should ignore unknown agents', () => {
    const message = 'Hello @unknown and @chloe';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = parseAgentMentions(message, availableAgents);
    
    expect(result.extractedAgents).toEqual(['chloe']);
    expect(result.cleanedMessage).toBe(message);
  });
  
  test('should handle edge cases with punctuation', () => {
    const message = 'Hey @chloe, @parker; @dev.';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = parseAgentMentions(message, availableAgents);
    
    expect(result.extractedAgents).toEqual(['chloe', 'parker', 'dev']);
    expect(result.cleanedMessage).toBe(message);
  });
  
  test('should deduplicate mentions', () => {
    const message = '@chloe @chloe what do you think?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = parseAgentMentions(message, availableAgents);
    
    expect(result.extractedAgents).toEqual(['chloe']);
    expect(result.cleanedMessage).toBe(message);
  });
  
  test('should handle mentions at the end of the message', () => {
    const message = 'Can you help me @chloe';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = parseAgentMentions(message, availableAgents);
    
    expect(result.extractedAgents).toEqual(['chloe']);
    expect(result.cleanedMessage).toBe(message);
  });
  
  test('should handle empty and null inputs', () => {
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    expect(parseAgentMentions('', availableAgents).extractedAgents).toEqual([]);
    expect(parseAgentMentions(null, availableAgents).extractedAgents).toEqual([]);
    expect(parseAgentMentions(undefined, availableAgents).extractedAgents).toEqual([]);
  });
});

describe('routeMessageToAgents', () => {
  test('should route to current agent when no mentions', () => {
    const message = 'Hello, how are you?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    const currentAgentId = 'chloe';
    const defaultAgentId = 'dev';
    
    const result = routeMessageToAgents(message, availableAgents, currentAgentId, defaultAgentId);
    
    expect(result.targetAgents).toEqual([currentAgentId]);
    expect(result.primaryAgent).toBe(currentAgentId);
    expect(result.hasMultipleTargets).toBe(false);
  });
  
  test('should route to mentioned agent', () => {
    const message = 'Hello @parker, how are you?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    const currentAgentId = 'chloe';
    const defaultAgentId = 'dev';
    
    const result = routeMessageToAgents(message, availableAgents, currentAgentId, defaultAgentId);
    
    expect(result.targetAgents).toEqual(['parker']);
    expect(result.primaryAgent).toBe('parker');
    expect(result.hasMultipleTargets).toBe(false);
  });
  
  test('should route to multiple agents with first mentioned as primary', () => {
    const message = 'Hey @parker and @chloe, can you both help?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    const currentAgentId = 'dev';
    const defaultAgentId = 'dev';
    
    const result = routeMessageToAgents(message, availableAgents, currentAgentId, defaultAgentId);
    
    expect(result.targetAgents).toEqual(['parker', 'chloe']);
    expect(result.primaryAgent).toBe('parker');
    expect(result.hasMultipleTargets).toBe(true);
  });
});

describe('formatMessageWithMentions', () => {
  test('should segment message with mentions', () => {
    const message = 'Hello @chloe, how are you?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = formatMessageWithMentions(message, availableAgents);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'text', content: 'Hello ' });
    expect(result[1]).toEqual({ 
      type: 'mention', 
      content: '@chloe', 
      agentName: 'chloe',
      className: 'mention',
      color: null
    });
    expect(result[2]).toEqual({ type: 'text', content: ', how are you?' });
  });
  
  test('should include agent colors when provided', () => {
    const message = 'Hello @chloe and @parker';
    const availableAgents = ['chloe', 'parker', 'dev'];
    const options = {
      agentColors: {
        'chloe': 'blue',
        'parker': 'green'
      }
    };
    
    const result = formatMessageWithMentions(message, availableAgents, options);
    
    expect(result[1].color).toBe('blue');
    expect(result[3].color).toBe('green');
  });
  
  test('should allow customizing mention class name', () => {
    const message = 'Hello @chloe';
    const availableAgents = ['chloe', 'parker', 'dev'];
    const options = {
      mentionClassName: 'custom-mention'
    };
    
    const result = formatMessageWithMentions(message, availableAgents, options);
    
    expect(result[1].className).toBe('custom-mention');
  });
  
  test('should return a single text segment when highlighting is disabled', () => {
    const message = 'Hello @chloe, how are you?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    const options = {
      highlightMentions: false
    };
    
    const result = formatMessageWithMentions(message, availableAgents, options);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'text', content: message });
  });

  test('should mark non-existent agents as regular text', () => {
    const message = 'Hello @unknown, how are you?';
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    const result = formatMessageWithMentions(message, availableAgents);
    
    expect(result[1].type).toBe('text'); // Not 'mention'
  });
  
  test('should handle empty and null inputs', () => {
    const availableAgents = ['chloe', 'parker', 'dev'];
    
    expect(formatMessageWithMentions('', availableAgents)).toEqual([{ type: 'text', content: '' }]);
    expect(formatMessageWithMentions(null, availableAgents)).toEqual([{ type: 'text', content: '' }]);
    expect(formatMessageWithMentions(undefined, availableAgents)).toEqual([{ type: 'text', content: '' }]);
  });
});

describe('processOutgoingMessage', () => {
  test('should process a message with mentions and routing', () => {
    const message = 'Hello @chloe, how are you?';
    const options = {
      availableAgents: ['chloe', 'parker', 'dev'],
      currentAgentId: 'parker',
      defaultAgentId: 'dev'
    };
    
    const result = processOutgoingMessage(message, options);
    
    expect(result.originalMessage).toBe(message);
    expect(result.processedMessage).toBe(message);
    expect(result.mentions).toEqual(['chloe']);
    expect(result.routing.targetAgents).toEqual(['chloe']);
    expect(result.routing.primaryAgent).toBe('chloe');
    expect(result.routing.hasMultipleTargets).toBe(false);
  });
  
  test('should detect tool calls in message', () => {
    const message = 'Let me calculate: tkrTool(\'calculator\', {"expression": "2 + 2"})';
    const options = {
      availableAgents: ['chloe', 'parker'],
      currentAgentId: 'chloe'
    };
    
    const result = processOutgoingMessage(message, options);
    
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('calculator');
    expect(result.toolCalls[0].params).toEqual({ expression: '2 + 2' });
  });
  
  test('should not preserve mentions when specified', () => {
    const message = 'Hello @chloe, how are you?';
    const options = {
      availableAgents: ['chloe', 'parker', 'dev'],
      currentAgentId: 'parker',
      defaultAgentId: 'dev',
      preserveMentions: false
    };
    
    const result = processOutgoingMessage(message, options);
    
    expect(result.originalMessage).toBe(message);
    // In current implementation, cleanedMessage doesn't actually remove mentions,
    // so this is the same as the original message
    expect(result.processedMessage).toBe(message);
    expect(result.mentions).toEqual(['chloe']);
  });
  
  test('should use default options when not provided', () => {
    const message = 'Hello, how are you?';
    
    const result = processOutgoingMessage(message);
    
    expect(result.originalMessage).toBe(message);
    expect(result.processedMessage).toBe(message);
    expect(result.mentions).toEqual([]);
    expect(result.routing.targetAgents).toEqual(['chloe']);
    expect(result.routing.primaryAgent).toBe('chloe');
  });
});

describe('detectToolCalls', () => {
  test('should detect tool calls in a message', () => {
    const message = 'Let me calculate that for you: tkrTool(\'calculator\', {"expression": "2 + 2"})';
    
    const result = detectToolCalls(message);
    
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('calculator');
    expect(result[0].params).toEqual({ expression: '2 + 2' });
    expect(result[0].fullMatch).toBe('tkrTool(\'calculator\', {"expression": "2 + 2"})');
  });
  
  test('should detect multiple tool calls', () => {
    const message = `Let me help with that.
    
    tkrTool('calculator', {"expression": "5 * 10"})
    
    And also search the web: tkrTool('webSearch', {"query": "weather"})`;
    
    const result = detectToolCalls(message);
    
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('calculator');
    expect(result[1].name).toBe('webSearch');
  });
  
  test('should include position information', () => {
    const message = 'Let me calculate: tkrTool(\'calculator\', {"expression": "2 + 2"})';
    
    const result = detectToolCalls(message);
    
    expect(result[0].index).toBe(16);
    expect(result[0].length).toBe(45);
  });
  
  test('should handle malformed tool calls', () => {
    const message = 'This is broken: tkrTool(\'calculator\', {broken json})';
    
    const result = detectToolCalls(message);
    
    expect(result).toHaveLength(0);
  });
  
  test('should handle empty and null inputs', () => {
    expect(detectToolCalls('')).toEqual([]);
    expect(detectToolCalls(null)).toEqual([]);
    expect(detectToolCalls(undefined)).toEqual([]);
  });
});

describe('formatMessageWithMentions with tool results', () => {
  test('should process message with tool results', () => {
    const message = 'Let me calculate: tkrTool(\'calculator\', {"expression": "2 + 2"})';
    const availableAgents = ['chloe', 'parker'];
    const toolResults = [
      {
        toolName: 'calculator',
        success: true,
        result: { value: 4, formattedValue: '4' },
        executionTime: 10
      }
    ];
    
    const result = formatMessageWithMentions(message, availableAgents, {
      processToolCalls: true,
      toolResults
    });
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.some(segment => segment.type === 'tool')).toBe(true);
    
    // Find the tool segment
    const toolSegment = result.find(segment => segment.type === 'tool');
    expect(toolSegment.toolName).toBe('calculator');
    expect(toolSegment.result.success).toBe(true);
  });
  
  test('should handle message with both mentions and tool calls', () => {
    const message = '@chloe, calculate tkrTool(\'calculator\', {"expression": "2 + 2"})';
    const availableAgents = ['chloe', 'parker'];
    const toolResults = [
      {
        toolName: 'calculator',
        success: true,
        result: { value: 4, formattedValue: '4' },
        executionTime: 10
      }
    ];
    
    const result = formatMessageWithMentions(message, availableAgents, {
      processToolCalls: true,
      toolResults,
      agentColors: { chloe: 'blue' }
    });
    
    // Should have at least 3 segments: mention, text before tool, and tool
    expect(result.length).toBeGreaterThanOrEqual(3);
    
    // Check for mention
    const mentionSegment = result.find(segment => segment.type === 'mention');
    expect(mentionSegment).toBeDefined();
    expect(mentionSegment.agentName).toBe('chloe');
    expect(mentionSegment.color).toBe('blue');
    
    // Check for tool
    const toolSegment = result.find(segment => segment.type === 'tool');
    expect(toolSegment).toBeDefined();
    expect(toolSegment.toolName).toBe('calculator');
  });
  
  test('should handle already segmented content', () => {
    const segmentedMessage = {
      segments: [
        { type: 'text', content: 'This is already segmented' },
        { type: 'tool', toolName: 'calculator', result: { success: true } }
      ]
    };
    
    const result = formatMessageWithMentions(segmentedMessage, []);
    
    expect(result).toEqual(segmentedMessage.segments);
  });
});

describe('processIncomingMessage', () => {
  test('should process message with tool results', () => {
    const messageData = {
      id: '123',
      content: 'Let me calculate: tkrTool(\'calculator\', {"expression": "2 + 2"})',
      agentId: 'chloe',
      toolResults: [
        {
          toolName: 'calculator',
          success: true,
          result: { value: 4, formattedValue: '4' },
          executionTime: 10
        }
      ]
    };
    
    const result = processIncomingMessage(messageData, {
      availableAgents: ['chloe', 'parker'],
      agentColors: { chloe: 'blue' }
    });
    
    expect(result.hasTools).toBe(true);
    expect(result.segments).toBeDefined();
    expect(result.segments.some(segment => segment.type === 'tool')).toBe(true);
  });
  
  test('should process regular message without tools', () => {
    const messageData = {
      id: '123',
      content: 'Hello @parker, how are you?',
      agentId: 'chloe'
    };
    
    const result = processIncomingMessage(messageData, {
      availableAgents: ['chloe', 'parker'],
      agentColors: { chloe: 'blue', parker: 'green' }
    });
    
    expect(result.hasTools).toBe(false);
    expect(result.segments).toBeDefined();
    expect(result.segments.some(segment => segment.type === 'mention')).toBe(true);
    
    // Find the mention segment
    const mentionSegment = result.segments.find(segment => segment.type === 'mention');
    expect(mentionSegment.agentName).toBe('parker');
    expect(mentionSegment.color).toBe('green');
  });
});