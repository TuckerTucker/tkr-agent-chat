export interface AgentTheme {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  [key: string]: any;
}

export const AGENT_THEMES: Record<string, AgentTheme> = {
  chloe: {
    id: "chloe",
    name: "Chloe",
    primaryColor: "rgb(34 197 94)", // emerald-500
    secondaryColor: "#222c1a",
    accentColor: "#22c55e",
  },
  phil_connors: {
    id: "phil_connors",
    name: "Phil Connors",
    primaryColor: "rgb(249 115 22)", // orange-500
    secondaryColor: "#2d1a0e",
    accentColor: "#f97316",
  },
  system: {
    id: "system",
    name: "System",
    primaryColor: "#2563eb", // blue-600
    secondaryColor: "#1e293b", // gray-800
    accentColor: "#22d3ee", // cyan-400
  },
  default: {
    id: "default",
    name: "Default",
    primaryColor: "#2563eb",
    secondaryColor: "#1e293b",
    accentColor: "#22d3ee",
  }
};

export function applyAgentTheme(
  root: HTMLElement,
  agent: AgentTheme,
  isDarkMode: boolean = false
) {
  if (!root || !agent) return;
  root.style.setProperty("--agent-primary", agent.primaryColor);
  root.style.setProperty("--agent-secondary", agent.secondaryColor);
  root.style.setProperty("--agent-accent", agent.accentColor);
  root.style.setProperty("--agent-name", agent.name);

  // Example: adjust for dark mode if needed
  if (isDarkMode) {
    root.style.setProperty("--agent-primary", agent.primaryColor);
    root.style.setProperty("--agent-secondary", agent.secondaryColor);
  }
}
