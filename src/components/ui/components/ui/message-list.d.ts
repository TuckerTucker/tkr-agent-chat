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
  deliveryStatus?: string;
}

export interface MessageListProps {
  messages?: APIMessage[];
  getAgentMetadata?: (id: string) => { id: string; name: string; avatar?: string };
  onScrollTop?: () => void;
  loading?: boolean;
  emptyState?: string;
  className?: string;
  ref?: React.ForwardedRef<HTMLDivElement>;
}

export function MessageList(props: MessageListProps): React.ReactElement;
