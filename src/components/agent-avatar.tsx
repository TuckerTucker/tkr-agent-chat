import React from 'react';
import { cn } from '@/lib/utils';

// Define the expected structure for agent configuration
interface AgentConfig {
  id: string;
  name: string;
  color: string;
}

// Define the props for the AgentAvatar component
interface AgentAvatarProps {
  agent: AgentConfig;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Import agent PNGs directly from their asset directories
import ChloeIcon from '../../agents/chloe/src/assets/icon.png';
import PhilConnorsIcon from '../../agents/phil_connors/src/assets/icon.png';

// Mapping from agent ID to imported PNG
const agentImages: Record<string, string> = {
  chloe: ChloeIcon,
  phil_connors: PhilConnorsIcon,
};

// Utility function to get initials from a name
const getInitials = (name: string): string => {
  if (!name) return '?';
  const words = name.split(/[\s_-]+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
};

const AgentAvatar: React.FC<AgentAvatarProps> = ({ agent, className, size = 'md' }) => {
  const imagePath = agentImages[agent.id];

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const baseClasses = 'flex items-center justify-center rounded-full overflow-hidden flex-shrink-0';
  const combinedClassName = cn(baseClasses, sizeClasses[size], className);

  if (imagePath) {
    return (
      <div 
        className={cn(combinedClassName, 'p-[1px] bg-white')}
        title={agent.name}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center"
          style={{ backgroundColor: agent.color }}
        >
          <img
            src={imagePath}
            alt={agent.name}
            className="w-[90%] h-[90%] object-cover"
            style={{
              filter: 'brightness(0) invert(1)', // Make the image white
              opacity: 0.9,
            }}
          />
        </div>
      </div>
    );
  } else {
    // Render fallback initials if no icon is found
    const initials = getInitials(agent.name);
    return (
      <div
        className={cn(
          combinedClassName,
          'font-semibold text-white' // Ensure initials are visible
        )}
        style={{ backgroundColor: agent.color }} // Use agent color for background
        title={`${agent.name} (icon not found)`}
      >
        {initials}
      </div>
    );
  }
};

export default AgentAvatar;
