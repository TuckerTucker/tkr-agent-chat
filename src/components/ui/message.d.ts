import { ReactNode } from 'react';

export interface MessageProps {
  content: string | string[];
  sender?: 'user' | 'agent' | 'system';
  timestamp?: Date;
  markdown?: boolean;
  metadata?: {
    agentId?: string;
    agentName?: string;
    agentColor?: string;
    agentAccentColor?: string;
    agentSecondary?: string;
    avatar?: string | null;
    isPrimary?: boolean;
    description?: string;
    capabilities?: string[];
    mentions?: Array<{ agentName: string; color: string }>;
    hasMentions?: boolean;
    formattedContent?: string;
    deliveryStatus?: string;
    [key: string]: any;
  };
  isCopied?: boolean;
  isCollapsed?: boolean;
  onCopy?: () => void;
  onDownload?: () => void;
  onToggleCollapse?: () => void;
  onDelete?: () => void;
  status?: 'sent' | 'sending' | 'error' | 'delivered' | 'read';
  className?: string;
  ref?: React.ForwardedRef<HTMLDivElement>;
  isTyping?: boolean;
  isError?: boolean;
  isSystem?: boolean;
}

export interface MessageControlsProps {
  onCopy?: () => void;
  onDownload?: () => void;
  onToggleCollapse?: () => void;
  onDelete?: () => void;
  isCopied?: boolean;
  isCollapsed?: boolean;
  className?: string;
}

export interface MessageHeaderProps {
  sender: string;
  timestamp: Date;
  metadata?: MessageProps['metadata'];
  className?: string;
}

export function Message(props: MessageProps): ReactNode;
