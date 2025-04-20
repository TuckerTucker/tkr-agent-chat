# Sessions Module

The `google.adk.sessions` module provides components for managing interactions and conversations.

## Overview

This module contains services for managing sessions, which represent series of interactions between users and agents. It includes both in-memory implementations for development and production-ready implementations using databases or Vertex AI.

## Classes

### BaseSessionService
Abstract base class for session services.

#### Abstract Methods
- `create_session(app_name, user_id, state=None, session_id=None)`: Creates new session
- `get_session(app_name, user_id, session_id, config=None)`: Retrieves session
- `list_sessions(app_name, user_id)`: Lists all sessions
- `list_events(app_name, user_id, session_id)`: Lists session events
- `delete_session(app_name, user_id, session_id)`: Deletes session

#### Methods
- `append_event(session, event)`: Adds event to session
- `close_session(session)`: Closes session

### Session
Model representing a series of interactions.

#### Required Fields
- `id` (str): Unique session identifier
- `app_name` (str): Application name
- `user_id` (str): User identifier

#### Optional Fields
- `state` (dict): Session state
- `events` (list[Event]): Session events
- `last_update_time` (float): Last update timestamp

### State
Class for managing state with pending changes.

#### Constructor Parameters
- `value`: Current state value
- `delta`: Pending state changes

#### Methods
- `get(key, default=None)`: Get state value
- `update(delta)`: Apply state changes
- `has_delta()`: Check for pending changes
- `to_dict()`: Convert to dictionary

### DatabaseSessionService
Session service using database storage.

#### Constructor Parameters
- `db_url`: Database connection URL

### InMemorySessionService
In-memory session service for development.

### VertexAiSessionService
Session service using Vertex AI.

#### Constructor Parameters
- `project`: Google Cloud project
- `location`: Google Cloud location

## Usage Examples

```python
from google.adk.sessions import InMemorySessionService, Session, State

# Using in-memory service
service = InMemorySessionService()

# Create session
session = service.create_session(
    app_name="my_app",
    user_id="user123",
    state={"key": "value"}
)

# Add event
event = Event(...)
service.append_event(session, event)

# Managing state
state = State(
    value={"initial": "value"},
    delta={"update": "pending"}
)
state.update({"more": "changes"})
final_state = state.to_dict()

# Using database service
db_service = DatabaseSessionService(
    db_url="postgresql://user:pass@localhost/db"
)

# Using Vertex AI service
vertex_service = VertexAiSessionService(
    project="my-project",
    location="us-central1"
)
```

## State Management

### State Prefixes
- `APP_PREFIX`: 'app:' for application state
- `USER_PREFIX`: 'user:' for user state
- `TEMP_PREFIX`: 'temp:' for temporary state

### State Structure
```python
{
    "app:config": {...},     # Application state
    "user:preferences": {...},  # User state
    "temp:cache": {...}      # Temporary state
}
```

## Best Practices

1. **Session Management**
   - Use unique session IDs
   - Clean up old sessions
   - Handle concurrent access
   - Validate session data

2. **State Management**
   - Use appropriate prefixes
   - Handle state updates atomically
   - Validate state changes
   - Clean up temporary state

3. **Event Handling**
   - Order events properly
   - Handle event errors
   - Validate event data
   - Monitor event flow

4. **Service Selection**
   - Use InMemorySessionService for development
   - Use DatabaseSessionService for basic production
   - Use VertexAiSessionService for cloud deployment
   - Consider scalability needs

## Related Modules
- [Events](events.md): Event handling
- [Memory](memory.md): Memory management
- [Runners](runners.md): Execution management
