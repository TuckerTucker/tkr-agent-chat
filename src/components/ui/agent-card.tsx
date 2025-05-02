import React from 'react';
import { cn } from '../../lib/utils';
import { ConnectionStatus } from './connection-status';
import { AGENT_THEMES } from '../lib/agent-themes';
import type { AgentInfo } from '../../types/api';

interface AgentCardProps {
  agentId: string;
  isSelected: boolean;
  onSelect: (agentId: string) => void;
  onRetryConnection?: (agentId: string) => void;
  agentInfo: AgentInfo;
  status: { 
    connection: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
    activity: 'idle' | 'thinking' | 'responding' | 'error';
  };
  className?: string;
}

export function AgentCard({
  agentId,
  isSelected,
  onSelect,
  onRetryConnection,
  agentInfo,
  status,
  className
}: AgentCardProps) {
  // Get agent theme
  const agentTheme = AGENT_THEMES[agentId] || AGENT_THEMES.default;
  
  // Determine button background color based on selection state
  const buttonBgColor = isSelected ? (() => {
    const color = agentTheme.color;
    
    // If RGB format, make it brighter
    if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      if (matches && matches.length >= 3) {
        const r = Math.min(255, parseInt(matches[0]) * 1.2);
        const g = Math.min(255, parseInt(matches[1]) * 1.2);
        const b = Math.min(255, parseInt(matches[2]) * 1.2);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
    return color;
  })() : undefined;
  
  // Determine button text color
  const buttonTextColor = isSelected ? "#ffffff" : undefined;
  
  // Shadow effect for selected buttons
  const buttonShadow = isSelected ? (() => {
    const color = agentTheme.color;
    
    if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      if (matches && matches.length >= 3) {
        return `0 0 12px rgba(${matches[0]}, ${matches[1]}, ${matches[2]}, 0.6)`;
      }
    }
    return `0 0 12px ${color}80`;
  })() : undefined;
  
  // Format capabilities for display
  const capabilities = agentInfo.capabilities || [];
  
  // Icon mapping for common capabilities
  const capabilityIcons: Record<string, React.ReactNode> = {
    'search': (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    ),
    'web': (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    ),
    'weather': (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 18a5 5 0 0 0-10 0"></path>
        <line x1="12" y1="9" x2="12" y2="2"></line>
        <line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line>
        <line x1="1" y1="18" x2="3" y2="18"></line>
        <line x1="21" y1="18" x2="23" y2="18"></line>
        <line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line>
        <line x1="23" y1="22" x2="1" y2="22"></line>
        <polyline points="8 6 12 2 16 6"></polyline>
      </svg>
    ),
    'code': (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
    ),
    'chat': (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    ),
    'analysis': (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    ),
  };
  
  return (
    <div 
      className={cn(
        "flex flex-col items-start rounded-lg overflow-hidden transition-all duration-300 hover:shadow-md",
        isSelected ? "bg-accent/20" : "bg-background-lighter/30 hover:bg-background-lighter/50",
        className
      )}
      style={{
        borderLeft: isSelected ? `4px solid ${agentTheme.color}` : '4px solid transparent',
      }}
    >
      <button
        type="button"
        className={cn(
          "flex items-center gap-3 w-full p-3 transition-colors duration-300",
          "rounded-lg text-base font-medium",
          "focus:outline-none",
          isSelected ? "text-white" : "text-foreground"
        )}
        style={{
          backgroundColor: buttonBgColor,
          color: buttonTextColor,
          boxShadow: buttonShadow,
        }}
        onClick={() => onSelect(agentId)}
        role="radio"
        aria-checked={isSelected}
        title={agentInfo.description}
      >
        {/* Agent avatar/icon */}
        <div className="relative">
          {agentInfo.avatar ? (
            <img 
              src={agentInfo.avatar} 
              alt={agentInfo.name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ 
                backgroundColor: agentTheme.secondaryColor,
                color: agentTheme.color 
              }}
            >
              {agentInfo.name.charAt(0).toUpperCase()}
            </div>
          )}
          
          {/* Status indicator */}
          <div className="absolute -bottom-1 -right-1">
            <ConnectionStatus 
              status={status}
              agentName={agentInfo.name}
              size="sm"
              position="floating"
            />
          </div>
        </div>
        
        {/* Agent name */}
        <span className="flex-1 truncate">
          {agentInfo.name}
        </span>
        
        {/* Reconnect button for error state */}
        {status.connection === 'error' && onRetryConnection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetryConnection(agentId);
            }}
            className="ml-1 p-1 rounded-full hover:bg-background/20 focus:outline-none"
            aria-label="Retry connection"
            title="Attempt to reconnect"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </button>
      
      {/* Agent capabilities */}
      <div className="px-3 pb-3 w-full">
        <div className="flex flex-wrap gap-1 mt-2">
          {capabilities.map((capability, index) => {
            // Normalize capability for icon lookup
            const normalizedCapability = capability.toLowerCase();
            const iconKey = Object.keys(capabilityIcons).find(key => 
              normalizedCapability.includes(key)
            );
            
            return (
              <div 
                key={`${agentId}-capability-${index}`}
                className={cn(
                  "text-xs px-2 py-1 rounded-full flex items-center gap-1",
                  isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                )}
                title={capability}
              >
                {iconKey && capabilityIcons[iconKey]}
                <span className="truncate max-w-[100px]">{capability}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AgentCardCompact({
  agentId,
  isSelected,
  onSelect,
  onRetryConnection,
  agentInfo,
  status,
  className
}: AgentCardProps) {
  // Get agent theme
  const agentTheme = AGENT_THEMES[agentId] || AGENT_THEMES.default;
  
  // Determine button background color based on selection state
  const buttonBgColor = isSelected ? (() => {
    const color = agentTheme.color;
    
    // If RGB format, make it brighter
    if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      if (matches && matches.length >= 3) {
        const r = Math.min(255, parseInt(matches[0]) * 1.2);
        const g = Math.min(255, parseInt(matches[1]) * 1.2);
        const b = Math.min(255, parseInt(matches[2]) * 1.2);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
    return color;
  })() : undefined;
  
  return (
    <button
      className={cn(
        "flex items-center gap-2 px-4 py-2",
        "rounded-full text-base font-medium",
        "transition-all duration-theme",
        "focus:outline-none focus:ring-2 focus:ring-agent-primary",
        "hover:bg-accent/80 hover:text-accent-foreground hover:shadow-md",
        isSelected && "ring-2 ring-agent-primary shadow-md",
        className
      )}
      role="radio"
      aria-checked={isSelected}
      title={agentInfo.description}
      style={{
        backgroundColor: isSelected ? buttonBgColor : undefined,
        color: isSelected ? "#ffffff" : undefined,
        boxShadow: isSelected ? `0 0 10px ${agentTheme.color}80` : undefined,
      }}
      onClick={() => onSelect(agentId)}
    >
      <div className="flex items-center gap-2 relative">
        {/* Status indicator */}
        <ConnectionStatus 
          status={status} 
          agentName={agentInfo.name}
          size="sm"
          position="inline"
        />
        
        {/* Agent name */}
        <span className="truncate">{agentInfo.name}</span>
        
        {/* Reconnect button for error state */}
        {status.connection === 'error' && onRetryConnection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetryConnection(agentId);
            }}
            className="ml-1 text-xs text-red-400 hover:text-red-300 focus:outline-none"
            title="Attempt to reconnect"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>
    </button>
  );
}