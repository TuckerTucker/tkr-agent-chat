import { ReactNode } from 'react';

interface MessageMetadata {
  type: 'a2a';
  targetAgent: string;
  taskId?: string | null;
}

export interface ChatInputProps {
  onSend: (message: string, agentId: string, metadata?: MessageMetadata) => Promise<void>;
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
