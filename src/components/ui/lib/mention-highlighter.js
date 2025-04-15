/**
 * @fileoverview Utilities for highlighting and processing @mentions in text
 * This module provides helper functions for highlighting and processing @mentions
 */

/**
 * Highlight @mentions in text
 * @param {string} text - Text containing @mentions
 * @param {Array<string>} availableAgents - List of available agent display names
 * @returns {Array} Array of segments with type and text properties
 */
export function highlightMentions(text, availableAgents) {
  if (!text || typeof text !== 'string') {
    return [{ type: 'text', text: text || '' }];
  }

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
        text: text.substring(lastIndex, startIndex)
      });
    }
    
    // Add the mention - mark as valid if agent exists
    const isValidAgent = availableAgents.includes(agentName);
    segments.push({
      type: isValidAgent ? 'mention' : 'invalid-mention',
      text: matchedText,
      agentName
    });
    
    lastIndex = endIndex;
  }
  
  // Add any remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      text: text.substring(lastIndex)
    });
  }
  
  return segments;
}

/**
 * Find the @mention at the current cursor position
 * @param {string} text - The input text
 * @param {number} cursorPosition - Current cursor position
 * @returns {Object|null} Object with mention details or null if no mention at cursor
 */
export function findMentionAtCursor(text, cursorPosition) {
  if (!text || typeof text !== 'string' || cursorPosition === undefined) {
    return null;
  }
  
  // Look for @mention at or before cursor position
  // This regex looks for @mentions that include the cursor position
  const mentionRegex = /@([a-z0-9_-]*)(?=[\s,.!?;:]|$)/gi;
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    
    // Check if cursor is within this mention
    if (cursorPosition >= startIndex && cursorPosition <= endIndex) {
      return {
        fullText: match[0],
        name: match[1].toLowerCase(),
        startIndex,
        endIndex,
        isPartial: match[1].length === 0 || cursorPosition < endIndex
      };
    }
  }
  
  return null;
}

/**
 * Get filtered agent suggestions based on partial input
 * @param {string} partialInput - Partial agent name (without @)
 * @param {Array<string>} availableAgents - List of available agent names
 * @param {number} maxResults - Maximum number of suggestions to return
 * @returns {Array<string>} Filtered list of agent suggestions
 */
export function getAgentSuggestions(partialInput, availableAgents, maxResults = 5) {
  if (!partialInput || !availableAgents || !Array.isArray(availableAgents)) {
    return [];
  }
  
  const normalizedInput = partialInput.toLowerCase();
  
  // Filter agents that start with or include the partial input
  const matchingAgents = availableAgents.filter(agent => 
    agent.toLowerCase().startsWith(normalizedInput) || 
    agent.toLowerCase().includes(normalizedInput)
  );
  
  // Sort by relevance: first those that start with the input, then those that contain it
  matchingAgents.sort((a, b) => {
    const aStartsWith = a.toLowerCase().startsWith(normalizedInput);
    const bStartsWith = b.toLowerCase().startsWith(normalizedInput);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return a.localeCompare(b);
  });
  
  // Limit results
  return matchingAgents.slice(0, maxResults);
}

/**
 * Replace a mention in text with a new value
 * @param {string} text - Original text
 * @param {number} startIndex - Start index of mention to replace
 * @param {number} endIndex - End index of mention to replace
 * @param {string} replacement - Replacement text (should include the @ symbol)
 * @returns {string} Updated text with replacement
 */
export function replaceMention(text, startIndex, endIndex, replacement) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }
  
  return (
    text.substring(0, startIndex) +
    replacement +
    text.substring(endIndex)
  );
}

/**
 * Detect markdown syntax in text
 * @param {string} text - Text to analyze
 * @returns {Object} Object with detected markdown features
 */
export function detectMarkdown(text) {
  if (!text || typeof text !== 'string') {
    return {
      hasBold: false,
      hasItalic: false,
      hasCode: false,
      hasLink: false,
      hasListItem: false,
      hasHeading: false
    };
  }
  
  return {
    hasBold: /\*\*[^*]+\*\*/.test(text) || /__[^_]+__/.test(text),
    hasItalic: /\*[^*]+\*/.test(text) || /_[^_]+_/.test(text),
    hasCode: /`[^`]+`/.test(text) || /```[\s\S]*?```/.test(text),
    hasLink: /\[.+\]\(.+\)/.test(text),
    hasListItem: /^[\s]*[-*+][\s]+/.test(text) || /^[\s]*\d+\.[\s]+/.test(text),
    hasHeading: /^[\s]*#{1,6}[\s]+/.test(text)
  };
}