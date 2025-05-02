import { ReactNode } from 'react';

export interface MessageMention {
  agentName: string;
  color: string;
}

export interface MessageMetadata {
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  agentAccentColor?: string;
  agentSecondary?: string;
  avatar?: string | null;
  isPrimary?: boolean;
  mentions?: MessageMention[];
  hasMentions?: boolean;
  formattedContent?: string;
  deliveryStatus?: string;
  [key: string]: any;
}

export interface APIMessage {
  id?: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  agentId?: string;
  agentName?: string;
  mentions?: string[];
  metadata?: MessageMetadata;
  timestamp?: string | number;
  isTyping?: boolean;
  isError?: boolean;
  isPrimary?: boolean;
  deliveryStatus?: string;
}

export interface MessageListProps {
  messages?: APIMessage[];
  getAgentMetadata?: (id: string) => { id: string; name: string; avatar?: string };
  onScrollTop?: () => void;
  onRetryMessage?: (messageId: string, content: string, agentId?: string) => void;
  loading?: boolean;
  emptyState?: string;
  className?: string;
  ref?: React.ForwardedRef<HTMLDivElement>;
}

// Internal data structure for mentions processing
export interface MentionsData {
  mentions?: MessageMention[];
  hasMentions: boolean;
  formattedContent: string;
}

// Internal data structure for message component props
export interface MessageData {
  id?: string;
  content: string;
  sender: 'user' | 'agent' | 'system';
  timestamp: Date;
  markdown: boolean;
  metadata: any;
  status: string;
  isTyping?: boolean;
  isError?: boolean;
  isSystem?: boolean;
  className?: string;
}

export function MessageList(props: MessageListProps): React.ReactElement;