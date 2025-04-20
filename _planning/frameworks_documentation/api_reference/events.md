# Events Module

The `google.adk.events` module provides mechanisms for handling events within the agent lifecycle.

## Overview

This module contains components for managing events in conversations between agents and users. Events represent various types of interactions, including messages, function calls, and state changes.

## Classes

### Event
Represents an event in a conversation between agents and users.

#### Required Fields
- `author` (str): "user" or agent name indicating who created the event
- `id` (str): Unique identifier for the event
- `timestamp` (float): Event timestamp

#### Optional Fields
- `invocation_id` (str): Invocation ID of the event
- `branch` (str): Branch path in agent hierarchy (e.g., "agent_1.agent_2.agent_3")
- `long_running_tool_ids` (set[str]): IDs of long-running function calls
- `actions` (EventActions): Actions associated with the event

#### Methods
- `get_function_calls()`: Returns list of function calls in the event
- `get_function_responses()`: Returns list of function responses
- `has_trailing_code_execution_result()`: Checks for trailing code execution
- `is_final_response()`: Checks if event is final agent response
- `new_id()`: Generates new event ID

### EventActions
Represents actions attached to an event.

#### Fields
- `skip_summarization` (bool): Skip function response summarization
- `state_delta` (dict): State updates to apply
- `artifact_delta` (dict): Artifact version updates
- `transfer_to_agent` (str): Target agent for transfer
- `escalate` (bool): Escalate to higher-level agent
- `requested_auth_configs` (dict): Authentication configurations

## Usage Examples

```python
from google.adk.events import Event, EventActions

# Create a basic event
event = Event(
    author="search_agent",
    id=Event.new_id(),
    timestamp=time.time()
)

# Create event with actions
event = Event(
    author="search_agent",
    actions=EventActions(
        state_delta={"search_complete": True},
        transfer_to_agent="summarize_agent"
    )
)

# Check event properties
if event.is_final_response():
    print("Agent completed response")

# Get function calls
function_calls = event.get_function_calls()
for call in function_calls:
    print(f"Function called: {call.name}")
```

## Event Flow

1. **Event Creation**
   - Events are created by agents or users
   - Each event has a unique ID and timestamp
   - Events can contain content and actions

2. **Event Processing**
   - Events flow through the agent system
   - Actions trigger state changes
   - Function calls/responses are tracked

3. **Event Branching**
   - Events can flow between agents
   - Branch paths track agent hierarchy
   - Transfers and escalations modify flow

## Best Practices

1. **Event Management**
   - Use unique IDs for all events
   - Track event timestamps accurately
   - Handle long-running operations properly

2. **Action Handling**
   - Use state deltas for incremental updates
   - Track artifact versions carefully
   - Handle transfers and escalations gracefully

3. **Authentication**
   - Configure auth properly for tools
   - Handle auth requests appropriately
   - Secure sensitive credentials

4. **Event Flow**
   - Maintain clear agent hierarchies
   - Handle transfers cleanly
   - Process events in order

## Related Modules
- [Agents](agents.md): Agent implementation
- [Sessions](sessions.md): Session management
- [Tools](tools.md): Tool integration
