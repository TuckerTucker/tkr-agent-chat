# API Gateway

The API Gateway provides REST and WebSocket endpoints for the multi-agent chat system, including A2A protocol support.

## Database Setup

The system uses an LMDB database. The database is automatically created when the server starts, but you can also manually initialize or reset it:

```bash
# Initialize the database (creates if not exists)
npm run db:init

# Reset the database (deletes existing and recreates)
npm run db:reset

# The database files will be created under:
# api_gateway/chats/chat_database/
```

The initialization script:
1. Creates the LMDB directory if it doesn't exist
2. Sets up the required databases
3. Creates default agent cards

## Development

### Prerequisites

Install dependencies:
```bash
pip install -r requirements.txt
```

### Running Migrations

```bash
# Create a new migration
cd api_gateway
python -m alembic revision --autogenerate -m "Description of changes"

# Apply migrations
python -m alembic upgrade head
```

### Running the Server

```bash
# From project root
python -m api_gateway.src.main
```

## API Documentation

### A2A Protocol Endpoints

REST Endpoints:
- POST `/api/v1/a2a/tasks` - Create new A2A task
- PATCH `/api/v1/a2a/tasks/{task_id}/status` - Update task status
- GET `/api/v1/a2a/tasks/agent/{agent_id}` - Get agent's tasks
- GET `/api/v1/a2a/tasks/session/{session_id}` - Get session's tasks
- PATCH `/api/v1/a2a/tasks/{task_id}/context` - Update task context

WebSocket Endpoints:
- `/ws/v1/tasks/{task_id}` - Subscribe to task events
- `/ws/v1/chat/{session_id}/{agent_id}` - Chat with agent (includes task support)

### WebSocket Events

Task Events:
```typescript
// Task Update Event
{
    type: "task_update",
    task_id: string,
    status: "pending" | "in_progress" | "completed" | "failed" | "cancelled",
    updated_at: string,
    result?: any
}

// Task State Event
{
    type: "task_state",
    task_id: string,
    status: string,
    context?: any,
    result?: any
}

// Task Context Update
{
    action: "update_context",
    context: any
}

// Task Status Update
{
    action: "update_status",
    status: string,
    result?: any
}
```

Chat Events:
```typescript
// Regular Message
{
    type: "text",
    text: string
}

// Task Message
{
    type: "task",
    action: "start" | "update",
    task_id?: string,
    title?: string,
    description?: string,
    status?: string,
    context?: any,
    result?: any
}
