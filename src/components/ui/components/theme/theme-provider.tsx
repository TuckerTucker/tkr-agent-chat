import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AGENT_THEMES, applyAgentTheme, AgentTheme } from "../../lib/agent-themes";

// Theme context value type
interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  agent: AgentTheme | null;
  setAgent: (agent: AgentTheme) => void;
  availableAgents: AgentTheme[];
}

// ThemeProvider props type
interface ThemeProviderProps {
  defaultTheme?: string;
  defaultAgent?: AgentTheme;
  storageKey?: string;
  agentStorageKey?: string;
  availableAgents?: AgentTheme[];
  children: ReactNode;
}

// Theme context with default values
const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  agent: null,
  setAgent: () => {},
  availableAgents: [],
});

export function ThemeProvider({
  defaultTheme = "light",
  defaultAgent = AGENT_THEMES.system,
  storageKey = "tkr-ui-theme",
  agentStorageKey = "tkr-agent-theme",
  availableAgents = Object.entries(AGENT_THEMES).map(([id, theme]) => ({
    ...theme,
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
  })),
  children,
}: ThemeProviderProps) {
  // Initialize theme from localStorage or default
  const [theme, setThemeState] = useState<string>(
    () => localStorage.getItem(storageKey) || defaultTheme
  );

  // Initialize agent theme from localStorage or default
  const [agent, setAgentState] = useState<AgentTheme>(() => {
    const savedAgentId = localStorage.getItem(agentStorageKey);
    const savedAgent = savedAgentId && availableAgents.find(a => a.id === savedAgentId);
    return savedAgent || defaultAgent;
  });

  // Apply theme classes when theme changes with transition
  useEffect(() => {
    const root = window.document.documentElement;

    // Start transition
    root.classList.add('theme-transition');

    // Apply theme change
    root.classList.remove("light", "dark");
    root.classList.add(theme);

    // Remove transition class after transition completes
    const transitionEndHandler = () => {
      root.classList.remove('theme-transition');
    };

    // Add event listener
    root.addEventListener('transitionend', transitionEndHandler, { once: true });

    // Cleanup 
    return () => {
      root.removeEventListener('transitionend', transitionEndHandler);
    };
  }, [theme]);

  // Apply agent theme variables when agent or theme changes
  useEffect(() => {
    if (agent) {
      const root = window.document.documentElement;

      // Start transition
      root.classList.add('theme-transition');

      // Apply theme changes
      const isDarkMode = theme === 'dark';
      applyAgentTheme(root, agent, isDarkMode);

      // Set a data attribute for current agent to enable agent-specific CSS
      root.dataset.agent = agent.id || 'system';

      // Remove transition class after completion
      const transitionEndHandler = () => {
        root.classList.remove('theme-transition');
      };

      const transitionTimeout = setTimeout(transitionEndHandler, 300);

      return () => {
        clearTimeout(transitionTimeout);
      };
    }
  }, [agent, theme]);

  // Theme value with setters that update localStorage
  const value: ThemeContextType = {
    theme,
    setTheme: (newTheme: string) => {
      localStorage.setItem(storageKey, newTheme);
      setThemeState(newTheme);
    },
    agent,
    setAgent: (newAgent: AgentTheme) => {
      localStorage.setItem(agentStorageKey, newAgent.id);
      setAgentState(newAgent);
    },
    availableAgents,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Hook to access the current theme
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
