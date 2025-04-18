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
  currentAgentId: string;
  onSelectAgent: (agentId: string) => void;
  availableAgents: string[];
  agentMetadata: Record<string, AgentInfo>;
  agentStatuses: Record<string, { connection: string; activity: string }>;
  children?: ReactNode;
}

export function AppLayout(props: AppLayoutProps): React.ReactElement;
