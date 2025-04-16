import { ReactNode } from 'react';

export interface MentionSuggestionProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  activeIndex: number;
  position: {
    top: number;
    left: number;
  };
  agents: Record<string, any>;
  className?: string;
  children?: ReactNode;
}

export const MentionSuggestion: React.ForwardRefExoticComponent<MentionSuggestionProps & React.RefAttributes<HTMLDivElement>>;
