import { ComponentType } from 'react';
import { ToolOutputProps } from '../ui/tool-output.d';

interface ToolDisplayRegistry {
  register: (toolName: string, agentId: string, component: ComponentType<ToolOutputProps>) => void;
  getDisplay: (toolName: string, agentId: string) => ComponentType<ToolOutputProps> | null;
}

declare const toolDisplayRegistry: ToolDisplayRegistry;

export default toolDisplayRegistry;
