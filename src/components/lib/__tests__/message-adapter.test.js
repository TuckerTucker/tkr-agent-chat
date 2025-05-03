/**
 * @jest-environment jsdom
 */

import { 
  normalizeMessage, 
  legacyToStandard, 
  standardToLegacy, 
  isStandardFormat,
  isLegacyFormat,
  createUserTextMessage,
  createAgentTextMessage
} from '../message-adapter';

import { MessageType } from '../../../types/messages';

describe('Message Format Adapters', () => {
  describe('Format Detection', () => {
    test('should detect legacy format messages', () => {
      const legacyMessage = {
        id: 'msg123',
        sessionId: 'session456',
        type: 'text',
        text: 'Hello world',
        fromUser: true,
        toAgent: 'chloe'
      };
      
      expect(isLegacyFormat(legacyMessage)).toBe(true);
      expect(isStandardFormat(legacyMessage)).toBe(false);
    });
    
    test('should detect standardized format messages', () => {
      const standardMessage = {
        id: 'msg123',
        session_id: 'session456',
        type: MessageType.TEXT,
        content: 'Hello world',
        from_user: true,
        to_agent: 'chloe'
      };
      
      expect(isStandardFormat(standardMessage)).toBe(true);
      expect(isLegacyFormat(standardMessage)).toBe(false);
    });
    
    test('should handle ambiguous or invalid messages', () => {
      const ambiguousMessage = {
        id: 'msg123',
        text: 'Hello world'
      };
      
      expect(isStandardFormat(ambiguousMessage)).toBe(false);
      expect(isLegacyFormat(ambiguousMessage)).toBe(false);
    });
  });
  
  describe('Format Conversion', () => {
    test('should convert legacy to standard format', () => {
      const legacyMessage = {
        id: 'msg123',
        sessionId: 'session456',
        type: 'text',
        text: 'Hello world',
        fromUser: true,
        toAgent: 'chloe',
        timestamp: '2023-05-01T12:00:00Z'
      };
      
      const standardMessage = legacyToStandard(legacyMessage);
      
      expect(standardMessage.id).toBe('msg123');
      expect(standardMessage.session_id).toBe('session456');
      expect(standardMessage.type).toBe('text');
      expect(standardMessage.content).toBe('Hello world');
      expect(standardMessage.from_user).toBe(true);
      expect(standardMessage.to_agent).toBe('chloe');
      expect(standardMessage.timestamp).toBe('2023-05-01T12:00:00Z');
    });
    
    test('should convert standard to legacy format', () => {
      const standardMessage = {
        id: 'msg123',
        session_id: 'session456',
        type: MessageType.TEXT,
        content: 'Hello world',
        from_user: true,
        to_agent: 'chloe',
        timestamp: '2023-05-01T12:00:00Z'
      };
      
      const legacyMessage = standardToLegacy(standardMessage);
      
      expect(legacyMessage.id).toBe('msg123');
      expect(legacyMessage.sessionId).toBe('session456');
      expect(legacyMessage.type).toBe(MessageType.TEXT);
      expect(legacyMessage.text).toBe('Hello world');
      expect(legacyMessage.content).toBe('Hello world');
      expect(legacyMessage.fromUser).toBe(true);
      expect(legacyMessage.toAgent).toBe('chloe');
      expect(legacyMessage.timestamp).toBe('2023-05-01T12:00:00Z');
    });
    
    test('should normalize ambiguous messages to standard format', () => {
      const ambiguousMessage = {
        id: 'msg123',
        text: 'Hello world'
      };
      
      const normalizedMessage = normalizeMessage(ambiguousMessage);
      
      expect(normalizedMessage.id).toBe('msg123');
      expect(normalizedMessage.content).toBe('Hello world');
      expect(normalizedMessage.session_id).toBeDefined();
      expect(normalizedMessage.type).toBeDefined();
      expect(normalizedMessage.timestamp).toBeDefined();
    });
    
    test('should handle type conversion between formats', () => {
      const legacyContextMessage = {
        id: 'ctx123',
        sessionId: 'session456',
        type: 'context_update',
        contextId: 'ctx1',
        contextData: { key: 'value' },
        fromAgent: 'chloe',
        targetAgents: ['phil']
      };
      
      const standardized = legacyToStandard(legacyContextMessage);
      expect(standardized.type).toBe('context_update');
      expect(standardized.context_id).toBe('ctx1');
      expect(standardized.context_data).toEqual({ key: 'value' });
      expect(standardized.from_agent).toBe('chloe');
      expect(standardized.target_agents).toEqual(['phil']);
      
      const backToLegacy = standardToLegacy(standardized);
      expect(backToLegacy.type).toBe('context_update');
      expect(backToLegacy.contextId).toBe('ctx1');
      expect(backToLegacy.contextData).toEqual({ key: 'value' });
      expect(backToLegacy.fromAgent).toBe('chloe');
      expect(backToLegacy.targetAgents).toEqual(['phil']);
    });
  });
  
  describe('Message Creation', () => {
    test('should create a user text message', () => {
      const userMessage = createUserTextMessage('Hello world', 'session123', 'chloe');
      
      expect(userMessage.id).toBeDefined();
      expect(userMessage.type).toBe(MessageType.TEXT);
      expect(userMessage.content).toBe('Hello world');
      expect(userMessage.session_id).toBe('session123');
      expect(userMessage.from_user).toBe(true);
      expect(userMessage.to_agent).toBe('chloe');
      expect(userMessage.timestamp).toBeDefined();
    });
    
    test('should create an agent text message', () => {
      const agentMessage = createAgentTextMessage(
        'Hello human', 
        'session123', 
        'chloe', 
        'msg123', 
        false
      );
      
      expect(agentMessage.id).toBeDefined();
      expect(agentMessage.type).toBe(MessageType.TEXT);
      expect(agentMessage.content).toBe('Hello human');
      expect(agentMessage.session_id).toBe('session123');
      expect(agentMessage.from_agent).toBe('chloe');
      expect(agentMessage.in_reply_to).toBe('msg123');
      expect(agentMessage.streaming).toBe(false);
      expect(agentMessage.turn_complete).toBe(true);
      expect(agentMessage.timestamp).toBeDefined();
    });
    
    test('should create a streaming agent message correctly', () => {
      const streamingMessage = createAgentTextMessage(
        'Partial response', 
        'session123', 
        'chloe', 
        'msg123', 
        true
      );
      
      expect(streamingMessage.streaming).toBe(true);
      expect(streamingMessage.turn_complete).toBe(false);
    });
  });
});