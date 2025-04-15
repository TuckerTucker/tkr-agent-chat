/**
 * @fileoverview Message processing utilities for the UI layer
 * 
 * This module provides utilities for processing messages in the UI layer,
 * including @mention parsing, message routing, tool call detection, and
 * message formatting for display.
 */

/**
 * Parse message for @mentions and extract agent mentions from a message
 * Handles various formatting and edge cases
 * 
 * @param {string} message - The message text to parse
 * @param {Array<string>} availableAgents - List of available agent display names
 * @returns {object} - Object with extractedAgents array and cleanedMessage
 */
export function parseAgentMentions(message, availableAgents) {
  if (!message || typeof message !== 'string') {
    return { extractedAgents: [], cleanedMessage: message || '' };
  }

  // Enhanced regex to handle edge cases like punctuation, spaces, etc.
  // Looks for @agentname with optional punctuation or space before/after
  const mentionRegex = /@([a-z0-9_-]+)(?=[\s,.!?;:]|$)/gi;
  
  const extractedAgents = [];
  const mentionMatches = [...message.matchAll(mentionRegex)];
  
  // Extract all valid agent mentions
  mentionMatches.forEach(match => {
    const potentialAgent = match[1].toLowerCase();
    if (availableAgents.includes(potentialAgent)) {
      extractedAgents.push(potentialAgent);
    }
  });

  // Remove duplicates while preserving order
  const uniqueAgents = [...new Set(extractedAgents)];
  
  // For now, return the original message
  // In a more advanced implementation, we might want to clean/format @mentions
  const cleanedMessage = message;
  
  return { 
    extractedAgents: uniqueAgents,
    cleanedMessage
  };
}

/**
 * Determine which agent should respond to a message
 * Takes into account @mentions and conversation context
 * 
 * @param {string} message - The message text
 * @param {Array<string>} availableAgents - List of available agent display names
 * @param {string} currentAgentId - Current active agent ID
 * @param {string} defaultAgentId - Default agent ID
 * @returns {Object} Routing information with targetAgents and primaryAgent
 */
export function routeMessageToAgents(message, availableAgents, currentAgentId, defaultAgentId) {
  // Parse message for @mentions
  const { extractedAgents } = parseAgentMentions(message, availableAgents);
  
  // If no agents mentioned, route to current agent
  if (extractedAgents.length === 0) {
    return {
      targetAgents: [currentAgentId],
      primaryAgent: currentAgentId,
      hasMultipleTargets: false
    };
  }
  
  // Use first mentioned agent as primary, others as secondary
  const primaryAgent = extractedAgents[0];
  
  return {
    targetAgents: extractedAgents,
    primaryAgent,
    hasMultipleTargets: extractedAgents.length > 1
  };
}

/**
 * Regular expression for detecting tool calls in a message
 * Matches tkrTool('toolName', {params}) syntax
 */
const TOOL_CALL_REGEX = /tkrTool\(['"](.+?)['"],\s*({[\s\S]*?})\)/g;

/**
 * Detect tool calls in a message
 * @param {string} message - The message text to parse
 * @returns {Array} - Array of tool call objects with name, params, and fullMatch
 */
export function detectToolCalls(message) {
  if (!message || typeof message !== 'string') {
    return [];
  }

  const toolCalls = [];
  let match;

  // Find all tool calls
  while ((match = TOOL_CALL_REGEX.exec(message)) !== null) {
    try {
      const name = match[1];
      const paramsString = match[2];
      const params = JSON.parse(paramsString);

      toolCalls.push({
        name,
        params,
        fullMatch: match[0],
        index: match.index,
        length: match[0].length
      });
    } catch (error) {
      console.error('Error parsing tool call:', error);
    }
  }

  return toolCalls;
}

/**
 * Format @mentions and tool results in message text for display
 * Highlights mentions, adds styling, processes tool results
 * 
 * @param {string|Object} message - Original message text or message object with segments
 * @param {Array<string>} availableAgents - List of available agent display names
 * @param {Object} options - Formatting options
 * @returns {Array} Formatted message segments with styled @mentions and tool outputs
 */
export function formatMessageWithMentions(message, availableAgents, options = {}) {
  // Handle pre-segmented message (from tool-manager.processMessage)
  if (message && typeof message === 'object' && message.segments) {
    return message.segments;
  }
  
  if (!message || typeof message !== 'string') {
    return [{ type: 'text', content: message || '' }];
  }
  
  const {
    highlightMentions = true,
    mentionClassName = 'mention',
    processToolCalls = true,
    toolResults = [],
    agentColors = {} // map of agent name to color
  } = options;
  
  if (!highlightMentions && !processToolCalls) {
    return [{ type: 'text', content: message }];
  }
  
  const segments = [];
  let lastIndex = 0;
  
  // If we need to process tool calls and have results, add them to segments
  if (processToolCalls && toolResults && toolResults.length > 0) {
    // Get all tool calls in the message
    const toolCalls = detectToolCalls(message);
    
    // Sort tool calls by their position in the message (ascending)
    const sortedCalls = [...toolCalls].sort((a, b) => a.index - b.index);
    
    // Map tool results to tool calls by name (assuming name is unique per message)
    const resultMap = new Map();
    toolResults.forEach(result => {
      if (result && result.toolName) {
        resultMap.set(result.toolName, result);
      }
    });
    
    // Process message with tool calls
    for (const call of sortedCalls) {
      const { name, index, length } = call;
      const result = resultMap.get(name);
      
      // Add text before the tool call
      if (index > lastIndex) {
        const textBeforeCall = message.substring(lastIndex, index);
        
        // Process this text for @mentions
        if (highlightMentions) {
          const mentionSegments = processMentionsInText(
            textBeforeCall, 
            availableAgents, 
            { mentionClassName, agentColors }
          );
          segments.push(...mentionSegments);
        } else {
          segments.push({
            type: 'text',
            content: textBeforeCall
          });
        }
      }
      
      // Add the tool result (if we have a match)
      if (result) {
        segments.push({
          type: 'tool',
          toolName: name,
          result,
          original: call.fullMatch
        });
      } else {
        // If no result, just add the tool call as text
        segments.push({
          type: 'text',
          content: call.fullMatch
        });
      }
      
      lastIndex = index + length;
    }
    
    // Add any remaining text after the last tool call
    if (lastIndex < message.length) {
      const textAfterLastCall = message.substring(lastIndex);
      
      // Process this text for @mentions
      if (highlightMentions) {
        const mentionSegments = processMentionsInText(
          textAfterLastCall, 
          availableAgents, 
          { mentionClassName, agentColors }
        );
        segments.push(...mentionSegments);
      } else {
        segments.push({
          type: 'text',
          content: textAfterLastCall
        });
      }
    }
  } else if (highlightMentions) {
    // Just process mentions if we don't need to handle tool calls
    const mentionSegments = processMentionsInText(
      message, 
      availableAgents, 
      { mentionClassName, agentColors }
    );
    segments.push(...mentionSegments);
  } else {
    // If neither mentions nor tool calls need processing
    segments.push({
      type: 'text',
      content: message
    });
  }
  
  return segments;
}

/**
 * Process text for @mentions
 * Helper function for formatMessageWithMentions
 * 
 * @param {string} text - The text to process
 * @param {Array<string>} availableAgents - List of available agent display names
 * @param {Object} options - Formatting options
 * @returns {Array} Array of segments with mentions processed
 */
function processMentionsInText(text, availableAgents, options = {}) {
  if (!text) return [];
  
  const {
    mentionClassName = 'mention',
    agentColors = {}
  } = options;
  
  // Enhanced regex to handle edge cases like punctuation, spaces, etc.
  const mentionRegex = /@([a-z0-9_-]+)(?=[\s,.!?;:]|$)/gi;
  
  const segments = [];
  let lastIndex = 0;
  let match;
  
  // Find all @mentions
  while ((match = mentionRegex.exec(text)) !== null) {
    const matchedText = match[0];
    const agentName = match[1].toLowerCase();
    const startIndex = match.index;
    const endIndex = startIndex + matchedText.length;
    
    // Add text before the mention
    if (startIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex, startIndex)
      });
    }
    
    // Determine if this is a valid agent mention
    const isValidAgent = availableAgents.includes(agentName);
    
    // Add the mention segment
    segments.push({
      type: isValidAgent ? 'mention' : 'text',
      content: matchedText,
      agentName: isValidAgent ? agentName : null,
      className: isValidAgent ? mentionClassName : null,
      color: isValidAgent && agentColors[agentName] ? agentColors[agentName] : null
    });
    
    lastIndex = endIndex;
  }
  
  // Add any remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }
  
  return segments;
}

/**
 * Process a message before sending it to an agent
 * Handle @mentions, format message, prepare for routing
 * 
 * @param {string} message - The original message text
 * @param {Object} options - Processing options including availableAgents
 * @returns {Object} Processed message with routing information
 */
export function processOutgoingMessage(message, options = {}) {
  const {
    availableAgents = [],
    currentAgentId = 'chloe',
    defaultAgentId = 'chloe',
    preserveMentions = true,
  } = options;
  
  // Parse message for @mentions
  const { extractedAgents, cleanedMessage } = parseAgentMentions(message, availableAgents);
  
  // Determine routing
  const routing = routeMessageToAgents(message, availableAgents, currentAgentId, defaultAgentId);
  
  // Detect any tool calls
  const toolCalls = detectToolCalls(message);
  
  // Format final message - optionally remove @mentions
  const finalMessage = preserveMentions ? message : cleanedMessage;
  
  return {
    originalMessage: message,
    processedMessage: finalMessage,
    mentions: extractedAgents,
    toolCalls,
    routing
  };
}

/**
 * Process an incoming message from an agent for display
 * Handle tool results, @mentions, and formatting
 * 
 * @param {Object} messageData - The message data from the agent
 * @param {Object} options - Processing options
 * @returns {Object} Processed message with segments for display
 */
export function processIncomingMessage(messageData, options = {}) {
  const {
    availableAgents = [],
    agentColors = {}
  } = options;
  
  // Check if the message includes tool results
  if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
    // Process message with tool results included
    const segments = formatMessageWithMentions(
      messageData.content, 
      availableAgents, 
      {
        highlightMentions: true,
        processToolCalls: true,
        toolResults: messageData.toolResults,
        agentColors
      }
    );
    
    return {
      ...messageData,
      segments,
      hasTools: true
    };
  }
  
  // Regular message without tools
  const segments = formatMessageWithMentions(
    messageData.content,
    availableAgents,
    { agentColors }
  );
  
  return {
    ...messageData,
    segments,
    hasTools: false
  };
}