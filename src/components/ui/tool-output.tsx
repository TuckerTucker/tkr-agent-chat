import * as React from "react";
import { forwardRef, type ForwardedRef } from "react";
import { CodeBlock } from "./code-block";
import { cn } from "../../lib/utils";
import toolDisplayRegistry from "../lib/tool-display-registry";
import type { ToolOutputProps } from './tool-output.d';

/**
 * ToolOutput component for rendering tool results with specialized displays
 */
export const ToolOutput = forwardRef<HTMLDivElement, ToolOutputProps>(({
  result,
  agentColors = {},
  agentId = null,
  className,
  ...props
}: ToolOutputProps, ref: ForwardedRef<HTMLDivElement>) => {
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
      <div className="text-red-600 dark:text-red-400 p-2 border-red-200 dark:border-red-800 rounded bg-red-50 dark:bg-red-900/20">
        <p className="font-medium">Error: {error}</p>
        {result.details && (
          <pre className="mt-2 text-xs overflow-x-auto">
            {JSON.stringify(result.details, null, 2)}
          </pre>
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
          {toolResult.results && toolResult.results.map((item: any, index: number) => (
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
  
  // Web scraper result renderer
  const renderWebScraper = () => {
    if (!success || !toolResult) return renderDefaultTool();
    
    const formatContent = (content: string) => {
      // Split content into paragraphs and preserve line breaks
      return content.split('\n\n').map((paragraph, i) => (
        <p key={i} className="mb-4 last:mb-0">
          {paragraph.split('\n').map((line, j) => (
            <React.Fragment key={j}>
              {line}
              {j < paragraph.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      ));
    };

    const renderImages = (images: Array<{ url: string; alt: string }>) => {
      if (!images?.length) return null;
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
          {images.map((img, i) => (
            <div key={i} className="relative aspect-video">
              <img 
                src={img.url} 
                alt={img.alt || 'Scraped image'} 
                className="object-cover rounded-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      );
    };

    const renderElements = (elements: Array<{ title?: string; url?: string; content?: string }>) => {
      if (!elements?.length) return null;
      return (
        <div className="divide-y">
          {elements.map((element, index) => (
            <div key={index} className="py-4 first:pt-0 last:pb-0">
              {element.title && (
                <h4 className="font-medium text-lg mb-2">{element.title}</h4>
              )}
              {element.url && (
                <a 
                  href={element.url} 
                  className="text-primary text-sm block mb-2 hover:underline" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  {element.url}
                </a>
              )}
              {element.content && (
                <div className="text-sm text-muted-foreground">
                  {formatContent(element.content)}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    };
    
    return (
      <div className="web-scraper-result">
        <div className="flex items-center justify-between mb-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">Source:</span>
            {params.url ? (
              <a 
                href={params.url}
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {new URL(params.url).hostname}
              </a>
            ) : (
              <span className="text-muted-foreground">Unknown source</span>
            )}
          </div>
          {toolResult.timestamp && (
            <span className="text-muted-foreground">
              {new Date(toolResult.timestamp).toLocaleString()}
            </span>
          )}
        </div>
        
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="p-4">
            {toolResult.title && (
              <h3 className="text-xl font-medium mb-4">{toolResult.title}</h3>
            )}
            
            {renderImages(toolResult.images)}
            
            {toolResult.content && (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                {formatContent(toolResult.content)}
              </div>
            )}
            
            {toolResult.elements && (
              <div className="mt-6">
                <h4 className="font-medium text-lg mb-4">Additional Content</h4>
                {renderElements(toolResult.elements)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Select the appropriate renderer based on tool type
  const renderToolOutput = () => {
    if (!success) return renderError();
    
    // Try to use agent-specific renderer if available
    if (agentId && toolName) {
      const AgentRenderer = toolDisplayRegistry.getDisplay(toolName, agentId);
      if (AgentRenderer) {
        return <AgentRenderer result={result} />;
      }
    }
    
    // Fall back to standard renderers
    switch (displayType) {
      case 'calculator':
        return renderCalculator();
      case 'web-search':
        return renderWebSearch();
      case 'web-scraper':
        return renderWebScraper(); // Fallback to default web scraper renderer
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
      ref={ref}
      className={cn("tool-output rounded-md p-3", 
        success ? "border-muted bg-background" : "border-red-200 dark:border-red-800",
        className
      )}
      {...props}
    >
      {renderToolHeader()}
      {renderToolOutput()}
    </div>
  );
});

ToolOutput.displayName = "ToolOutput";

export default ToolOutput;
