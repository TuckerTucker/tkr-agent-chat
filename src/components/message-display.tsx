import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getMessages, getAgents } from '@/services/api';
import webSocketService from '@/services/websocket';
import { Message, MessagePart, AgentInfo, MessageRead } from '@/types/api'; // Use MessageRead for fetched data
// Removed unused debounce import
import UserIcon from './user-icon'; // Import the UserIcon component
import MessageFunctionControls from './message-function-controls'; // Import the controls
import { cn } from '@/lib/utils'; // Import cn utility
import { marked } from 'marked'; // Import marked library
// Removed unused CodeBlock import (integration is TODO)
import DOMPurify from 'dompurify'; // Import DOMPurify for sanitization
// Import icons for status indicator
import { Check, CheckCheck, AlertCircle, Loader2 } from 'lucide-react'; // Removed unused Clock, Loader2 for sending

// --- Helper Components ---

// Helper to determine if a hex color is light or dark
const isLightColor = (color?: string): boolean => {
  if (!color) return false; // Default to dark if no color provided
  const cleanColor = color.replace('#', '');
  if (cleanColor.length !== 3 && cleanColor.length !== 6) return false;
  try {
    let r: number, g: number, b: number;
    if (cleanColor.length === 3) {
      r = parseInt(cleanColor[0] + cleanColor[0], 16);
      g = parseInt(cleanColor[1] + cleanColor[1], 16);
      b = parseInt(cleanColor[2] + cleanColor[2], 16);
    } else {
      r = parseInt(cleanColor.substring(0, 2), 16);
      g = parseInt(cleanColor.substring(2, 4), 16);
      b = parseInt(cleanColor.substring(4, 6), 16);
    }
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return brightness > 0.5;
  } catch (e) {
    console.error("Error parsing color for brightness check:", color, e);
    return false;
  }
};

// Helper to extract text content from message parts
const getMessageTextContent = (message: MessageRead | Message): string => {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.content)
    .join('\n');
};

interface MessageContentProps {
  part: MessagePart;
}

// Configure marked (without custom code renderer for now)
marked.setOptions({
  gfm: true, // Enable GitHub Flavored Markdown
  breaks: true, // Convert single line breaks to <br>
  // Removed custom renderer to avoid signature issues
  // Highlighting will be handled separately if needed
});


const MessageContent: React.FC<MessageContentProps> = ({ part }) => {
  switch (part.type) {
    case 'text':
      // Parse markdown and sanitize
      // Note: Directly using marked like this won't render the React CodeBlock component.
      // This needs refinement. For now, it will render basic <pre><code>.
      const contentToParse = typeof part.content === 'string' ? part.content : ''; // Ensure string
      const rawHtml = marked.parse(contentToParse);
      // Ensure rawHtml is string before sanitizing
      const sanitizedHtml = DOMPurify.sanitize(typeof rawHtml === 'string' ? rawHtml : '');
      return <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
    case 'file':
      return <div className="italic text-gray-400">[File: {part.content?.name || 'Unnamed file'}]</div>;
    case 'data':
      return <pre className="text-sm bg-gray-800 p-2 rounded">{JSON.stringify(part.content, null, 2)}</pre>;
    default:
      return <div className="text-red-500">[Unsupported content type: {part.type}]</div>;
  }
};

interface UserMessageProps {
  message: MessageRead | Message;
  onCopy: () => void;
  onDownload: () => void;
  onToggleCollapse: () => void;
  onDelete?: () => void;
  isCollapsed: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error'; // Add optional status prop
}

// Helper component for status indicator
const StatusIndicator: React.FC<{ status: UserMessageProps['status'] }> = ({ status }) => {
  const iconSize = 'h-3.5 w-3.5'; // Consistent size
  switch (status) {
    case 'sending':
      return <Loader2 className={cn(iconSize, "text-gray-400 animate-spin")} aria-label="Sending" />;
    case 'sent':
      return <Check className={cn(iconSize, "text-gray-400")} aria-label="Sent" />;
    case 'delivered':
      // Using CheckCheck for delivered and read, differentiate by color?
      return <CheckCheck className={cn(iconSize, "text-gray-400")} aria-label="Delivered" />;
    case 'read':
      return <CheckCheck className={cn(iconSize, "text-blue-400")} aria-label="Read" />; // Example: Blue for read
    case 'error':
      return <AlertCircle className={cn(iconSize, "text-red-500")} aria-label="Error" />;
    default:
      return null; // Or default to 'sent' icon
  }
};

const UserMessage: React.FC<UserMessageProps> = ({ message, onCopy, onDownload, onToggleCollapse, onDelete, isCollapsed, status = 'sent' }) => { // Default status to 'sent'
  // Removed messageContent variable as it's not needed here
  const messageKey = ('message_uuid' in message ? message.message_uuid : message.id);

  return (
    <div key={messageKey} className="group relative flex justify-end mb-4">
      <div className="w-8 flex-shrink-0 order-1"></div>
      <div className="bg-blue-600 p-2 rounded-lg rounded-tr-none ml-auto max-w-xs md:max-w-md text-white flex items-end order-2">
        <div className={cn("text-right flex-grow", isCollapsed ? "line-clamp-3" : "")}>
          {message.parts.map((part, index) => (<MessageContent key={index} part={part} />))}
          {/* Footer with Timestamp and Status */}
          <div className="flex items-center justify-end mt-1 text-xs text-gray-200 space-x-1">
            {(message.metadata?.timestamp || ('created_at' in message && message.created_at)) && (
              <span>{new Date('created_at' in message ? message.created_at! : message.metadata!.timestamp!).toLocaleTimeString()}</span>
            )}
            <StatusIndicator status={status} />
          </div>
        </div>
        <UserIcon />
      </div>
      <div className="order-3 self-start pt-1">
        <MessageFunctionControls
          // Removed messageContent prop
          isCollapsed={isCollapsed}
          onCopy={onCopy}
          onDownload={onDownload}
          onToggleCollapse={onToggleCollapse}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
};

interface AgentMessageProps {
  message: MessageRead | Message;
  agent: AgentInfo | undefined;
  onCopy: () => void;
  onDownload: () => void;
  onToggleCollapse: () => void;
  onDelete?: () => void;
  isCollapsed: boolean;
}

const AgentMessage: React.FC<AgentMessageProps> = ({ message, agent, onCopy, onDownload, onToggleCollapse, onDelete, isCollapsed }) => {
  const isStreaming = message.metadata?.streaming === true;
  // Removed messageContent variable as it's not needed here
  const messageKey = ('message_uuid' in message ? message.message_uuid : message.id);

  // Determine avatar content: SVG, Image URL, or Color fallback
  let avatarContent: React.ReactNode = null;
  const avatarClasses = "w-full h-full object-cover"; // Common classes for img/svg

  if (agent?.avatar) {
    if (agent.avatar.startsWith('<svg') || (agent.avatar.includes('<?xml') && agent.avatar.includes('<svg'))) {
      // Render SVG string directly
      avatarContent = <div className={avatarClasses} dangerouslySetInnerHTML={{ __html: agent.avatar }} />;
    } else {
      // Assume it's an image URL
      avatarContent = <img src={agent.avatar} alt={agent.name} className={avatarClasses} />;
    }
  }

  return (
    <div key={messageKey} className="group relative flex justify-start mb-4">
       <div className="order-1 self-start pt-1">
         <MessageFunctionControls
           // Removed messageContent prop
           isCollapsed={isCollapsed}
           onCopy={onCopy}
           onDownload={onDownload}
           onToggleCollapse={onToggleCollapse}
           onDelete={onDelete}
         />
       </div>
       {/* Avatar Container */}
       <div
         className="w-6 h-6 rounded-full mr-2 flex-shrink-0 order-2 overflow-hidden" // Added overflow-hidden
         style={{ backgroundColor: !avatarContent ? (agent?.color || 'rgb(34 197 94)') : undefined }} // Apply bg color only if no avatar content
         title={agent?.name}
       >
         {avatarContent} {/* Render img/svg if available */}
       </div>
       {/* Bubble Content */}
       <div className={cn(
           `p-2 rounded-lg rounded-tl-none mr-auto max-w-xs md:max-w-md flex items-start order-3`,
           isStreaming ? 'opacity-80' : '',
           !agent?.color && 'bg-gray-700',
           isLightColor(agent?.color) ? 'text-gray-900' : 'text-white'
         )}
         style={agent?.color ? { backgroundColor: agent.color } : {}}
       >
         <div className={cn(isCollapsed ? "line-clamp-3" : "")}>
           {message.parts.map((part, index) => (<MessageContent key={index} part={part} />))}
           <div className="text-xs text-gray-400 mt-1">
             {agent?.name || message.agent_id || 'Unknown Agent'}
             {(message.metadata?.timestamp || ('created_at' in message && message.created_at)) && (
               <> • {new Date('created_at' in message ? message.created_at! : message.metadata!.timestamp!).toLocaleTimeString()}</>
             )}
             {isStreaming && <span className="ml-1 animate-pulse">▍</span>}
           </div>
         </div>
       </div>
     </div>
  );
};

// --- System/Error Messages (Unchanged) ---
interface SystemMessageProps { message: MessageRead | Message; }
const SystemMessage: React.FC<SystemMessageProps> = ({ message }) => (
    <div key={('message_uuid' in message ? message.message_uuid : message.id)} className="bg-gray-800 p-2 rounded-lg mb-2 mx-auto max-w-xs md:max-w-md text-gray-400 text-center italic">
        {message.parts.map((part, index) => (<MessageContent key={index} part={part} />))}
    </div>
);
interface ErrorMessageProps { message: MessageRead | Message; }
const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => (
    <div key={('message_uuid' in message ? message.message_uuid : message.id)} className="bg-red-900/50 p-2 rounded-lg mb-2 mx-auto max-w-xs md:max-w-md text-red-400 text-center">
        {message.parts.map((part, index) => (<MessageContent key={index} part={part} />))}
    </div>
);

// --- Main MessageDisplay Component ---
interface MessageDisplayProps { activeSessionId: string | null; }
export const MessageDisplay: React.FC<MessageDisplayProps> = ({ activeSessionId }) => {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [streamingMessages, setStreamingMessages] = useState<Record<string, Message>>({});
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());

  const { data: availableAgents = [], error: agentsError } = useQuery<AgentInfo[]>({
    queryKey: ['agents'], queryFn: getAgents, staleTime: Infinity, refetchOnWindowFocus: false,
  });
  const { data: fetchedMessages = [], isLoading: isLoadingMessages, error: messagesError } = useQuery<MessageRead[]>({
    queryKey: ['messages', activeSessionId],
    queryFn: () => activeSessionId ? getMessages(activeSessionId) : Promise.resolve([]),
    enabled: !!activeSessionId, refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!activeSessionId) return;
    const handlePacket = (agentId: string, packet: any) => {
      console.log(`[WS Packet] Agent ${agentId}:`, packet);
      const hasMessageContent = typeof packet.message === 'string' && packet.message.length > 0;
      const isFinalChunk = packet.turn_complete === true;
      setStreamingMessages(prev => {
        const currentStream = prev[agentId];
        let newState = { ...prev };
        if (isFinalChunk) {
          if (currentStream) {
            newState[agentId] = { ...currentStream, id: packet.message_uuid || currentStream.id, metadata: { ...currentStream.metadata, streaming: false } };
            console.log(`[WS] Marked stream ${agentId} as complete locally.`);
          }
        } else if (hasMessageContent) {
          if (!currentStream || !currentStream.metadata?.streaming) {
            newState[agentId] = { id: `stream_${agentId}_${Date.now()}`, type: 'agent', agent_id: agentId, session_id: activeSessionId!, parts: [{ type: 'text', content: packet.message }], metadata: { timestamp: new Date().toISOString(), streaming: true } };
          } else {
             newState[agentId] = { ...currentStream, parts: [{ ...currentStream.parts[0], content: currentStream.parts[0].content + packet.message }], metadata: { ...currentStream.metadata, timestamp: new Date().toISOString() } };
          }
        }
        return newState;
      });
    };
    const handleError = (agentId: string, error: any) => {
        console.error(`[WS Error] Agent ${agentId}:`, error);
        setStreamingMessages(prev => { const newState = { ...prev }; delete newState[agentId]; return newState; });
    };
    webSocketService.setCallbacks({ onPacket: handlePacket, onError: handleError });
    return () => { console.log("MessageDisplay cleanup: Callbacks potentially cleared."); };
  }, [activeSessionId, queryClient]);

  useEffect(() => {
     const scrollElement = scrollAreaRef.current?.children[1] as HTMLDivElement | undefined;
     if (scrollElement) { scrollElement.scrollTop = scrollElement.scrollHeight; }
   }, [fetchedMessages, streamingMessages]);

  const combinedMessages = new Map<string, MessageRead | Message>();
  Object.values(streamingMessages).forEach(streamMsg => { if (typeof streamMsg.id === 'string') { combinedMessages.set(streamMsg.id, streamMsg); } else { console.warn("Skipping streaming message with invalid id:", streamMsg); } });
  fetchedMessages.forEach(msg => { if (!combinedMessages.has(msg.message_uuid)) { combinedMessages.set(msg.message_uuid, msg); } });
  const allMessages = Array.from(combinedMessages.values()).sort((a, b) => {
      const getDateValue = (msg: MessageRead | Message): string | number => { if ('created_at' in msg && msg.created_at) return msg.created_at; if (msg.metadata?.timestamp) return msg.metadata.timestamp; return new Date(0).toISOString(); };
      const dateA = new Date(getDateValue(a)); const dateB = new Date(getDateValue(b)); if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0; return dateA.getTime() - dateB.getTime();
  });

  const handleCopy = (content: string) => { navigator.clipboard.writeText(content).then(() => { console.log('Content copied'); }).catch(err => { console.error('Copy failed: ', err); }); };
  const handleDownload = (content: string) => { console.log('Download requested'); try { const fileType = { ext: 'md', mime: 'text/markdown;charset=utf-8' }; const filename = `message-${new Date().toISOString().replace(/:/g, '-')}.${fileType.ext}`; const blob = new Blob([content], { type: fileType.mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); console.log(`Downloaded as ${filename}`); } catch (err) { console.error('Download failed:', err); } };
  const handleToggleCollapse = (messageId: string) => { console.log('Toggle collapse:', messageId); setCollapsedMessages(prev => { const newSet = new Set(prev); if (newSet.has(messageId)) { newSet.delete(messageId); } else { newSet.add(messageId); } return newSet; }); };
  const handleDelete = (messageId: string) => { console.log('Delete requested:', messageId); };

  return (
    <ScrollArea ref={scrollAreaRef} className="flex-grow p-4 overflow-y-auto" aria-live="polite" aria-label="Chat messages">
      {isLoadingMessages && (<div className="text-gray-500 text-center mt-8">Loading messages...</div>)}
      {messagesError && (<div className="text-red-500 text-center mt-8">Error loading messages: {messagesError.message}</div>)}
      {agentsError && (<div className="text-red-500 text-center mt-2">Error loading agent info: {agentsError.message}</div>)}
      {!isLoadingMessages && allMessages.length === 0 && (<div className="text-gray-500 text-center mt-8">No messages yet.</div>)}
      {allMessages.map((message) => {
        const agent = availableAgents.find(a => a.id === message.agent_id);
        const messageKey = ('message_uuid' in message) ? message.message_uuid : message.id;
        const isCollapsed = typeof messageKey === 'string' ? collapsedMessages.has(messageKey) : false;
        // Add status prop when rendering UserMessage
        // TODO: Get actual status from message data or state management
        const messageStatus = message.metadata?.status as UserMessageProps['status'] || 'sent'; // Example placeholder

        const commonControlProps = {
          onCopy: () => handleCopy(getMessageTextContent(message)),
          onDownload: () => handleDownload(getMessageTextContent(message)),
          onToggleCollapse: () => { if (typeof messageKey === 'string') { handleToggleCollapse(messageKey); } else { console.error("Cannot toggle collapse: message key is undefined", message); } },
          onDelete: () => { if (typeof messageKey === 'string') { handleDelete(messageKey); } else { console.error("Cannot delete: message key is undefined", message); } },
          isCollapsed: isCollapsed,
        };
        switch (message.type) {
          case 'user': return <UserMessage key={messageKey} message={message} {...commonControlProps} status={messageStatus} />; // Pass status prop
          case 'agent': return <AgentMessage key={messageKey} message={message} agent={agent} {...commonControlProps} />;
          case 'system': return <SystemMessage key={messageKey} message={message} />;
          case 'error': return <ErrorMessage key={messageKey} message={message} />;
          default: console.warn("Unknown message type:", message.type); return null;
        }
      })}
    </ScrollArea>
  );
};
