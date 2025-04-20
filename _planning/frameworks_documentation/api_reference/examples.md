# Examples Module

The `google.adk.examples` module provides components for managing and using examples in agent training and operation.

## Overview

This module contains classes for providing and managing few-shot examples that can be used to guide agent behavior. It includes both base classes for implementing custom example providers and concrete implementations for specific use cases.

## Classes

### BaseExampleProvider
Abstract base class for example providers.

#### Abstract Methods
- `get_examples(query)`: Returns a list of examples for a given query
  - Parameters:
    - `query`: The query to get examples for
  - Returns: List of Example objects

### Example
A model representing a few-shot example.

#### Required Fields
- `input` (Content): The input content for the example
- `output` (list[Content]): The expected output content for the example

#### Example Schema
```json
{
  "input": {
    "parts": [
      {
        "text": "What is the weather like?"
      }
    ],
    "role": "user"
  },
  "output": [
    {
      "parts": [
        {
          "text": "The weather is sunny with a high of 75°F."
        }
      ],
      "role": "model"
    }
  ]
}
```

### VertexAiExampleStore
Provides examples from Vertex AI example store.

#### Constructor Parameters
- `examples_store_name`: Resource name of the Vertex example store
  - Format: `projects/{project}/locations/{location}/exampleStores/{example_store}`

#### Methods
- `get_examples(query)`: Retrieves examples matching the query from Vertex AI

## Usage Examples

```python
from google.adk.examples import Example, VertexAiExampleStore

# Create an example
example = Example(
    input=Content(
        parts=[Part.from_text("What is the capital of France?")],
        role="user"
    ),
    output=[
        Content(
            parts=[Part.from_text("The capital of France is Paris.")],
            role="model"
        )
    ]
)

# Use Vertex AI Example Store
store = VertexAiExampleStore(
    "projects/my-project/locations/us-central1/exampleStores/my-store"
)
examples = store.get_examples("geography questions")
```

## Example Store Format

Examples in a store should follow this structure:

```python
[
    Example(
        input=Content(...),  # User query/input
        output=[            # List of expected responses
            Content(...),   # Primary response
            Content(...)    # Alternative responses
        ]
    ),
    # More examples...
]
```

## Best Practices

1. **Example Selection**
   - Choose diverse examples
   - Cover edge cases
   - Include both positive and negative examples
   - Keep examples concise and clear

2. **Example Organization**
   - Group related examples
   - Tag examples for easy retrieval
   - Version examples appropriately
   - Document example purpose

3. **Example Quality**
   - Validate example format
   - Ensure consistent style
   - Review for accuracy
   - Update examples regularly

4. **Example Usage**
   - Match examples to context
   - Limit example count
   - Monitor example effectiveness
   - Rotate examples as needed

## Related Modules
- [Agents](agents.md): Agent implementation
- [Models](models.md): Model integration
- [Memory](memory.md): State management
