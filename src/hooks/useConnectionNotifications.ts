import { useEffect, useCallback } from 'react';
import { useNotifications } from '../components/ui/notification-center';
import webSocketService from '../services/websocket';
import type { AgentInfo } from '../types/api';

export interface ConnectionNotificationsConfig {
  // Whether to show notifications for each event type
  showConnected?: boolean;
  showDisconnected?: boolean;
  showConnecting?: boolean;
  showReconnecting?: boolean;
  showError?: boolean;
  // Notification durations
  errorDuration?: number;
  successDuration?: number;
  infoDuration?: number;
  // Mapping of agent IDs to names for better notifications
  agentMetadata?: Record<string, AgentInfo>;
}

/**
 * Hook to handle WebSocket connection status changes and show notifications
 */
export function useConnectionNotifications(config: ConnectionNotificationsConfig = {}) {
  const {
    showConnected = true,
    showDisconnected = true,
    showConnecting = false, // Less important, so off by default
    showReconnecting = true,
    showError = true,
    errorDuration = 8000,
    successDuration = 5000,
    infoDuration = 4000,
    agentMetadata = {}
  } = config;

  const { addNotification } = useNotifications();

  const getAgentName = useCallback((agentId: string) => {
    return agentMetadata[agentId]?.name || agentId;
  }, [agentMetadata]);

  const handleStatusChange = useCallback((agentId: string, status: {
    connection: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
    activity: 'idle' | 'thinking' | 'responding' | 'error';
  }) => {
    const agentName = getAgentName(agentId);

    switch (status.connection) {
      case 'connected':
        if (showConnected) {
          addNotification({
            type: 'success',
            message: `${agentName} connected successfully`,
            duration: successDuration
          });
        }
        break;
      case 'disconnected':
        if (showDisconnected) {
          addNotification({
            type: 'info',
            message: `${agentName} disconnected`,
            duration: infoDuration
          });
        }
        break;
      case 'connecting':
        if (showConnecting) {
          addNotification({
            type: 'info',
            message: `Connecting to ${agentName}...`,
            duration: infoDuration
          });
        }
        break;
      case 'reconnecting':
        if (showReconnecting) {
          addNotification({
            type: 'warning',
            message: `Reconnecting to ${agentName}...`,
            duration: infoDuration
          });
        }
        break;
      case 'error':
        if (showError) {
          addNotification({
            type: 'error',
            message: `Connection error with ${agentName}${status.activity === 'error' ? ' - Check console for details' : ''}`,
            duration: errorDuration
          });
        }
        break;
    }
  }, [addNotification, getAgentName, showConnected, showDisconnected, showConnecting, showReconnecting, showError, successDuration, infoDuration, errorDuration]);

  const handleWebSocketError = useCallback((agentId: string, error: {
    code: number;
    message: string;
  }) => {
    if (showError) {
      const agentName = getAgentName(agentId);
      addNotification({
        type: 'error',
        message: `${agentName} error: ${error.message}`,
        duration: errorDuration
      });
    }
  }, [addNotification, getAgentName, showError, errorDuration]);

  useEffect(() => {

    // Create our own local reference to the previous callbacks
    // We'll save the current callbacks when we set new ones

    // Set up our notification callbacks
    const notificationCallbacks = {
      onStatusChange: handleStatusChange,
      onError: handleWebSocketError
    };

    // Get the current callbacks from the service by creating a fresh callback with our handlers
    webSocketService.setCallbacks(notificationCallbacks);

    // Clean up by removing our callbacks
    return () => {
      // Simply remove our callbacks to avoid conflicts
      webSocketService.setCallbacks({
        onStatusChange: undefined,
        onError: undefined
      });
    };
  }, [handleStatusChange, handleWebSocketError]);
}