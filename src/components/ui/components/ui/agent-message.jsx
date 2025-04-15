import React from "react";
import { Message } from "./message";
import { cn } from "../../lib/utils";
import { getAgentColors } from "../../lib/agent-themes";

/**
 * AgentMessage component for displaying agent messages with consistent styling
 * @param {Object} props - Component props
 * @param {string} props.content - The message content
 * @param {Date} [props.timestamp] - The message timestamp
 * @param {boolean} [props.markdown=true] - Whether content contains Markdown
 * @param {Object} [props.agent] - Agent configuration object
 * @param {string} [props.agent.name] - Agent name
 * @param {string} [props.agent.id] - Agent ID for theme lookup
 * @param {string} [props.agent.avatar] - Agent avatar (URL or SVG content)
 * @param {string} [props.agent.primaryColor] - Agent primary color in HSL format (e.g. "176 100% 39%")
 * @param {Function} [props.onDelete] - Callback when delete is requested
 * @param {Function} [props.onCopy] - Callback when copy is requested
 * @param {Function} [props.onDownload] - Callback when download is requested
 * @returns {JSX.Element} AgentMessage component
 */
export const AgentMessage = React.forwardRef(({
  content,
  timestamp = new Date(),
  markdown = true,
  agent = {},
  onDelete,
  onCopy,
  onDownload,
  className,
  ...props
}, ref) => {
  // Get agent colors from the agent ID or use provided colors
  const agentId = agent.id || "system";
  
  // If primaryColor is provided directly, use it; otherwise get from theme
  const colors = agent.primaryColor 
    ? { primary: agent.primaryColor } 
    : getAgentColors(agentId);
  
  // Create metadata for the message component
  const metadata = {
    name: agent.name || colors.name || "Agent",
    avatar: agent.avatar || null,
    agentColor: colors.primary, // Consistent property name
    agentName: agent.name || colors.name || "Agent",
    agentId: agentId
  };
  
  return (
    <Message
      ref={ref}
      content={content}
      sender="agent"
      timestamp={timestamp}
      markdown={markdown}
      metadata={metadata}
      onDelete={onDelete}
      onCopy={onCopy}
      onDownload={onDownload}
      className={cn(`agent-message agent-${agentId}`, className)}
      {...props}
    />
  );
});

AgentMessage.displayName = "AgentMessage";