import React, { useState } from 'react';
// TODO: Replace with actual TanStack Query hook for fetching agents
// import { useQuery } from '@tanstack/react-query';
// import { getAvailableAgents } from '@/services/api'; // Placeholder API service
import AgentSelectionIcon from './agent-selection-icon';
import { cn } from '@/lib/utils';
import { AgentInfo } from '@/types/api';

interface AgentSelectionIconsProps {
  availableAgents: AgentInfo[];
  activeAgentIds: string[];
  selectedAgentIds: Set<string>; // Receive selected state from parent
  onAgentClick: (agentId: string) => void; // Receive handler from parent
}

const AgentSelectionIcons: React.FC<AgentSelectionIconsProps> = ({
  availableAgents,
  activeAgentIds,
  selectedAgentIds, // Use prop
  onAgentClick, // Use prop
}) => {
  // Removed internal state management for selectedAgentIds

  // Filter the available agents to show only the active ones
  const activeAgents = availableAgents.filter(agent => activeAgentIds.includes(agent.id));

  // Removed internal handleAgentClick function

  // Don't render if there are no active agents to display
  if (!activeAgents || activeAgents.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('flex gap-2 mb-2')} // As defined in .clinerules
      role="toolbar"
      aria-label="Select active agents to message" // Updated label
    >
      {/* Map over only the active agents */}
      {activeAgents.map((agent) => (
        <AgentSelectionIcon
          key={agent.id}
          agent={agent}
          isSelected={selectedAgentIds.has(agent.id)} // Use selected state prop
          onClick={onAgentClick} // Use handler prop
        />
      ))}
    </div>
  );
};

export default AgentSelectionIcons;
