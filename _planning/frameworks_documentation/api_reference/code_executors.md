# Code Executors Module

The `google.adk.code_executors` module provides components for executing code snippets and managing runtime environments.

## Overview

This module enables agents to execute code blocks from model responses and incorporate the execution results into their final responses. It provides different execution environments with varying levels of security and isolation.

## Classes

### BaseCodeExecutor
Abstract base class for all code executors.

#### Fields
- `optimize_data_file` (bool): Process data files from model requests (supports text/csv)
- `stateful` (bool): Whether the executor maintains state between executions
- `error_retry_attempts` (int): Number of retry attempts for failed executions
- `code_block_delimiters` (List[tuple[str, str]]): Delimiters for identifying code blocks
- `execution_result_delimiters` (tuple[str, str]): Delimiters for formatting results

#### Abstract Methods
- `execute_code(invocation_context, code_execution_input)`: Executes code and returns results

### ContainerCodeExecutor
A code executor that uses a custom container for isolated code execution.

#### Fields
- `base_url` (str): Base URL of user-hosted Docker client
- `image` (str): Tag of predefined/custom image to run
- `docker_path` (str): Path to Dockerfile directory

#### Usage
```python
executor = ContainerCodeExecutor(
    image="python:3.9",
    base_url="unix://var/run/docker.sock"
)
```

### UnsafeLocalCodeExecutor
A code executor that runs code directly in the current local context.

#### Warning
This executor provides no isolation and should only be used for trusted code in development environments.

### VertexAiCodeExecutor
A code executor that uses Vertex AI Code Interpreter Extension.

#### Fields
- `resource_name` (str): Resource name of existing code interpreter extension

#### Usage
```python
executor = VertexAiCodeExecutor(
    resource_name="projects/123/locations/us-central1/extensions/456"
)
```

### CodeExecutorContext
Manages persistent context for code executors.

#### Methods
- `add_input_files(input_files)`: Add input files to context
- `get_input_files()`: Get input files from context
- `get_execution_id()`: Get session ID
- `get_error_count(invocation_id)`: Get error count for invocation
- `increment_error_count(invocation_id)`: Increment error count
- `reset_error_count(invocation_id)`: Reset error count

## Code Block Format

Code blocks are identified using delimiters. Default formats:

```python
# Python code block
```python
print("Hello World")
```

# Tool code block
```tool_code
some_tool_operation()
```
```

## Best Practices

1. **Security**
   - Use ContainerCodeExecutor for untrusted code
   - Avoid UnsafeLocalCodeExecutor in production
   - Set appropriate resource limits

2. **Error Handling**
   - Configure appropriate retry attempts
   - Handle execution timeouts
   - Validate code before execution

3. **State Management**
   - Use stateful executors judiciously
   - Clear state between sessions
   - Handle persistence appropriately

4. **Resource Management**
   - Clean up containers after use
   - Monitor resource usage
   - Implement appropriate timeouts

## Related Modules
- [Agents](agents.md): Agent implementation
- [Tools](tools.md): Tool integration
- [Models](models.md): Model integration
