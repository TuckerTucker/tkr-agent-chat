import React from 'react';
import { Button } from '@/components/ui/button';
// Removed useChatStore import

interface ChatListItemProps {
  chatId: string;
  chatTitle: string;
  isActive: boolean;
  onClick: (chatId: string) => void; // Add onClick prop
}

export const ChatListItem: React.FC<ChatListItemProps> = ({ chatId, chatTitle, isActive, onClick }) => {
  // Removed setActiveSession from store

  const handleClick = () => {
    onClick(chatId); // Call the onClick prop passed from parent
  };

  return (
    <Button
      variant="ghost"
      className={`w-full justify-start text-left mb-1${isActive ? ' bg-gray-700' : ''}`}
      onClick={handleClick}
      aria-current={isActive ? "true" : undefined}
    >
      {chatTitle}
    </Button>
  );
};
