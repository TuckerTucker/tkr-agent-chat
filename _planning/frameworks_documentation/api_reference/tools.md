# Tools Module

The `google.adk.tools` module provides integration with external tools and APIs.

## Overview

This module contains components for integrating external tools, functions, and APIs with agents. It includes base classes for implementing tools, built-in tools for common operations, and utilities for working with APIs.

## Classes

### BaseTool
Abstract base class for all tools.

#### Fields
- `name` (str): Tool name
- `description` (str): Tool description
- `is_long_running` (bool): Whether tool runs asynchronously

### APIHubToolset
Generates tools from API Hub resources.

#### Constructor Parameters
- `apihub_resource_name`: Resource name in format "projects/{project}/locations/{location}/apis/{api}"
- `access_token` (Optional): Access token
- `service_account_json` (Optional): Service account credentials
- `name` (Optional): Tool name
- `description` (Optional): Tool description
- `lazy_load_spec` (Optional): Whether to load spec lazily
- `auth_scheme` (Optional): Authentication scheme
- `auth_credential` (Optional): Authentication credentials
- `apihub_client` (Optional): Custom API Hub client

### FunctionTool
Wraps a Python function as a tool.

#### Fields
- `func`: Function to wrap

#### Methods
- `run_async(args, tool_context)`: Executes function asynchronously

### LongRunningFunctionTool
Tool for asynchronous long-running operations.

#### Usage
```python
# Define long-running function
async def long_operation():
    # ... time-consuming task ...
    return result

# Create tool
tool = LongRunningFunctionTool(long_operation)
```

### ExampleTool
Tool for adding few-shot examples to LLM requests.

#### Fields
- `examples`: Examples to add to requests

### VertexAiSearchTool
Built-in tool for Vertex AI Search.

#### Fields
- `data_store_id`: Vertex AI search data store ID
- `search_engine_id`: Search engine ID

### ToolContext
Context for tool invocation.

#### Fields
- `invocation_context`: Invocation context
- `function_call_id` (Optional): Function call identifier
- `event_actions` (Optional): Event actions

## Usage Examples

```python
from google.adk.tools import FunctionTool, LongRunningFunctionTool, APIHubToolset

# Simple function tool
def greet(name):
    return f"Hello, {name}!"

greeting_tool = FunctionTool(greet)

# Long-running tool
async def process_data(data):
    # ... time-consuming processing ...
    return results

processing_tool = LongRunningFunctionTool(process_data)

# API Hub integration
api_tools = APIHubToolset(
    apihub_resource_name="projects/my-project/locations/us-central1/apis/weather-api",
    service_account_json=service_account_creds
)
```

## Tool Development

### Creating Custom Tools
```python
from google.adk.tools import BaseTool

class CustomTool(BaseTool):
    def __init__(self, name, description):
        super().__init__(name=name, description=description)
        
    async def run_async(self, args, tool_context):
        # Implement tool logic
        return result
```

### Authentication Flow
```python
# Tool with authentication
async def secure_operation(tool_context):
    auth = await tool_context.request_auth()
    if auth:
        # Use auth credentials
        return result
```

## Best Practices

1. **Tool Design**
   - Keep tools focused and single-purpose
   - Handle errors gracefully
   - Document tool behavior
   - Validate inputs properly

2. **Long-Running Operations**
   - Use LongRunningFunctionTool for extended tasks
   - Implement proper status updates
   - Handle timeouts appropriately
   - Clean up resources

3. **API Integration**
   - Use APIHubToolset for API management
   - Handle rate limits
   - Cache responses when appropriate
   - Monitor API usage

4. **Authentication**
   - Secure credential handling
   - Implement proper auth flows
   - Refresh tokens as needed
   - Log authentication issues

## Related Modules
- [Agents](agents.md): Agent implementation
- [Events](events.md): Event handling
- [Models](models.md): Model integration
