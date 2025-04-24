export interface MessageProcessorOptions {
  highlightMentions?: boolean;
  agentColors?: Record<string, string>;
  preserveWhitespace?: boolean;
  escapeHtml?: boolean;
}

export interface Block {
  type: 'text' | 'mention' | 'tool' | 'code';
  content?: string;
  agentName?: string;
  color?: string;
  toolName?: string;
  result?: any;
  error?: {
    message: string;
    details?: any;
  };
  agentId?: string;
  language?: string;
}

/**
 * Process message content into blocks of text, mentions, tools, and code
 */
export function processMessage(
  content: string,
  options: MessageProcessorOptions = {}
): Block[] {
  const blocks: Block[] = [];
  let currentText = '';

  // Function to push accumulated text as a segment
  const pushTextBlock = () => {
    if (currentText) {
      blocks.push({
        type: 'text',
        content: currentText
      });
      currentText = '';
    }
  };

  // Split content into parts based on tool result blocks
  const parts = content.split(/```tool_result\n/);
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (i % 2 === 0) {
      // This is regular text content
      currentText += part;
    } else {
      // This is a tool result block
      try {
        // Push any accumulated text before processing the tool result
        pushTextBlock();

        // Find the end of the JSON block by looking for the last ```
        const endIndex = part.lastIndexOf('```');
        if (endIndex === -1) {
          currentText += part;
          continue;
        }

        // Get the content and check for streaming markers
        const rawContent = part.substring(0, endIndex).trim();
        
        // Check for streaming completion markers
        const streamingMatch = rawContent.match(/\[(\w+)\] Turn complete or interrupted\. StreamingId: ([\w-]+)/);
        if (streamingMatch) {
          // This is a streaming boundary marker, skip processing
          continue;
        }
        
        // Check for error format
        const errorMatch = rawContent.match(/<error>\s*([\s\S]*?)\s*<\/error>/);
        if (errorMatch) {
          // Extract error details
          const errorContent = errorMatch[1];
          let errorDetails;
          
          try {
            // Try to parse error details as JSON
            errorDetails = JSON.parse(errorContent);
          } catch {
            // If not JSON, use as plain text
            errorDetails = errorContent;
          }
          
          // Check if this is a streaming error
          const isStreamingError = errorContent.includes('StreamingId:');
          if (!isStreamingError) {
            blocks.push({
              type: 'tool',
              toolName: 'Error',
              error: {
                message: errorDetails.message || 'An error occurred',
                details: errorDetails
              }
            });
          }
          continue;
        }

        // If no streaming markers or errors, process as normal tool result
        // Remove any nested code blocks and streaming markers
        let jsonStr = rawContent
          .replace(/```[\s\S]*?```/g, '')
          .replace(/\[(\w+)\] Turn complete or interrupted\. StreamingId: [\w-]+/g, '')
          .trim();
        console.log('Raw tool result content:', jsonStr);
        
        try {
          // Clean up the JSON string before parsing
          let cleanJsonStr = jsonStr;
          
          try {
            // First try parsing as-is
            JSON.parse(cleanJsonStr);
          } catch (e) {
            // If parsing fails, apply cleaning steps
            cleanJsonStr = jsonStr
              // Fix potential single quotes, but preserve escaped quotes
              .replace(/(?<!\\)'/g, '"')
              // Fix potential unquoted property names
              .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
              // Remove any trailing commas in objects/arrays
              .replace(/,(\s*[}\]])/g, '$1')
              // Fix any remaining invalid JSON structure
              .replace(/:\s*'([^']*)'(?=\s*[,}])/g, ':"$1"') // Fix string values
              .replace(/:\s*"([^"]*)"(?=\s*[,}])/g, ':"$1"') // Normalize string values
              .replace(/([{,]\s*)(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '$1"$3":'); // Fix all property names
          }
            
          console.log('Cleaned JSON string:', cleanJsonStr);
          
          const toolResult = JSON.parse(cleanJsonStr);
          
          // Check for error state first
          if (toolResult.error) {
            blocks.push({
              type: 'tool',
              toolName: toolResult.toolName || 'unknown',
              error: {
                message: toolResult.error.message || 'Unknown error',
                details: toolResult.error.details || toolResult.error
              },
              agentId: toolResult.metadata?.agentId
            });
          }
          // Validate the required fields for success state
          else if (typeof toolResult === 'object' && toolResult !== null) {
            blocks.push({
              type: 'tool',
              toolName: toolResult.toolName || 'unknown',
              result: toolResult.result || toolResult,
              agentId: toolResult.metadata?.agentId
            });
          } else {
            // If not a valid tool result object, treat as text
            currentText += `\`\`\`tool_result\n${jsonStr}\`\`\``;
          }
        } catch (jsonError) {
          console.error('Error parsing tool result JSON:', jsonError);
          console.debug('Problematic JSON string:', jsonStr);
          // If JSON parsing fails, include the content as text
          currentText += `\`\`\`tool_result\n${jsonStr}\`\`\``;
        }

        // Add any text that comes after the tool result block
        currentText += part.substring(endIndex + 3);
      } catch (error) {
        console.error('Error processing tool result:', error);
        currentText += part;
      }
    }
  }

  // Push any remaining text
  pushTextBlock();

  // Process mentions in text blocks
  return blocks.map(block => {
    if (block.type === 'text' && options.highlightMentions) {
      const mentionRegex = /@(\w+)\b/g;
      let lastIndex = 0;
      const textBlocks: Block[] = [];
      let match;

      while ((match = mentionRegex.exec(block.content!)) !== null) {
        // Add text before the mention
        if (match.index > lastIndex) {
          textBlocks.push({
            type: 'text',
            content: block.content!.substring(lastIndex, match.index)
          });
        }

        // Add the mention
        const agentName = match[1];
        textBlocks.push({
          type: 'mention',
          content: `@${agentName}`,
          agentName,
          color: options.agentColors?.[agentName]
        });

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text after last mention
      if (lastIndex < block.content!.length) {
        textBlocks.push({
          type: 'text',
          content: block.content!.substring(lastIndex)
        });
      }

      return textBlocks;
    }
    return [block];
  }).flat();
}

export function formatMessageWithMentions(
  content: string,
  mentions: string[],
  options: MessageProcessorOptions = {}
): string {
  const { highlightMentions = true, agentColors = {}, preserveWhitespace = false } = options;

  let formattedContent = content;

  // Highlight mentions with agent colors
  if (highlightMentions && mentions.length > 0) {
    mentions.forEach(mention => {
      const color = agentColors[mention] || 'var(--agent-primary)';
      const regex = new RegExp(`@${mention}\\b`, 'g');
      formattedContent = formattedContent.replace(
        regex,
        `<span class="mention" style="color: ${color}">@${mention}</span>`
      );
    });
  }

  // Preserve whitespace if requested
  if (preserveWhitespace) {
    formattedContent = formattedContent.replace(/\n/g, '<br>');
  }

  return formattedContent;
}

// Export a default object that includes all exports
export default {
  processMessage,
  formatMessageWithMentions
};
