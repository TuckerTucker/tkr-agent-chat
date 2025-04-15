import { ReactNode } from 'react';

export interface MarkdownRendererProps {
  content: string | string[] | { toString(): string };
  className?: string;
  agentColors?: Record<string, string>;
  preserveWhitespace?: boolean;
  escapeHtml?: boolean;
  children?: ReactNode;
}

export function MarkdownRenderer(props: MarkdownRendererProps): React.ReactElement;
