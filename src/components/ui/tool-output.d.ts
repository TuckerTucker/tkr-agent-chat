import { ReactNode } from 'react';

interface ToolResult {
  toolName?: string;
  success?: boolean;
  result?: any;
  error?: string;
  details?: any;
  executionTime?: number;
  metadata?: {
    displayType?: string;
    [key: string]: any;
  };
  params?: Record<string, any>;
}

export interface ToolOutputProps {
  result: ToolResult;
  agentColors?: Record<string, string>;
  agentId?: string | null;
  className?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebScraperResult {
  title?: string;
  url: string;
  text: string;
}

export interface CalculatorResult {
  formattedValue: string;
  rawValue: number;
}

export function ToolOutput(props: ToolOutputProps): ReactNode;
