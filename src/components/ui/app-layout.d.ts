import { ReactNode } from 'react';
import { AgentInfo } from '../../../../types/api';

export interface Conversation {
  id: string;
  title: string;
  messages: any[];
}

export interface AppLayoutProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSendMessage: (message: string, agentId: string) => Promise<void>;
  onCreateConversation: () => void;
  onSelectConversation: (conversation: { id: string }) => void;
  onRenameConversation: (id: string, newTitle: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  currentAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onRetryConnection?: (agentId: string) => void;
  onRetryMessage?: (messageId: string, content: string, agentId?: string) => void;
  availableAgents: string[];
  agentMetadata: Record<string, AgentInfo>;
  agentStatuses: Record<string, { connection: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error'; activity: 'idle' | 'thinking' | 'responding' | 'error' }>;
  onLoadMoreMessages?: () => void;
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  children?: ReactNode;
}

export function AppLayout(props: AppLayoutProps): React.ReactElement;
