import { ComponentType } from 'react';
import type { ToolOutputProps } from '../ui/tool-output.d';

class ToolDisplayRegistry {
  private displays: Map<string, ComponentType<ToolOutputProps>>;

  constructor() {
    this.displays = new Map();
  }

  register(toolName: string, agentId: string, component: ComponentType<ToolOutputProps>) {
    const key = `${agentId}:${toolName}`;
    this.displays.set(key, component);
  }

  getDisplay(toolName: string, agentId: string): ComponentType<ToolOutputProps> | null {
    const key = `${agentId}:${toolName}`;
    return this.displays.get(key) || null;
  }
}

const toolDisplayRegistry = new ToolDisplayRegistry();

export default toolDisplayRegistry;
