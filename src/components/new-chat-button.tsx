import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { createSession as createSessionApi } from '@/services/api'; // Import API function
// Removed useChatStore import

interface NewChatButtonProps {
  setActiveSessionId: (id: string) => void; // Add prop for setting active session
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({ setActiveSessionId }) => {
  const queryClient = useQueryClient();

  // Use mutation for creating a session
  const mutation = useMutation({
    mutationFn: createSessionApi, // API function to call
    onSuccess: (newSession) => {
      // Invalidate the sessions query to refetch the list
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      console.log('New session created:', newSession);
      // Set the new session as active immediately
      setActiveSessionId(newSession.id);
    },
    onError: (error) => {
      console.error("Failed to create session:", error);
      // TODO: Show error notification to user
    },
  });

  const handleClick = () => {
    // Call the mutation, explicitly passing undefined for the optional title
    mutation.mutate(undefined);
  };

  return (
    <Button
      variant="default"
      className="m-2"
      onClick={handleClick}
      disabled={mutation.isPending} // Disable button while creating
    >
      {mutation.isPending ? 'Creating...' : 'New Chat'}
    </Button>
  );
};
