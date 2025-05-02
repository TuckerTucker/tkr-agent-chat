import { cn } from '../../lib/utils';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
type AgentActivityStatus = 'idle' | 'thinking' | 'responding' | 'error';

interface ConnectionStatusProps {
  status: {
    connection: ConnectionStatus;
    activity: AgentActivityStatus;
  };
  className?: string;
  agentName?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  position?: 'inline' | 'corner' | 'floating';
}

const getStatusColor = (status: ConnectionStatus): string => {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
      return 'bg-yellow-500';
    case 'reconnecting':
      return 'bg-yellow-500';
    case 'disconnected':
      return 'bg-gray-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

const getStatusAnimation = (status: ConnectionStatus): string => {
  switch (status) {
    case 'connecting':
    case 'reconnecting':
      return 'animate-pulse';
    default:
      return '';
  }
};

const getStatusTooltip = (status: { connection: ConnectionStatus; activity: AgentActivityStatus }, agentName?: string): string => {
  const agent = agentName || 'Agent';
  const activityText = status.activity === 'idle' 
    ? 'ready' 
    : status.activity === 'thinking' 
      ? 'thinking' 
      : status.activity === 'responding' 
        ? 'responding' 
        : 'error';
  
  switch (status.connection) {
    case 'connected':
      return `${agent} is connected and ${activityText}`;
    case 'connecting':
      return `${agent} is connecting...`;
    case 'reconnecting':
      return `${agent} is reconnecting...`;
    case 'disconnected':
      return `${agent} is disconnected`;
    case 'error':
      return `${agent} connection error`;
    default:
      return `${agent} status unknown`;
  }
};

export function ConnectionStatus({ 
  status, 
  className, 
  agentName,
  showLabel = false,
  size = 'md',
  position = 'inline'
}: ConnectionStatusProps) {
  // Size classes
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };
  
  // Position classes
  const positionClasses = {
    inline: 'inline-block mr-2',
    corner: 'absolute top-1 right-1',
    floating: 'absolute bottom-0 right-0 transform translate-x-1/2 translate-y-1/2',
  };
  
  return (
    <div 
      className={cn(
        "flex items-center",
        position === 'inline' ? 'inline-flex' : '',
        className
      )}
      title={getStatusTooltip(status, agentName)}
    >
      <span 
        className={cn(
          "rounded-full",
          sizeClasses[size],
          positionClasses[position],
          getStatusColor(status.connection),
          getStatusAnimation(status.connection)
        )} 
      />
      {showLabel && (
        <span className="ml-1 text-xs text-gray-500">
          {status.connection}
        </span>
      )}
    </div>
  );
}