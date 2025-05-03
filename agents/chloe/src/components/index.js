import { WebScraperDisplay } from './WebScraperDisplay';
import toolDisplayRegistry from '../../../../src/components/lib/tool-display-registry';

// Register the web scraper display component for Chloe agent
toolDisplayRegistry.register('web_scraper', 'chloe', WebScraperDisplay);

// Export components for potential direct use
export {
  WebScraperDisplay
};
