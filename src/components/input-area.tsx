import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import useChatStore from '@/store';

export const InputArea: React.FC = () => {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false); // Keep file upload state
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use new store state and actions
  const sendTextMessage = useChatStore(state => state.sendTextMessage);
  const activeConnectionAgentId = useChatStore(state => state.activeConnectionAgentId);
  const error = useChatStore(state => state.error);
  const clearError = useChatStore(state => state.clearError);

  const isConnected = !!activeConnectionAgentId;

  const handleSend = () => { // No longer async, just sends text
    if (!text.trim() || !isConnected) return;
    
    sendTextMessage(text);
    setText('');
    if (error) clearError(); // Clear error on successful send attempt
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = (event) => { // No longer async
        const base64 = event.target?.result as string;
        
        // TODO: File sending needs re-evaluation with ADK streaming model.
        // The current backend ws.py only handles plain text via send_content.
        // Sending files might require a separate mechanism or protocol extension.
        // For now, we'll log a warning and not send the file.
        console.warn("File upload selected, but sending files via ADK streaming is not yet implemented in this example.");
        // Use the setError action from the store
        useChatStore.setState({ error: "File upload not implemented for ADK streaming yet." }); 
        
        // Original (non-functional for current backend):
        // sendTextMessage(`[Uploading file: ${file.name}]`); // Send placeholder text?
        // Or potentially send structured data if backend/ADK supports it:
        // webSocketService.sendRawJson({ type: 'file', ... }); 
        
        // Clear error if one existed before upload attempt
        // if (error) clearError(); 
      };
      reader.readAsDataURL(file);
      
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <section className="p-4 border-t border-gray-700">
      {error && (
        <div className="text-red-500 text-sm mb-2 text-center">
          {error}
          <button
            onClick={clearError}
            className="ml-2 text-red-400 hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}
      <form className="flex items-center" onSubmit={e => { e.preventDefault(); handleSend(); }}>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
        <Button
          type="button"
          variant="ghost"
          className="mr-2"
          disabled={isUploading || !isConnected} // Disable upload if not connected
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? '📤' : '📎'}
        </Button>
        <Textarea
          placeholder={
            !isConnected
              ? "Connect to an agent above to start chatting..."
              : "Type a message... (Shift+Enter for new line)"
          }
          rows={1}
          className="flex-grow resize-none mr-2 bg-gray-800 border border-gray-600 rounded"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isConnected || isUploading} // Disable if not connected or uploading
        />
        <Button
          type="submit"
          variant="default"
          disabled={!text.trim() || !isConnected || isUploading} // Disable if no text, not connected, or uploading
        >
          Send
        </Button>
      </form>
    </section>
  );
};
