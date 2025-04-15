import React from 'react';
import { cn } from '@/lib/utils'; // Utility for conditional class names

interface NewChatListItemProps {
  chatId: string;
  chatTitle: string;
  isActive: boolean;
  onClick: (chatId: string) => void;
}

/**
 * Represents a single chat session item in the list.
 * Uses a standard div with Tailwind styling for appearance and interaction.
 */
export const NewChatListItem: React.FC<NewChatListItemProps> = ({
  chatId,
  chatTitle,
  isActive,
  onClick,
}) => {
  const handleClick = () => {
    onClick(chatId);
  };

  // Handle keyboard interaction for accessibility
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Prevent default space bar scroll
      handleClick();
    }
  };

  return (
    <div
      role="button" // Semantically represents a button
      tabIndex={0} // Make it keyboard focusable
      className={cn(
        'w-full text-left p-2 mb-1 rounded cursor-pointer transition-colors duration-150 ease-in-out text-sm', // Base styles
        'hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500', // Hover and focus styles
        isActive ? 'bg-gray-600 font-medium text-white' : 'text-gray-300 hover:text-white' // Active state styles
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-current={isActive ? 'page' : undefined} // Indicate current item for assistive tech
      title={chatTitle} // Show full title on hover
    >
      {/* Ensure text truncates correctly */}
      <span className="block truncate min-w-0">{chatTitle}</span>
    </div>
  );
};
