import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components
import { cn } from '@/lib/utils';
import { AgentInfo } from '@/types/api'; // Import AgentInfo type

interface AgentSelectionIconProps {
  agent: AgentInfo; // Use the full AgentInfo type
  isSelected: boolean;
  onClick: (agentId: string) => void;
}

// Function to get initials from name
const getInitials = (name: string): string => {
  const words = name.split(/[\s-]+/); // Split by space or hyphen
  if (words.length === 1) {
    // Take first two letters if single word
    return words[0].substring(0, 2).toUpperCase();
  }
  // Take first letter of first two words
  return words.map(word => word[0]).slice(0, 2).join('').toUpperCase();
};


const AgentSelectionIcon: React.FC<AgentSelectionIconProps> = ({
  agent,
  isSelected,
  onClick,
}) => {
  const initials = getInitials(agent.name);
  // Assume agent.avatar contains the URL/path to the icon (SVG or other image)
  const avatarUrl = agent.avatar;

  // Improved contrast logic: Use white text on colored background when selected,
  // agent color text on transparent background when not selected.
  // Apply background color only if there's no avatar.
  const style: React.CSSProperties = {
    borderColor: agent.color,
    // Apply background color only if no avatar and selected
    backgroundColor: !avatarUrl && isSelected ? agent.color : 'transparent',
    // Apply text color only if no avatar
    color: !avatarUrl ? (isSelected ? '#FFFFFF' : agent.color) : undefined,
  };

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'w-8 h-8 rounded-full border-2 p-0 flex items-center justify-center overflow-hidden', // Center content, hide overflow
        'text-xs font-semibold', // Style for initials
        isSelected ? 'opacity-100 ring-2 ring-offset-2 ring-offset-background ring-foreground' : 'opacity-75 hover:opacity-100' // Better selected state
      )}
      style={style}
      onClick={() => onClick(agent.id)}
      aria-label={`Select agent ${agent.name}`}
      aria-pressed={isSelected}
    >
      {avatarUrl ? (
        // Render img tag if avatar URL exists
        <img src={avatarUrl} alt={`${agent.name} icon`} className="w-full h-full object-contain" /> // Use object-contain for SVGs
      ) : (
        // Render initials if no avatar URL
        initials
      )}
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
