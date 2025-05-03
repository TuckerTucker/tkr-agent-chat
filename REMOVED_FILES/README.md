# Removed Raw WebSocket Files

This directory contains files that were removed from the project when migrating from raw WebSockets to Socket.IO.

The following files were removed:
- `/src/services/websocket.ts` - Original client-side WebSocket implementation
- `/src/services/__tests__/websocket.test.ts` - Tests for WebSocket implementation
- `/api_gateway/src/routes/ws.py` - Server-side WebSocket routes
- `/api_gateway/src/routes/ws_a2a.py` - Server-side WebSocket routes for agent-to-agent communication
- `/api_gateway/src/tests/routes/test_ws_routes.py` - Tests for WebSocket routes

These files are kept for reference only and are no longer used in the project. All WebSocket functionality has been migrated to Socket.IO.

## Migration Notes

Socket.IO was chosen over raw WebSockets for several reasons:
1. Better reconnection handling with exponential backoff
2. Built-in room-based messaging for multi-agent scenarios
3. Fallback to HTTP long-polling when WebSockets aren't available
4. Namespaces for separating concerns (client/agent/task communications)
5. Automatic heartbeats and connection verification
6. Message acknowledgments for guaranteed delivery

The Socket.IO implementation is located in:
- Client: `/src/services/socket-service.ts`
- Server: `/api_gateway/src/services/socket_service.py` and related files