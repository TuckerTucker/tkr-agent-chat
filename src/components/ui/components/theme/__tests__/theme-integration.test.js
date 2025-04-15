import { describe, it, expect, mock, beforeEach } from "bun:test";
import { applyAgentTheme, AGENT_THEMES } from "../../../lib/agent-themes";

describe("Theme Integration", () => {
  // Mock DOM document
  let mockDocument;
  
  beforeEach(() => {
    // Mock document element
    mockDocument = {
      documentElement: {
        style: {
          setProperty: mock(() => {}),
        },
        classList: {
          add: mock(() => {}),
          remove: mock(() => {}),
        },
        dataset: {},
      },
    };
  });
  
  it("should correctly apply theme changes in ThemeProvider", () => {
    // Simulate what happens in ThemeProvider
    const root = mockDocument.documentElement;
    const agent = AGENT_THEMES.chloe;
    const isDarkMode = true;
    
    // Start transition
    root.classList.add('theme-transition');
    
    // Apply theme changes
    applyAgentTheme(root, agent, isDarkMode);
    
    // Set a data attribute for current agent to enable agent-specific CSS
    root.dataset.agent = agent.id || 'system';
    
    // Check that CSS variables were set
    expect(root.style.setProperty).toHaveBeenCalledTimes(8);
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-primary', expect.any(String));
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-secondary', expect.any(String));
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-accent', expect.any(String));
    
    // Check that data-agent attribute was set correctly
    expect(root.dataset.agent).toBe('chloe');
    
    // Check dark mode adjustments
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-message-bg', expect.stringMatching(/hsl.+?\)/));
  });
  
  it("should handle theme changes between agents", () => {
    // Simulate what happens in ThemeProvider
    const root = mockDocument.documentElement;
    
    // Apply chloe theme
    root.classList.add('theme-transition');
    applyAgentTheme(root, AGENT_THEMES.chloe, false);
    root.dataset.agent = 'chloe';
    
    // Reset mocks
    root.style.setProperty.mockClear();
    
    // Apply parker theme
    root.classList.add('theme-transition');
    applyAgentTheme(root, AGENT_THEMES.parker, false);
    root.dataset.agent = 'parker';
    
    // Check that CSS variables were updated for parker
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-primary', expect.stringContaining('35'));
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-message-border', expect.stringContaining('hsl(35'));
    
    // Check that data-agent attribute was updated
    expect(root.dataset.agent).toBe('parker');
  });
  
  it("should correctly handle switching between light and dark mode", () => {
    // Simulate what happens in ThemeProvider
    const root = mockDocument.documentElement;
    const agent = AGENT_THEMES.chloe;
    
    // Apply in light mode
    root.classList.add('theme-transition');
    applyAgentTheme(root, agent, false);
    
    // Reset mocks
    root.style.setProperty.mockClear();
    
    // Apply in dark mode
    root.classList.add('theme-transition');
    applyAgentTheme(root, agent, true);
    
    // Check that colors are adjusted for dark mode
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-primary', expect.stringMatching(/142 71% \d+%/));
    expect(root.style.setProperty).toHaveBeenCalledWith('--agent-message-bg', expect.stringMatching(/hsl\(142/));
  });
});