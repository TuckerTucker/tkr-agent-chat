export interface MessageProcessorOptions {
  highlightMentions?: boolean;
  agentColors?: Record<string, string>;
  preserveWhitespace?: boolean;
  escapeHtml?: boolean;
}

export function formatMessageWithMentions(
  content: string,
  mentions: string[],
  options?: MessageProcessorOptions
): string;
