import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// Import specific icons for collapse/expand
import { Copy, Download, ChevronsUpDown, ChevronsDownUp, Trash2 } from 'lucide-react';

interface MessageFunctionControlsProps {
  // messageContent: string; // No longer needed, passed via callbacks
  isCollapsed: boolean; // Needed for collapse/expand icon
  onCopy: () => void;
  onDownload: () => void;
  onToggleCollapse: () => void;
  onDelete?: () => void; // Optional delete callback
  className?: string;
}

const MessageFunctionControls: React.FC<MessageFunctionControlsProps> = ({
  // Removed messageContent from destructuring
  isCollapsed,
  onCopy,
  onDownload,
  onToggleCollapse,
  onDelete,
  className,
}) => {
  // TODO: Add visual feedback for copy success

  return (
    <div
      className={cn(
        'message-functions flex flex-col items-center gap-1 py-1 px-1 mx-1', // Adjusted gap/padding
        'bg-background/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-md', // Use theme background
        'opacity-0 group-hover:opacity-100 transition-opacity duration-200', // Hover effect
        'border border-border dark:border-slate-600 rounded-md', // Use theme border
        'h-fit sticky top-2 z-10', // Adjust positioning if needed
        className
      )}
      aria-label="Message actions"
    >
      {/* Copy button */}
      <Button
        variant="ghost"
        size="icon" // Use standard icon size
        className="p-1 h-6 w-6 text-muted-foreground hover:text-primary" // Control size with h/w
        aria-label="Copy message"
        onClick={onCopy}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>

      {/* Download button */}
      <Button
        variant="ghost"
        size="icon"
        className="p-1 h-6 w-6 text-muted-foreground hover:text-primary"
        aria-label="Download message"
        onClick={onDownload}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>

      {/* Collapse/Expand button */}
      <Button
        variant="ghost"
        size="icon"
        className="p-1 h-6 w-6 text-muted-foreground hover:text-primary"
        aria-label={isCollapsed ? 'Expand message' : 'Collapse message'}
        onClick={onToggleCollapse}
      >
        {/* Use different icons based on isCollapsed state */}
        {isCollapsed ? (
          <ChevronsDownUp className="h-3.5 w-3.5" /> // Icon for "Expand"
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5" /> // Icon for "Collapse"
        )}
      </Button>

      {/* Delete button (only if onDelete is provided) */}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="p-1 h-6 w-6 text-destructive hover:text-destructive/80" // Destructive variant color
          aria-label="Delete message"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default MessageFunctionControls;
