import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components
import { cn } from '@/lib/utils';

interface AgentSelectionIconProps {
  agent: {
    id: string;
    name: string;
    color: string; // Expecting hex format e.g., #RRGGBB
  };
  isSelected: boolean;
  onClick: (agentId: string) => void;
  // Add tooltip functionality if needed
}

const AgentSelectionIcon: React.FC<AgentSelectionIconProps> = ({
  agent,
  isSelected,
  onClick,
}) => {
  // Basic styling, can be refined
  const style = {
    backgroundColor: isSelected ? agent.color : 'transparent',
    borderColor: agent.color,
    color: isSelected ? '#FFFFFF' : agent.color, // Basic contrast logic
  };

  // TODO: Add Tooltip wrapper if needed (e.g., from shadcn/ui)
  return (
    <Button
      variant="outline"
      size="icon" // Make it small and circular/square
      className={cn(
        'w-8 h-8 rounded-full border-2 p-0', // Circular icon style
        isSelected ? 'opacity-100' : 'opacity-75 hover:opacity-100' // Visual feedback
      )}
      style={style}
      onClick={() => onClick(agent.id)}
      aria-label={`Select agent ${agent.name}`}
      aria-pressed={isSelected}
    >
      {/* Placeholder: Maybe initials or a generic icon? */}
      {/* Or leave empty for just color */}
    </Button>
  );
};

// Wrap with TooltipProvider if not already done at a higher level
const AgentSelectionIconWithTooltip: React.FC<AgentSelectionIconProps> = (props) => {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <AgentSelectionIcon {...props} />
        </TooltipTrigger>
        <TooltipContent>
          <p>{props.agent.name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AgentSelectionIconWithTooltip; // Export the wrapped component
// Removed duplicate default export
