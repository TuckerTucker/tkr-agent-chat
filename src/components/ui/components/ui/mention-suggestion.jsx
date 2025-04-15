import React from "react";
import { cn } from "../../lib/utils";

/**
 * MentionSuggestion component for displaying agent suggestions
 * @param {Object} props - Component props
 * @param {Array<string>} props.suggestions - List of agent suggestions
 * @param {function} props.onSelect - Callback when a suggestion is selected
 * @param {string} [props.activeIndex] - Index of the currently active suggestion
 * @param {Object} [props.position] - Position object with top and left values
 * @param {Object} [props.agents] - Map of agent metadata by name
 * @param {string} props.className - Additional class names
 * @returns {JSX.Element} MentionSuggestion component
 */
export const MentionSuggestion = React.forwardRef(({
  suggestions = [],
  onSelect,
  activeIndex = 0,
  position = { top: 0, left: 0 },
  agents = {},
  className,
  ...props
}, ref) => {
  // Don't render if no suggestions
  if (!suggestions || suggestions.length === 0) {
    return null;
  }
  
  // Handle selection
  const handleSelect = (suggestion) => {
    if (onSelect) {
      onSelect(suggestion);
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        "mention-suggestion absolute z-50 bg-background border border-input rounded-md shadow-md",
        "max-h-60 overflow-y-auto w-64",
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`
      }}
      role="listbox"
      aria-label="Agent suggestions"
      {...props}
    >
      <ul className="py-1">
        {suggestions.map((suggestion, index) => {
          // Get agent metadata if available
          const agent = agents[suggestion] || {};
          const agentColor = agent.primaryColor ? `hsl(${agent.primaryColor})` : null;
          
          return (
            <li
              key={suggestion}
              className={cn(
                "px-3 py-2 cursor-pointer flex items-center gap-2",
                activeIndex === index && "bg-primary-foreground",
                "hover:bg-accent"
              )}
              role="option"
              aria-selected={activeIndex === index}
              onClick={() => handleSelect(suggestion)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(suggestion);
                }
              }}
              tabIndex={0}
            >
              {/* Agent avatar/icon */}
              <div 
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{
                  backgroundColor: agentColor || '#666',
                  color: '#fff'
                }}
              >
                {suggestion.charAt(0).toUpperCase()}
              </div>
              
              {/* Agent name */}
              <span>{suggestion}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

MentionSuggestion.displayName = "MentionSuggestion";