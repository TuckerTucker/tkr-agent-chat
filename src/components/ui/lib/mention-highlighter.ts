export interface MentionMatch {
  startIndex: number;
  endIndex: number;
  name: string;
  isPartial: boolean;
}

export interface MentionSegment {
  type: 'text' | 'mention' | 'invalid-mention';
  text: string;
}

export interface MarkdownFeatures {
  bold: boolean;
  italic: boolean;
  code: boolean;
  mentions: boolean;
}

export function findMentionAtCursor(text: string, cursorPosition: number): MentionMatch | null {
  const mentionRegex = /@(\w*)/g;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const name = match[1];

    if (cursorPosition >= startIndex && cursorPosition <= endIndex) {
      return {
        startIndex,
        endIndex,
        name,
        isPartial: cursorPosition === endIndex
      };
    }
  }

  return null;
}

export function getAgentSuggestions(query: string, availableAgents: string[], limit = 5): string[] {
  const normalizedQuery = query.toLowerCase();
  return availableAgents
    .filter(agent => agent.toLowerCase().includes(normalizedQuery))
    .slice(0, limit);
}

export function replaceMention(text: string, startIndex: number, endIndex: number, replacement: string): string {
  return text.substring(0, startIndex) + replacement + text.substring(endIndex);
}

export function highlightMentions(text: string, availableAgents: string[]): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        text: text.substring(lastIndex, match.index)
      });
    }

    // Add mention
    const mentionName = match[1];
    segments.push({
      type: availableAgents.includes(mentionName) ? 'mention' : 'invalid-mention',
      text: match[0]
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      text: text.substring(lastIndex)
    });
  }

  return segments;
}

export function detectMarkdown(text: string): MarkdownFeatures {
  return {
    bold: /\*\*[^*]+\*\*/.test(text),
    italic: /(?<!\*)\*[^*]+\*(?!\*)/.test(text),
    code: /`[^`]+`/.test(text),
    mentions: /@\w+/.test(text)
  };
}
