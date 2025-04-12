import React from 'react';
import useChatStore from '@/store';
import { Message, MessagePart } from '@/types/api';

interface MessageContentProps {
  part: MessagePart;
}

const MessageContent: React.FC<MessageContentProps> = ({ part }) => {
  switch (part.type) {
    case 'text':
      return <div>{part.content}</div>;
    case 'file':
      return (
        <div className="italic text-gray-400">
          [File: {part.content.name || 'Unnamed file'}]
        </div>
      );
    case 'data':
      return (
        <pre className="text-sm bg-gray-800 p-2 rounded">
          {JSON.stringify(part.content, null, 2)}
        </pre>
      );
    default:
      return <div className="text-red-500">[Unsupported content type]</div>;
  }
};

interface UserMessageProps {
  message: Message;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => (
  <div className="bg-blue-600 p-2 rounded-lg mb-2 ml-auto max-w-xs md:max-w-md text-white text-right">
    {message.parts.map((part, index) => (
      <MessageContent key={index} part={part} />
    ))}
    {message.metadata?.timestamp && (
      <div className="text-xs text-gray-200 mt-1">
        {new Date(message.metadata.timestamp).toLocaleTimeString()}
      </div>
    )}
  </div>
);

interface AgentMessageProps {
  message: Message;
}

const AgentMessage: React.FC<AgentMessageProps> = ({ message }) => {
  const availableAgents = useChatStore(state => state.availableAgents);
  const agent = availableAgents.find(a => a.id === message.agent_id);

  return (
    <div className="bg-gray-700 p-2 rounded-lg mb-2 mr-auto max-w-xs md:max-w-md flex items-start">
      <div
        className="w-6 h-6 rounded-full mr-2 flex-shrink-0"
        style={{ backgroundColor: agent?.color || 'rgb(34 197 94)' }}
        title={agent?.name}
      />
      <div>
        {message.parts.map((part, index) => (
          <MessageContent key={index} part={part} />
        ))}
        <div className="text-xs text-gray-400 mt-1">
          {agent?.name || 'Unknown Agent'}
          {message.metadata?.timestamp && (
            <> • {new Date(message.metadata.timestamp).toLocaleTimeString()}</>
          )}
        </div>
      </div>
    </div>
  );
};

interface SystemMessageProps {
  message: Message;
}

const SystemMessage: React.FC<SystemMessageProps> = ({ message }) => (
  <div className="bg-gray-800 p-2 rounded-lg mb-2 mx-auto max-w-xs md:max-w-md text-gray-400 text-center italic">
    {message.parts.map((part, index) => (
      <MessageContent key={index} part={part} />
    ))}
  </div>
);

interface ErrorMessageProps {
  message: Message;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => (
  <div className="bg-red-900/50 p-2 rounded-lg mb-2 mx-auto max-w-xs md:max-w-md text-red-400 text-center">
    {message.parts.map((part, index) => (
      <MessageContent key={index} part={part} />
    ))}
  </div>
);

export const MessageDisplay: React.FC = () => {
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const messages = useChatStore(state => 
    activeSessionId ? state.messages[activeSessionId] || [] : []
  );

  return (
    <section
      className="flex-grow p-4 overflow-y-auto"
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      {messages.length === 0 && (
        <div className="text-gray-500 text-center mt-8">No messages yet.</div>
      )}
      {/* Use message.id as key if available, fallback to index */}
      {messages.map((message, index) => { 
        const messageKey = message.id || `msg-${index}`; 
        switch (message.type) {
          case 'user':
            return <UserMessage key={messageKey} message={message} />;
          case 'agent':
            return <AgentMessage key={messageKey} message={message} />;
          case 'system':
            return <SystemMessage key={messageKey} message={message} />;
          case 'error':
            return <ErrorMessage key={messageKey} message={message} />;
          default:
            return null;
        }
      })}
    </section>
  );
};
