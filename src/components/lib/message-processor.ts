export interface MessageProcessorOptions {
  highlightMentions?: boolean;
  agentColors?: Record<string, string>;
  preserveWhitespace?: boolean;
  escapeHtml?: boolean;
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
