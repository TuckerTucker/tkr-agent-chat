import React from "react";
import { CodeBlock } from "./code-block";
import { cn } from "../../lib/utils";

/**
 * ToolOutput component for rendering tool results with specialized displays
 * @param {Object} props - Component props
 * @param {Object} props.result - The tool result object
 * @param {string} props.result.toolName - The name of the tool that was executed
 * @param {boolean} props.result.success - Whether the tool execution was successful
 * @param {Object} props.result.result - The formatted tool result
 * @param {number} props.result.executionTime - Time taken to execute the tool (ms)
 * @param {Object} props.result.metadata - Tool metadata
 * @param {Object} props.result.params - Original parameters passed to the tool
 * @param {Object} props.agentColors - Map of agent colors for styling
 * @returns {JSX.Element} ToolOutput component
 */
export const ToolOutput = ({
  result,
  agentColors = {},
  className,
  ...props
}) => {
  if (!result) return null;
  
  const { 
    toolName,
    success, 
    result: toolResult, 
    error, 
    executionTime, 
    metadata = {},
    params = {}
  } = result;
  
  // Determine display type from metadata
  const displayType = metadata.displayType || 'default';
  
  // Function to render tool header
  const renderToolHeader = () => {
    return (
      <div className="flex items-center justify-between mb-2 text-sm font-medium">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary px-2 py-1 rounded">
            {toolName}
          </span>
          
          {success ? (
            <span className="text-green-600 dark:text-green-400">Success</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">Error</span>
          )}
        </div>
        
        {executionTime && (
          <span className="text-muted-foreground text-xs">
            {executionTime}ms
          </span>
        )}
      </div>
    );
  };
  
  // Function to render error state
  const renderError = () => {
    return (
      <div className="text-red-600 dark:text-red-400 p-2 border border-red-200 dark:border-red-800 rounded bg-red-50 dark:bg-red-900/20">
        <p className="font-medium">Error: {error}</p>
        {result.details && (
          <pre className="mt-2 text-xs overflow-x-auto">
            {JSON.stringify(result.details, null, 2)}
          </pre>
        )}
        
        {result.canRetry && result.retryFn && (
          <button
            onClick={result.retryFn}
            className="mt-2 px-2 py-1 text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/50 text-red-700 dark:text-red-300 rounded"
            disabled={result.isRetrying}
          >
            {result.isRetrying ? 'Retrying...' : 'Retry Tool'}
          </button>
        )}
      </div>
    );
  };
  
  // Calculator result renderer
  const renderCalculator = () => {
    if (!success || !toolResult) return renderDefaultTool();
    
    return (
      <div className="calculator-result p-3 bg-primary/5 rounded-md">
        <div className="text-2xl font-medium text-center">
          {params.expression} = {toolResult.formattedValue}
        </div>
      </div>
    );
  };
  
  // Web search result renderer
  const renderWebSearch = () => {
    if (!success || !toolResult) return renderDefaultTool();
    
    return (
      <div className="web-search-result">
        <div className="text-sm mb-2">
          <span className="font-medium">Search query:</span> {params.query}
        </div>
        
        <div className="border rounded-md divide-y">
          {toolResult.results && toolResult.results.map((item, index) => (
            <div key={index} className="p-3">
              <h4 className="font-medium">{item.title}</h4>
              <a 
                href={item.url} 
                className="text-primary text-sm block truncate hover:underline" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                {item.url}
              </a>
              <p className="text-sm mt-1">{item.snippet}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // Default tool renderer for generic results
  const renderDefaultTool = () => {
    if (!success) return null;
    
    // For object results, show as code block
    if (toolResult && typeof toolResult === 'object') {
      return (
        <CodeBlock
          code={JSON.stringify(toolResult, null, 2)}
          language="json"
          showLineNumbers={false}
        />
      );
    }
    
    // For text results, show as formatted text
    return (
      <div className="p-3 bg-muted/50 rounded-md">
        {String(toolResult)}
      </div>
    );
  };
  
  // Select the appropriate renderer based on tool type
  const renderToolOutput = () => {
    if (!success) return renderError();
    
    switch (displayType) {
      case 'calculator':
        return renderCalculator();
      case 'web-search':
        return renderWebSearch();
      case 'code':
        return (
          <CodeBlock
            code={typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)}
            language={toolResult.language || 'json'}
            showLineNumbers={true}
          />
        );
      default:
        return renderDefaultTool();
    }
  };
  
  return (
    <div 
      className={cn("tool-output border rounded-md p-3", 
        success ? "border-muted bg-background" : "border-red-200 dark:border-red-800",
        className
      )}
      {...props}
    >
      {renderToolHeader()}
      {renderToolOutput()}
    </div>
  );
};

ToolOutput.displayName = "ToolOutput";