# WebSocket to Socket.IO Migration Catalog

This document catalogs all WebSocket-related code that needs to be modified or replaced during the Socket.IO migration.

## Backend Files

### WebSocket Routes

1. **`api_gateway/src/routes/ws.py`**
   - Main WebSocket route for client-agent communication
   - Handles streaming agent responses
   - Manages ADK session lifecycle
   - Key endpoints:
     - `/chat/{session_id}/{agent_id}` - Main chat endpoint
   - Key functions:
     - `websocket_endpoint` - Main WebSocket handler
     - `agent_to_client_messaging` - Handles sending messages from agent to client
     - `client_to_agent_messaging` - Handles sending messages from client to agent
     - `start_agent_session` - Initializes agent sessions with ADK

2. **`api_gateway/src/routes/ws_a2a.py`**
   - WebSocket routes for agent-to-agent (A2A) communication
   - Manages task subscriptions and broadcasts
   - Key endpoints:
     - `/agent/{agent_id}` - Agent communication endpoint
     - `/tasks/{task_id}` - Task events subscription endpoint
   - Key functions:
     - `agent_communication` - Handles WebSocket connections for agent-to-agent messages
     - `task_events` - Handles WebSocket connections for task event subscriptions
     - `broadcast_task_update` - Broadcasts task updates to all subscribers
     - `broadcast_agent_message` - Broadcasts messages between agents
     - `handle_agent_message` - Handles incoming agent messages

### WebSocket Services

1. **`api_gateway/src/services/state.py`**
   - Manages shared WebSocket connection state
   - Provides thread-safe WebSocket connection tracking
   - Key components:
     - `SharedState` class - Central WebSocket state management
     - `active_websockets` - Tracks active WebSocket connections
     - `_websocket_locks` - Manages locks for WebSocket operations
   - Key functions:
     - `add_websocket` - Adds WebSocket to active connections
     - `remove_websocket` - Removes WebSocket from active connections
     - `get_websocket_lock` - Gets a lock for a specific WebSocket
     - `run_with_websocket_lock` - Runs a function with WebSocket lock

2. **`api_gateway/src/services/error_service.py`**
   - Provides error handling for WebSocket connections
   - Key functions:
     - `send_websocket_error` - Sends standardized errors over WebSocket
     - `log_error` - Logs errors with enhanced context

### WebSocket-related Models

1. **`api_gateway/src/models/error_responses.py`**
   - Defines WebSocket error response models
   - Key models:
     - `WebSocketErrorResponseModel` - WebSocket-specific error response
     - `WebSocketErrorResponse` - Exception class for WebSocket errors
   - Key functions:
     - `create_websocket_error` - Helper to create WebSocket error responses

## Frontend Files

### WebSocket Service

1. **`src/services/websocket.ts`**
   - Main WebSocket service for frontend
   - Manages WebSocket connections to backend
   - Handles reconnection logic and error handling
   - Key classes:
     - `WebSocketService` - Main service for WebSocket management
   - Key methods:
     - `connect` - Establishes WebSocket connection
     - `disconnect` - Closes WebSocket connection
     - `sendTextMessage` - Sends messages to agent
     - `connectA2A` - Connects to A2A WebSocket endpoint
     - `establishConnection` - Internal helper for connection setup
     - `attemptReconnect` - Handles reconnection with backoff
     - `retryConnection` - Manually retries connection
     - `cleanup` - Cleans up all connections

2. **`src/services/__tests__/websocket.test.ts`**
   - Tests for WebSocket service
   - Will need updates to match Socket.IO implementation

### WebSocket-related Components

1. **`src/components/ui/connection-status.tsx`**
   - UI component for displaying WebSocket connection status
   - Will need updates to reflect Socket.IO connection states

2. **`src/hooks/useConnectionNotifications.ts`**
   - Hook for WebSocket connection notifications
   - Will need updates for Socket.IO events

3. **`src/hooks/useAgentStatuses.ts`**
   - Hook for tracking agent statuses via WebSocket
   - Will need updates for Socket.IO event handling

## Migration Approaches

### Backend Migration

1. **Create Socket.IO Service Module**
   - Create new `api_gateway/src/services/socket_service.py`
   - Replace WebSocket management with Socket.IO rooms and namespaces
   - Maintain the same connection patterns with Session and Agent IDs

2. **Replace WebSocket Routes**
   - Replace `/chat/{session_id}/{agent_id}` with Socket.IO namespaces
   - Replace `/agent/{agent_id}` with Socket.IO agent namespace
   - Replace `/tasks/{task_id}` with Socket.IO task namespace
   - Update event handling to use Socket.IO events

3. **Update State Management**
   - Move connection tracking to Socket.IO server instance
   - Replace `active_websockets` tracking with Socket.IO session management
   - Adapt locking mechanism for Socket.IO if needed

4. **Error Handling**
   - Update error sending to use Socket.IO error events
   - Maintain standardized error format

### Frontend Migration

1. **Create Socket.IO Service**
   - Create new `src/services/socket-service.ts`
   - Implement same interface as existing WebSocket service
   - Replace raw WebSocket with Socket.IO client

2. **Update Connection Management**
   - Replace WebSocket reconnection logic with Socket.IO's built-in reconnection
   - Implement enhanced error handling
   - Create session recovery mechanism

3. **Update UI Components**
   - Update connection status component to use Socket.IO events
   - Update hooks to listen for Socket.IO events instead of WebSocket events

## Migration Strategy

1. **Parallel Implementation**
   - Begin with parallel implementation to ensure no disruption
   - Create Socket.IO endpoints alongside existing WebSocket endpoints
   - Allow gradual migration of clients

2. **Compatibility Layer (if needed)**
   - Consider temporary compatibility layer for complex integrations
   - Ensure backward compatibility during transition

3. **Feature Verification**
   - Verify all features work with Socket.IO implementation before removing WebSocket code
   - Comprehensive testing of all communication patterns

4. **Phased Rollout**
   - Roll out Socket.IO implementation in phases
   - Start with non-critical endpoints
   - Gradually migrate all WebSocket functionality