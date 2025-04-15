import { type ThemeSwitchProps, type AgentThemeSelectorProps, type ThemeControlsProps, type IconProps } from "./theme-switch.d";
import { useTheme } from "./theme-provider";
import { cn } from "../../lib/utils";

/**
 * Theme Switch Button Component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} [props.showAgentIndicator=false] - Whether to display the current agent indicator
 * @returns {JSX.Element} ThemeSwitch component
 */
export function ThemeSwitch({ className, showAgentIndicator = false, ...props }: ThemeSwitchProps) {
  const { theme, setTheme, agent } = useTheme();
  
  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };
  
  // Get agent color for indicator
  const agentColor = agent?.primaryColor ? 
    `hsl(${agent.primaryColor})` : 
    'var(--agent-primary, hsl(222 47% 11%))';
  
  return (
    <button
      {...props}
      onClick={toggleTheme}
      className={cn(
        "rounded-full p-2 inline-flex items-center justify-center relative",
        "hover:bg-accent hover:text-accent-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "transition-all duration-300",
        className
      )}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
    >
      {/* Agent theme indicator */}
      {showAgentIndicator && (
        <span 
          className="absolute inset-0 rounded-full opacity-20 transition-colors duration-300"
          style={{ backgroundColor: agentColor }}
        />
      )}
      
      {theme === "light" ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
    </button>
  );
}

/**
 * Agent Theme Selector Component with ThemeContext integration
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @returns {JSX.Element} AgentThemeSelector component
 */
export function AgentThemeSelector({ className, ...props }: AgentThemeSelectorProps) {
  const { agent, setAgent, availableAgents } = useTheme();
  
  return (
    <div {...props} className={cn("flex gap-2 items-center flex-wrap", className)}>
      {availableAgents.map((agentOption) => (
        <button
          key={agentOption.id}
          onClick={() => setAgent(agentOption)}
          className={cn(
            "h-8 w-8 rounded-full",
            "ring-offset-background transition-all duration-300",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2",
            agent?.id === agentOption.id && "ring-2 ring-ring ring-offset-2",
            `agent-${agentOption.id}-selector`
          )}
          style={{ 
            backgroundColor: `hsl(${agentOption.primaryColor})`,
            color: agentOption.primaryForeground ? 
              `hsl(${agentOption.primaryForeground})` : 
              'hsl(0 0% 100%)'
          }}
          aria-label={`Switch to ${agentOption.name || agentOption.id} theme`}
          aria-pressed={agent?.id === agentOption.id}
          data-agent-id={agentOption.id}
        >
          {(agentOption.name || agentOption.id).charAt(0).toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Sun icon for light mode
function SunIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

// Moon icon for dark mode
function MoonIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

/**
 * Combined theme control component that includes theme switch and agent selector
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @returns {JSX.Element} ThemeControls component
 */
export function ThemeControls({ className, ...props }: ThemeControlsProps) {
  const { availableAgents } = useTheme();
  
  // Show agent selector only if multiple agents are available
  const showAgentSelector = availableAgents?.length > 1;
  
  return (
    <div {...props} className={cn("flex items-center gap-2", className)}>
      <ThemeSwitch showAgentIndicator={true} />
      
      {showAgentSelector && (
        <div className="border-l border-border h-6 mx-1"></div>
      )}
      
      {showAgentSelector && (
        <AgentThemeSelector />
      )}
    </div>
  );
}
