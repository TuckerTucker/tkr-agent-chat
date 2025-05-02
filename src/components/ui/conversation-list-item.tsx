import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface ConversationListItemProps {
  id: string;
  title: string;
  isSelected: boolean;
  onSelect: (conversation: { id: string }) => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ConversationListItem({
  id,
  title,
  isSelected,
  onSelect,
  onRename,
  onDelete
}: ConversationListItemProps) {
  // State for editing mode
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle rename
  const handleRename = async () => {
    if (editedTitle.trim() === '') {
      setEditedTitle(title); // Reset to original if empty
      setIsEditing(false);
      return;
    }

    if (editedTitle !== title) {
      setIsRenaming(true);
      try {
        await onRename(id, editedTitle);
        // Success - already updated in parent component
      } catch (error) {
        console.error('Failed to rename conversation:', error);
        setEditedTitle(title); // Reset on error
      } finally {
        setIsRenaming(false);
      }
    }
    
    setIsEditing(false);
  };

  // Handle delete with confirmation
  const handleDelete = async () => {
    if (isDeleting) return; // Prevent multiple clicks
    
    setIsDeleting(true);
    try {
      await onDelete(id);
      // Parent component will handle removing from list
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setIsDeleting(false);
    }
  };

  // Handle keydown in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditedTitle(title); // Reset
      setIsEditing(false);
    }
  };

  // Format date from ID (if title is not set)
  const getFormattedDate = () => {
    if (title) return title;
    
    // Try to parse ID as date if no title
    try {
      return new Date(id).toLocaleString('en-US', { 
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true 
      });
    } catch (e) {
      return "Untitled Chat";
    }
  };

  return (
    <div 
      className={cn(
        "px-8 py-3.5 cursor-pointer",
        "transition-all duration-theme",
        "hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
        "focus:outline-none focus:ring-2 focus:ring-sidebar-ring focus:bg-sidebar-accent/80",
        "border-l-2",
        "group relative",
        isSelected
          ? "bg-sidebar-accent/90 border-sidebar-primary text-sidebar-accent-foreground shadow-sm"
          : "border-transparent hover:shadow-sm"
      )}
      onClick={() => {
        if (!isEditing) {
          onSelect({ id });
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect({ id });
        }
      }}
    >
      <div className="flex justify-between items-center relative">
        {isEditing ? (
          <input
            ref={inputRef}
            className={cn(
              "w-full bg-sidebar-background/90 text-sidebar-foreground border border-sidebar-border rounded px-2 py-1 text-sm",
              "focus:outline-none focus:ring-1 focus:ring-sidebar-primary focus:border-sidebar-primary"
            )}
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            disabled={isRenaming}
            maxLength={50}
          />
        ) : (
          <h3 className={cn(
            "font-medium text-sm truncate transition-all duration-theme flex-1",
            isSelected
              ? "text-foreground"
              : "text-foreground/70"
          )}>
            {getFormattedDate()}
          </h3>
        )}

        {/* Actions menu toggle button - only visible on hover or when selected */}
        <div
          className={cn(
            "text-foreground/50 hover:text-foreground transition-opacity ml-2",
            isSelected || isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            aria-label="Conversation options"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </Button>
        </div>

        {/* Actions dropdown menu */}
        {isMenuOpen && (
          <div 
            ref={menuRef}
            className="absolute right-0 top-6 z-10 mt-1 bg-sidebar-background border border-sidebar-border rounded-md shadow-lg p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-sidebar-accent/30 rounded"
              onClick={() => {
                setIsMenuOpen(false);
                setIsEditing(true);
              }}
              disabled={isRenaming || isDeleting}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="14" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Rename
            </button>
            <button
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <svg 
                    className="animate-spin h-4 w-4" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24"
                  >
                    <circle 
                      className="opacity-25" 
                      cx="12" 
                      cy="12" 
                      r="10" 
                      stroke="currentColor" 
                      strokeWidth="4"
                    ></circle>
                    <path 
                      className="opacity-75" 
                      fill="currentColor" 
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" x2="10" y1="11" y2="17" />
                    <line x1="14" x2="14" y1="11" y2="17" />
                  </svg>
                  Delete
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}