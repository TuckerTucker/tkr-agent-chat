# Models Module

The `google.adk.models` module provides integration with underlying language models.

## Overview

This module defines interfaces and implementations for interacting with Large Language Models (LLMs). It includes base classes for implementing model support and concrete implementations for specific models like Gemini.

## Classes

### BaseLlm
Base class for all LLM implementations.

#### Required Fields
- `model` (str): Name of the LLM (e.g., "gemini-1.5-flash")

#### Methods
- `connect(llm_request)`: Creates live connection to LLM
  - Returns: BaseLlmConnection
- `generate_content_async(llm_request, stream=False)`: Generates content
  - Parameters:
    - `llm_request`: Request to send to LLM
    - `stream`: Whether to stream responses
  - Returns: AsyncGenerator[LlmResponse, None]
- `supported_models()`: Returns list of supported model patterns

### Gemini
Implementation for Gemini models.

#### Fields
- `model` (str): Name of Gemini model (default: "gemini-1.5-flash")

#### Methods
- `connect(llm_request)`: Connects to Gemini model
- `generate_content_async(llm_request, stream=False)`: Sends request to Gemini
- `supported_models()`: Lists supported Gemini models
- `api_client`: Property providing API client

### LLMRegistry
Registry for managing LLM implementations.

#### Static Methods
- `new_llm(model)`: Creates new LLM instance
  - Parameters:
    - `model`: Model name
  - Returns: BaseLlm instance
- `register(llm_cls)`: Registers new LLM class
  - Parameters:
    - `llm_cls`: Class implementing the model
- `resolve(model)`: Resolves model name to BaseLlm subclass
  - Parameters:
    - `model`: Model name
  - Returns: BaseLlm subclass
  - Raises: ValueError if model not found

## Usage Examples

```python
from google.adk.models import Gemini, LLMRegistry

# Using Gemini model directly
model = Gemini(model="gemini-1.5-flash")
async for response in model.generate_content_async(
    llm_request,
    stream=True
):
    print(response.content)

# Using LLMRegistry
# Register custom model
class CustomLLM(BaseLlm):
    @classmethod
    def supported_models(cls):
        return ["custom-.*"]

LLMRegistry.register(CustomLLM)

# Create model instance
model = LLMRegistry.new_llm("gemini-1.5-flash")
```

## Model Configuration

### Gemini Models
```python
{
    "model": "gemini-1.5-flash",
    "temperature": 0.7,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 1024
}
```

## Best Practices

1. **Model Selection**
   - Choose appropriate model for task
   - Consider model capabilities
   - Monitor model performance
   - Handle model errors gracefully

2. **Request Management**
   - Use streaming for long responses
   - Implement proper error handling
   - Monitor token usage
   - Handle rate limits

3. **Response Processing**
   - Validate model outputs
   - Handle partial responses
   - Implement retry logic
   - Monitor response quality

4. **Resource Management**
   - Close connections properly
   - Implement timeouts
   - Pool connections when appropriate
   - Monitor resource usage

## Related Modules
- [Agents](agents.md): Agent implementation
- [Events](events.md): Event handling
- [Memory](memory.md): State management
