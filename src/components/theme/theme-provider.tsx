import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AGENT_THEMES, applyAgentTheme, AgentTheme } from "../lib/agent-themes";

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

  // Apply theme and agent theme changes with proper transition handling
  useEffect(() => {
    const root = window.document.documentElement;
    let transitionTimeout: NodeJS.Timeout | null = null;
    let transitionHandler: (() => void) | null = null;

    const startTransition = () => {
      root.classList.add('theme-transition');
    };

    const endTransition = () => {
      root.classList.remove('theme-transition');
    };

    // Apply theme changes
    startTransition();
    root.classList.remove("light", "dark");
    root.classList.add(theme);

    // Set avatar filter based on theme
    root.style.setProperty(
      '--avatar-filter',
      theme === 'dark' ? 'invert(1) brightness(2)' : 'none'
    );

    // Apply agent theme if available
    if (agent) {
      const isDarkMode = theme === 'dark';
      applyAgentTheme(root, agent, isDarkMode);
      root.dataset.agent = agent.id || 'system';
    }

    // Set up transition end handling
    transitionHandler = () => {
      endTransition();
      if (transitionTimeout) {
        clearTimeout(transitionTimeout);
        transitionTimeout = null;
      }
    };

    // Add event listener for transition end
    root.addEventListener('transitionend', transitionHandler, { once: true });

    // Fallback timeout in case transition event doesn't fire
    transitionTimeout = setTimeout(transitionHandler, 300);

    // Cleanup
    return () => {
      if (transitionHandler) {
        root.removeEventListener('transitionend', transitionHandler);
      }
      if (transitionTimeout) {
        clearTimeout(transitionTimeout);
      }
      endTransition();
    };
  }, [theme, agent]);

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
