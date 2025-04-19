export interface AgentTheme {
  id: string;
  name: string;
  color: string;
  secondaryColor: string;
  accentColor: string;
  [key: string]: any;
}

export const AGENT_THEMES: Record<string, AgentTheme> = {
  chloe: {
    id: "chloe",
    name: "Chloe",
    color: "rgb(34 197 94)", // emerald-500
    secondaryColor: "rgb(34 44 26)",
    accentColor: "rgb(34 197 94)",
  },
  phil_connors: {
    id: "phil_connors",
    name: "Phil Connors",
    color: "rgb(249 115 22)", // orange-500
    secondaryColor: "rgb(45 26 14)",
    accentColor: "rgb(249 115 22)",
  },
  system: {
    id: "system",
    name: "System",
    color: "rgb(37 99 235)", // blue-600
    secondaryColor: "rgb(30 41 59)", // gray-800
    accentColor: "rgb(34 211 238)", // cyan-400
  },
  default: {
    id: "default",
    name: "Default",
    color: "rgb(37 99 235)",
    secondaryColor: "rgb(30 41 59)",
    accentColor: "rgb(34 211 238)",
  }
};

export function applyAgentTheme(
  root: HTMLElement,
  agent: AgentTheme,
  isDarkMode: boolean = false
) {
  if (!root || !agent) return;
  root.style.setProperty("--agent-primary", agent.color);
  root.style.setProperty("--agent-secondary", agent.secondaryColor);
  root.style.setProperty("--agent-accent", agent.accentColor);
  root.style.setProperty("--agent-name", agent.name);

  // Example: adjust for dark mode if needed
  if (isDarkMode) {
    root.style.setProperty("--agent-primary", agent.color);
    root.style.setProperty("--agent-secondary", agent.secondaryColor);
  }
}
