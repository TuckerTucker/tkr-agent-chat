import React from 'react';
import { Button } from '@/components/ui/button';
import useChatStore from '@/store'; // Use the new store

interface ChatListItemProps {
  chatId: string;
  chatTitle: string;
  isActive: boolean;
}

export const ChatListItem: React.FC<ChatListItemProps> = ({ chatId, chatTitle, isActive }) => {
  // Use the renamed action from the new store
  const setActiveSession = useChatStore((state) => state.setActiveSession); 

  const handleClick = () => {
    setActiveSession(chatId); // Call the renamed action
  };

  // Optionally add dynamic styling for active state
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
