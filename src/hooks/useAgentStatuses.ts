import { useState, useEffect, useCallback } from 'react';
import webSocketService, { AgentStatus } from '@/services/websocket'; // Import service and type

// Hook to manage agent statuses from WebSocket service
export const useAgentStatuses = (activeAgentIds: string[]) => {
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(
    () => webSocketService.getAllAgentStatuses() // Initialize with current statuses
  );

  // Callback handler for status changes from WebSocket
  const handleStatusChange = useCallback((agentId: string, status: AgentStatus) => {
    // Only update if the agent is currently active in the session
    // Or if we want to track all agents regardless, remove this check
    if (activeAgentIds.includes(agentId)) {
        setAgentStatuses((prevStatuses) => {
            const newStatuses = new Map(prevStatuses);
            newStatuses.set(agentId, status);
            return newStatuses;
        });
    } else {
        // Optionally remove status for inactive agents if desired
        // setAgentStatuses((prevStatuses) => {
        //     const newStatuses = new Map(prevStatuses);
        //     if (newStatuses.has(agentId)) {
        //         newStatuses.delete(agentId);
        //         console.log(`Removed status for inactive agent: ${agentId}`);
        //     }
        //     return newStatuses;
        // });
    }
  }, [activeAgentIds]); // Dependency on activeAgentIds ensures we only track relevant agents

  useEffect(() => {
    // Set up callbacks when the hook mounts or activeAgentIds change
    // Register only the onStatusChange callback using the public method
    webSocketService.setCallbacks({
      onStatusChange: handleStatusChange,
      // If other callbacks (like onPacket) are needed by other parts
      // of the app, they should be registered separately or managed
      // through a central callback registration mechanism.
      // For now, this hook only manages the status callback.
    });

    // Initialize statuses for currently active agents
    const initialStatuses = new Map<string, AgentStatus>();
    activeAgentIds.forEach(id => {
        initialStatuses.set(id, webSocketService.getAgentStatus(id));
    });
    setAgentStatuses(initialStatuses);


    // Cleanup function: potentially remove callbacks if needed,
    // though the singleton service might persist them.
    // For simplicity, we don't remove the callback here.
    // If multiple components used this hook, managing callbacks would need care.
    // return () => {
    //   webSocketService.setCallbacks({
    //      ...webSocketService.callbacks,
    //      onStatusChange: undefined, // Remove callback on unmount?
    //   });
    // };

  }, [activeAgentIds, handleStatusChange]); // Rerun effect if active agents or handler changes

  return agentStatuses;
};
