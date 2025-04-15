import { ReactNode } from 'react';

export interface ChatInputProps {
  onSend: (message: string, agentId: string) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  allowMarkdown?: boolean;
  availableAgents?: string[];
  agentMetadata?: Record<string, any>;
  currentAgentId?: string;
  className?: string;
  children?: ReactNode;
}
