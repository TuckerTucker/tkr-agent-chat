import { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import type { MentionSuggestionProps } from './mention-suggestion.d';

export const MentionSuggestion = forwardRef<HTMLDivElement, MentionSuggestionProps>(({
  suggestions,
  onSelect,
  activeIndex,
  position,
  agents,
  className,
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden",
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '200px',
        maxWidth: '300px'
      }}
      role="listbox"
      aria-label="Mention suggestions"
    >
      <div className="max-h-[200px] overflow-y-auto p-1">
        {suggestions.map((suggestion, index) => {
          const agent = agents[suggestion] || { name: suggestion };
          const isActive = index === activeIndex;

          return (
            <button
              key={suggestion}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm",
                "flex items-center gap-2",
                "transition-colors duration-100",
                isActive ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
              )}
              role="option"
              aria-selected={isActive}
              onClick={() => onSelect(suggestion)}
            >
              {agent.avatar ? (
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-xs font-medium">
                    {agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="flex-1 truncate">{agent.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

MentionSuggestion.displayName = "MentionSuggestion";
