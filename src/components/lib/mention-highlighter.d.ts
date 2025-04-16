export interface MentionSegment {
  type: 'text' | 'mention' | 'invalid-mention';
  text: string;
}

export interface MentionMatch {
  startIndex: number;
  endIndex: number;
  name: string;
  isPartial: boolean;
}

export interface MarkdownFeatures {
  bold: boolean;
  italic: boolean;
  code: boolean;
  mentions: boolean;
}

export function findMentionAtCursor(text: string, cursorPosition: number): MentionMatch | null;
export function getAgentSuggestions(query: string, availableAgents: string[], limit?: number): string[];
export function replaceMention(text: string, startIndex: number, endIndex: number, replacement: string): string;
export function highlightMentions(text: string, availableAgents: string[]): MentionSegment[];
export function detectMarkdown(text: string): MarkdownFeatures;
