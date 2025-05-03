# Standardized Message Formats

This document describes the standardized message formats used throughout the TKR Multi-Agent Chat system for communication between clients, agents, and the server.

## Overview

All messages in the system follow a standardized format with consistent field naming and structure. This ensures compatibility between different components and simplifies development and maintenance.

## Base Message Format

All messages extend this base format:

```typescript
{
  id: string;                      // UUID for the message
  type: MessageType;               // Type of message (text, agent_message, etc.)
  timestamp: string;               // ISO-8601 formatted timestamp
  session_id: string;              // Session ID the message belongs to
  
  // Optional fields
  from_agent?: string;             // ID of sending agent (null for user messages)
  to_agent?: string;               // ID of target agent (null for broadcast)
  from_user?: boolean;             // True if message is from a user 
  content?: string | object;       // Message content
  in_reply_to?: string;            // ID of message this is replying to
  streaming?: boolean;             // True if message is part of a streaming response
  turn_complete?: boolean;         // True when streaming message is complete
  metadata?: Record<string, any>;  // Additional message metadata
}
```

## Message Types

The system supports the following message types:

| Type | Description |
|------|-------------|
| `text` | Plain text message from user or agent |
| `agent_message` | Agent-to-agent message (A2A protocol) |
| `system` | System notification |
| `error` | Error message |
| `context_update` | Context sharing between agents |
| `task_update` | Task status update |
| `ping` | Connection check |
| `pong` | Connection check response |

## Specific Message Formats

### User Text Message

```typescript
{
  id: string;
  type: "text";
  timestamp: string;
  session_id: string;
  from_user: true;
  content: string;
  to_agent?: string;  // Optional target agent
}
```

### Agent Text Message

```typescript
{
  id: string;
  type: "text";
  timestamp: string;
  session_id: string;
  from_agent: string;
  content: string;
  in_reply_to?: string;
  streaming?: boolean;
  turn_complete?: boolean;
}
```

### Agent-to-Agent Message

```typescript
{
  id: string;
  type: "agent_message";
  timestamp: string;
  session_id: string;
  from_agent: string;
  to_agent: string;
  content: any;
  task_id?: string;
}
```

### Context Update Message

```typescript
{
  id: string;
  type: "context_update";
  timestamp: string;
  session_id: string;
  from_agent: string;
  context_id: string;
  context_data: any;
  target_agents?: string[];
}
```

### Task Update Message

```typescript
{
  id: string;
  type: "task_update";
  timestamp: string;
  session_id: string;
  task_id: string;
  status?: string;
  action?: "create" | "update" | "cancel";
  result?: any;
}
```

### Error Message

```typescript
{
  id: string;
  type: "error";
  timestamp: string;
  session_id: string;
  content: string;
  error_code?: string;
  error_details?: any;
  severity?: "warning" | "error" | "critical";
  recoverable?: boolean;
}
```

## Message Adapters

The system includes adapter utilities to convert between different message formats:

- `normalizeMessage(message)`: Converts any message format to the standardized format
- `isStandardFormat(message)`: Checks if a message uses standardized format
- `isLegacyFormat(message)`: Checks if a message uses legacy format
- `legacyToStandard(message)`: Converts legacy format to standardized format
- `standardToLegacy(message)`: Converts standardized format to legacy format

## Message Validation

Messages are validated at multiple points in the system:

1. **Client-side**: TypeScript interfaces enforce message structure
2. **Socket.IO Transport**: Message adapters normalize messages before sending
3. **Server-side**: Pydantic models validate incoming messages 
4. **Database Storage**: Standard message formats are enforced

## Message Flow

1. **User to Agent**:
   - Client creates standardized `UserTextMessage`
   - Socket service sends message to server
   - Server validates, stores, and routes to appropriate agent

2. **Agent to User**:
   - Server creates standardized `AgentTextMessage`
   - Socket service broadcasts to appropriate clients
   - Client processes and displays message

## Streaming Messages

For streaming agent responses:

1. Initial empty message with `streaming: true, turn_complete: false`
2. Content updates as they arrive
3. Final message with `streaming: false, turn_complete: true`

## Examples

### User Text Message Example

```json
{
  "id": "msg_1620123456789",
  "type": "text",
  "timestamp": "2023-05-01T12:34:56.789Z",
  "session_id": "session_abc123",
  "from_user": true,
  "content": "Hello, what's the weather today?",
  "to_agent": "phil_connors"
}
```

### Agent Response Example

```json
{
  "id": "msg_1620123459876",
  "type": "text",
  "timestamp": "2023-05-01T12:35:00.000Z",
  "session_id": "session_abc123",
  "from_agent": "phil_connors",
  "content": "Good morning! The weather today is sunny with a high of 72°F.",
  "in_reply_to": "msg_1620123456789",
  "streaming": false,
  "turn_complete": true
}
```