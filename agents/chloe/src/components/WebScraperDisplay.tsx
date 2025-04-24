import React from 'react';
import type { ToolOutputProps, WebScraperResult } from '../../../../src/components/ui/tool-output.d';

/**
 * WebScraperDisplay component for Chloe agent
 * Simplified display for web scraper tool results - shows only URL and text content
 */
export const WebScraperDisplay: React.FC<ToolOutputProps> = ({ result }) => {
  if (!result || !result.success || !result.result) {
    return (
      <div className="error-state p-3 bg-red-50 text-red-700 rounded-md">
        <p>Failed to load scraped content</p>
      </div>
    );
  }
  
  const { result: scrapedData, params = {} } = result as { result: WebScraperResult; params: { url?: string } };
  const sourceUrl = params.url as string | undefined;
  
  return (
    <div className="chloe-web-scraper">
      {/* URL Display */}
      {sourceUrl && (
        <div className="source-url mb-3">
          <a 
            href={sourceUrl} 
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {sourceUrl}
          </a>
        </div>
      )}
      
      {/* Scraped Content */}
      <div className="content-area border border-blue-100 rounded-md bg-white p-3">
        <div className="text-content whitespace-pre-wrap">
          {scrapedData.text}
        </div>
      </div>
    </div>
  );
};

export default WebScraperDisplay;
