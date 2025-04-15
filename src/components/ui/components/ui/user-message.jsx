import React from "react";
import { Message } from "./message";
import { cn } from "../../lib/utils";

/**
 * UserMessage component for displaying user messages with consistent styling
 * @param {Object} props - Component props
 * @param {string} props.content - The message content
 * @param {Date} [props.timestamp] - The message timestamp
 * @param {boolean} [props.markdown=false] - Whether content contains Markdown
 * @param {string} [props.status="sent"] - Message status
 * @param {Function} [props.onDelete] - Callback when delete is requested
 * @param {Function} [props.onCopy] - Callback when copy is requested
 * @param {Function} [props.onDownload] - Callback when download is requested
 * @param {string} [props.id] - Unique identifier for the message
 * @param {string} [props.aria-label] - Accessible label for screen readers
 * @returns {JSX.Element} UserMessage component
 */
export const UserMessage = React.forwardRef(({
  content,
  timestamp = new Date(),
  markdown = false,
  status = "sent",
  onDelete,
  onCopy,
  onDownload,
  className,
  id,
  "aria-label": ariaLabel,
  ...props
}, ref) => {
  const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const defaultAriaLabel = `User message sent at ${formattedTime}: ${content}`;
  
  return (
    <Message
      ref={ref}
      content={content}
      sender="user"
      timestamp={timestamp}
      markdown={markdown}
      status={status}
      onDelete={onDelete}
      onCopy={onCopy}
      onDownload={onDownload}
      className={cn("user-message", className)}
      id={id}
      aria-label={ariaLabel || defaultAriaLabel}
      role="listitem"
      {...props}
    />
  );
});

UserMessage.displayName = "UserMessage";