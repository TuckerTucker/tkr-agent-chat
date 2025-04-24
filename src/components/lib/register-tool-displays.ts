import toolDisplayRegistry from './tool-display-registry';
import { WebScraperDisplay } from '../../../agents/chloe/src/components/WebScraperDisplay';

/**
 * Register all agent-specific tool displays
 */
export function registerToolDisplays() {
  // Register Chloe's web scraper display
  toolDisplayRegistry.register('web_scraper', 'chloe', WebScraperDisplay);
}
