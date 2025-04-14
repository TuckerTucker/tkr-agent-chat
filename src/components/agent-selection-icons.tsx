import React, { useState } from 'react';
// TODO: Replace with actual TanStack Query hook for fetching agents
// import { useQuery } from '@tanstack/react-query';
// import { getAvailableAgents } from '@/services/api'; // Placeholder API service
import AgentSelectionIcon from './agent-selection-icon';
import { cn } from '@/lib/utils';

// Placeholder type - replace with actual Agent type from src/types/api.ts or similar
interface Agent {
  id: string;
  name: string;
  color: string; // Hex format
  // Add other relevant fields if needed
}

// Mock data for now - replace with API call
const MOCK_AGENTS: Agent[] = [
  { id: 'chloe', name: 'Chloe', color: '#22C55E' }, // Green
  { id: 'placeholder1', name: 'Placeholder Gray', color: '#6B7280' }, // Gray
  { id: 'architect', name: 'Architect', color: '#F97316' }, // Orange
  { id: 'placeholder2', name: 'Placeholder Purple', color: '#A855F7' }, // Purple
  { id: 'placeholder3', name: 'Placeholder Blue', color: '#3B82F6' }, // Blue
];

const AgentSelectionIcons: React.FC = () => {
  // TODO: Replace mock data with TanStack Query
  // const { data: agents, isLoading, error } = useQuery({
  //   queryKey: ['availableAgents'],
  //   queryFn: getAvailableAgents,
  // });
  const agents = MOCK_AGENTS; // Using mock data for now
  const isLoading = false; // Mock loading state
  const error = null; // Mock error state

  // TODO: Manage selected agents state (e.g., using React state, context, or Zustand)
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());

  const handleAgentClick = (agentId: string) => {
    setSelectedAgentIds((prevSelected) => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(agentId)) {
        newSelected.delete(agentId);
      } else {
        newSelected.add(agentId);
      }
      // TODO: Potentially update global state or trigger side effects
      console.log('Selected agents:', Array.from(newSelected));
      return newSelected;
    });
  };

  if (isLoading) {
    return <div className="h-10">Loading agents...</div>; // Basic loading indicator
  }

  if (error) {
    return <div className="h-10 text-red-500">Error loading agents.</div>; // Basic error indicator
  }

  if (!agents || agents.length === 0) {
    return null; // Don't render anything if no agents
  }

  return (
    <div
      className={cn('flex gap-2 mb-2')} // As defined in .clinerules
      role="toolbar"
      aria-label="Select agents to message"
    >
      {agents.map((agent) => (
        <AgentSelectionIcon
          key={agent.id}
          agent={agent}
          isSelected={selectedAgentIds.has(agent.id)}
          onClick={handleAgentClick}
        />
      ))}
      {/* Optional: Add a separator or 'All' button if needed */}
    </div>
  );
};

export default AgentSelectionIcons;
