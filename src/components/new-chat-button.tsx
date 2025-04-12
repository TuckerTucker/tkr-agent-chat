import React from 'react';
import { Button } from '@/components/ui/button';
import useChatStore from '@/store'; // Use the new store

export const NewChatButton: React.FC = () => {
  // Use the renamed action from the new store
  const createSession = useChatStore((state) => state.createSession); 

  const handleClick = () => {
    // Call the renamed action (no arguments needed for default title)
    createSession(); 
  };

  return (
    <Button
      variant="default"
      className="m-2"
      onClick={handleClick}
    >
      New Chat
    </Button>
  );
};
