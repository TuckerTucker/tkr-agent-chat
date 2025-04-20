# Runners Module

The `google.adk.runners` module provides execution environments and orchestration for agents.

## Overview

This module contains components for running and managing agent execution. It handles message processing, event generation, and interaction with various services like artifact storage, session management, and memory.

## Classes

### Runner
Main class for running agents.

#### Constructor Parameters
- `app_name` (str): Application name
- `agent` (BaseAgent): Root agent to run
- `artifact_service` (Optional[BaseArtifactService]): Service for artifact handling
- `session_service` (BaseSessionService): Service for session management
- `memory_service` (Optional[BaseMemoryService]): Service for memory management

#### Methods
- `run(user_id, session_id, new_message, run_config)`: Synchronous execution
  - Note: For testing/development only
  - Returns: Generator[Event, None, None]

- `run_async(user_id, session_id, new_message, run_config)`: Asynchronous execution
  - Returns: AsyncGenerator[Event, None]

- `run_live(session, live_request_queue, run_config)`: Live mode execution
  - Experimental feature
  - Returns: AsyncGenerator[Event, None]

- `close_session(session)`: Closes session and adds to memory

### InMemoryRunner
Lightweight runner implementation for testing and development.

#### Features
- Uses in-memory implementations for all services
- Self-contained environment
- Suitable for testing and prototyping

#### Constructor Parameters
- `agent` (BaseAgent): Root agent to run
- `app_name` (str): Application name (default: "InMemoryRunner")

## Usage Examples

```python
from google.adk.runners import Runner, InMemoryRunner
from google.adk.runners.config import RunConfig

# Using standard Runner
runner = Runner(
    app_name="my_app",
    agent=root_agent,
    session_service=session_service,
    artifact_service=artifact_service,
    memory_service=memory_service
)

# Async execution
async for event in runner.run_async(
    user_id="user123",
    session_id="session456",
    new_message=message,
    run_config=RunConfig()
):
    print(event)

# Using InMemoryRunner for testing
test_runner = InMemoryRunner(
    agent=test_agent,
    app_name="test_runner"
)

# Synchronous execution for testing
for event in test_runner.run(
    user_id="test_user",
    session_id="test_session",
    new_message=test_message
):
    print(event)
```

## Run Configuration

```python
RunConfig(
    speech_config=None,
    response_modalities=None,
    save_input_blobs_as_artifacts=False,
    support_cfc=False,
    streaming_mode=StreamingMode.NONE,
    output_audio_transcription=None,
    max_llm_calls=500
)
```

## Best Practices

1. **Runner Selection**
   - Use InMemoryRunner for testing
   - Use standard Runner for production
   - Configure services appropriately
   - Handle errors gracefully

2. **Execution Mode**
   - Use run_async for production
   - Use run for simple testing
   - Consider run_live for streaming
   - Monitor execution progress

3. **Resource Management**
   - Close sessions properly
   - Clean up artifacts
   - Monitor memory usage
   - Handle timeouts

4. **Service Integration**
   - Configure services properly
   - Handle service failures
   - Monitor service health
   - Implement fallbacks

## Related Modules
- [Agents](agents.md): Agent implementation
- [Sessions](sessions.md): Session management
- [Memory](memory.md): Memory management
- [Artifacts](artifacts.md): Artifact handling
