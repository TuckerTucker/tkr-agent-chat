/**
 * Tool Display Registry
 * 
 * Manages agent-specific tool display components.
 * Allows agents to register custom display components for their tools.
 */

import { ToolResult } from '../ui/tool-result';

const toolDisplayRegistry = {
  // Map of toolName -> { agentId -> component }
  displays: new Map(),
  
  /**
   * Register a display component for a specific agent and tool
   * @param {string} toolName - Name of the tool
   * @param {string} agentId - ID of the agent
   * @param {React.Component} component - The display component
   * @returns {Object} The registry instance (for chaining)
   */
  register(toolName, agentId, component) {
    if (!this.displays.has(toolName)) {
      this.displays.set(toolName, new Map());
    }
    this.displays.get(toolName).set(agentId, component);
    return this; // For chaining
  },

  /**
   * Get the default tool result component
   * @param {string} toolName - Name of the tool
   * @param {any} result - The tool result
   * @param {Object} error - Optional error object
   * @returns {React.Component} The default tool result component
   */
  getDefaultDisplay(toolName, result, error) {
    // Handle both new error format and legacy error format
    const normalizedError = error && {
      message: typeof error === 'string' ? error : error.message || 'An error occurred',
      details: typeof error === 'string' ? error : error.details || error
    };
    
    return ToolResult({ 
      toolName: error ? (toolName || 'Error') : toolName,
      result,
      error: normalizedError
    });
  },
  
  /**
   * Get a display component for a specific agent and tool
   * @param {string} toolName - Name of the tool
   * @param {string} agentId - ID of the agent
   * @param {any} result - The tool result
   * @param {Object} error - Optional error object
   * @returns {React.Component} The display component
   */
  getDisplay(toolName, agentId, result, error) {
    // For error cases, try to use error-specific display if available
    if (error && this.displays.has('error')) {
      const errorDisplay = this.displays.get('error').get(agentId);
      if (errorDisplay) {
        return errorDisplay({ toolName, result, error });
      }
    }

    // Fall back to tool-specific display or default
    if (!this.displays.has(toolName)) {
      return this.getDefaultDisplay(toolName, result, error);
    }
    const customDisplay = this.displays.get(toolName).get(agentId);
    return customDisplay 
      ? customDisplay({ toolName, result, error }) 
      : this.getDefaultDisplay(toolName, result, error);
  },

  /**
   * Register an error display component
   * @param {string} agentId - ID of the agent
   * @param {React.Component} component - The error display component
   * @returns {Object} The registry instance (for chaining)
   */
  registerErrorDisplay(agentId, component) {
    return this.register('error', agentId, component);
  },
  
  /**
   * Check if a display exists for a specific agent and tool
   * @param {string} toolName - Name of the tool
   * @param {string} agentId - ID of the agent
   * @returns {boolean} True if a display component exists
   */
  hasDisplay(toolName, agentId) {
    return Boolean(this.getDisplay(toolName, agentId));
  }
};

export default toolDisplayRegistry;
