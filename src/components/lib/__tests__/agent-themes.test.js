import { describe, it, expect, mock, afterEach } from "bun:test";
import { 
  AGENT_THEMES, 
  applyAgentTheme, 
  getAgentColors 
} from "../agent-themes";

describe("AGENT_THEMES", () => {
  it("should export agent theme definitions", () => {
    expect(AGENT_THEMES).toBeDefined();
    expect(Object.keys(AGENT_THEMES).length).toBeGreaterThan(0);
    
    // Check specific agents
    expect(AGENT_THEMES.chloe).toBeDefined();
    expect(AGENT_THEMES.parker).toBeDefined();
    expect(AGENT_THEMES.system).toBeDefined();
  });
  
  it("should have proper theme properties for each agent", () => {
    // Check structure of agent themes
    Object.entries(AGENT_THEMES).forEach(([id, theme]) => {
      expect(theme.primaryColor).toBeDefined();
      expect(theme.secondaryColor).toBeDefined();
      expect(theme.accentColor).toBeDefined();
      
      // Check that colors are in HSL format (e.g., "142 71% 45%")
      expect(theme.primaryColor).toMatch(/^\d+ \d+% \d+%$/);
      expect(theme.secondaryColor).toMatch(/^\d+ \d+% \d+%$/);
      expect(theme.accentColor).toMatch(/^\d+ \d+% \d+%$/);
    });
  });
});

describe("applyAgentTheme", () => {
  // Mock the DOM
  const mockRoot = {
    style: {
      setProperty: mock(() => {})
    }
  };
  
  afterEach(() => {
    mockRoot.style.setProperty.mockClear();
  });
  
  it("should not modify anything if rootElement is not provided", () => {
    applyAgentTheme(null, AGENT_THEMES.chloe);
    expect(mockRoot.style.setProperty).not.toHaveBeenCalled();
  });
  
  it("should not modify anything if agent theme is not provided", () => {
    applyAgentTheme(mockRoot, null);
    expect(mockRoot.style.setProperty).not.toHaveBeenCalled();
  });
  
  it("should set CSS variables on the root element", () => {
    applyAgentTheme(mockRoot, AGENT_THEMES.chloe);
    
    // Check that we set the agent color variables
    expect(mockRoot.style.setProperty).toHaveBeenCalledWith('--agent-primary', expect.any(String));
    expect(mockRoot.style.setProperty).toHaveBeenCalledWith('--agent-secondary', expect.any(String));
    expect(mockRoot.style.setProperty).toHaveBeenCalledWith('--agent-accent', expect.any(String));
    
    // Check component-specific variables
    expect(mockRoot.style.setProperty).toHaveBeenCalledWith('--agent-message-border', expect.any(String));
    expect(mockRoot.style.setProperty).toHaveBeenCalledWith('--agent-message-bg', expect.any(String));
    expect(mockRoot.style.setProperty).toHaveBeenCalledWith('--agent-avatar-bg', expect.any(String));
  });
  
  it("should handle dark mode adjustments", () => {
    applyAgentTheme(mockRoot, AGENT_THEMES.parker, true);
    
    // Primary color should be adjusted for dark mode
    const darkModeCall = mockRoot.style.setProperty.mock.calls.find(call => call[0] === '--agent-primary');
    expect(darkModeCall).toBeDefined();
    
    // Check that we're setting the message-bg differently for dark mode
    const bgCall = mockRoot.style.setProperty.mock.calls.find(call => call[0] === '--agent-message-bg');
    expect(bgCall).toBeDefined();
    // In dark mode, the bg should have a higher opacity/darker tone
    expect(bgCall[1]).toContain('hsl');
  });
});

describe("getAgentColors", () => {
  it("should return colors for an existing agent", () => {
    const colors = getAgentColors("chloe");
    
    expect(colors).toEqual({
      primary: AGENT_THEMES.chloe.primaryColor,
      secondary: AGENT_THEMES.chloe.secondaryColor,
      accent: AGENT_THEMES.chloe.accentColor,
      name: "Chloe"
    });
  });
  
  it("should return system colors for non-existent agent", () => {
    const colors = getAgentColors("non-existent-agent");
    
    expect(colors).toEqual({
      primary: AGENT_THEMES.system.primaryColor,
      secondary: AGENT_THEMES.system.secondaryColor,
      accent: AGENT_THEMES.system.accentColor,
      name: "System" // System is returned as the name for non-existent agents
    });
  });
  
  it("should handle undefined agent ID", () => {
    const colors = getAgentColors(undefined);
    
    expect(colors).toEqual({
      primary: AGENT_THEMES.system.primaryColor,
      secondary: AGENT_THEMES.system.secondaryColor,
      accent: AGENT_THEMES.system.accentColor,
      name: "System"
    });
  });
});