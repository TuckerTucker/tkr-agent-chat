# Memory Module

The `google.adk.memory` module provides components for managing agent memory and state.

## Overview

This module contains services for storing and retrieving session information that can be used to provide context for agent queries. It includes both in-memory implementations for prototyping and production-ready implementations using Vertex AI RAG.

## Classes

### BaseMemoryService
Abstract base class for memory services.

#### Abstract Methods
- `add_session_to_memory(session)`: Adds a session to memory storage
  - Parameters:
    - `session`: The session to add
  - Note: A session may be added multiple times during its lifetime

- `search_memory(app_name, user_id, query)`: Searches for matching sessions
  - Parameters:
    - `app_name`: Application name
    - `user_id`: User identifier
    - `query`: Search query
  - Returns: SearchMemoryResponse containing matching memories

### InMemoryMemoryService
An in-memory implementation for prototyping purposes.

#### Fields
- `session_events` (dict[str, list[Event]]): Session storage
  - Keys: `app_name/user_id/session_id`
  - Values: List of events in session

#### Notes
- Uses keyword matching instead of semantic search
- Not recommended for production use
- Useful for development and testing

### VertexAiRagMemoryService
A production-ready implementation using Vertex AI RAG for storage and retrieval.

#### Constructor Parameters
- `rag_corpus`: Name of Vertex AI RAG corpus
  - Format: `projects/{project}/locations/{location}/ragCorpora/{rag_corpus_id}`
  - Or simply: `{rag_corpus_id}`
- `similarity_top_k`: Number of contexts to retrieve
- `vector_distance_threshold`: Maximum vector distance for results (default: 10)

#### Methods
Implements all BaseMemoryService methods using Vertex AI RAG:
- `add_session_to_memory`: Stores session in RAG corpus
- `search_memory`: Uses semantic search via rag.retrieval_query

## Usage Examples

```python
from google.adk.memory import InMemoryMemoryService, VertexAiRagMemoryService

# For development/testing
memory = InMemoryMemoryService()
memory.add_session_to_memory(session)
results = memory.search_memory(
    app_name="my_app",
    user_id="user123",
    query="previous conversations about weather"
)

# For production
memory = VertexAiRagMemoryService(
    rag_corpus="projects/my-project/locations/us-central1/ragCorpora/my-corpus",
    similarity_top_k=5,
    vector_distance_threshold=8.0
)
memory.add_session_to_memory(session)
results = memory.search_memory(
    app_name="my_app",
    user_id="user123",
    query="previous conversations about weather"
)
```

## Memory Storage Format

Sessions are stored with this structure:

```python
{
    "app_name/user_id/session_id": [
        Event(...),  # Session events in chronological order
        Event(...),
        Event(...)
    ]
}
```

## Best Practices

1. **Memory Management**
   - Clear old sessions periodically
   - Monitor memory usage
   - Index important information
   - Handle concurrent access

2. **Search Optimization**
   - Use semantic search in production
   - Tune similarity thresholds
   - Optimize query performance
   - Cache frequent queries

3. **Data Organization**
   - Structure sessions logically
   - Tag important information
   - Maintain clean indexes
   - Archive old data

4. **Production Deployment**
   - Use VertexAiRagMemoryService
   - Configure appropriate limits
   - Monitor performance
   - Implement backup strategy

## Related Modules
- [Sessions](sessions.md): Session management
- [Events](events.md): Event handling
- [Models](models.md): Model integration
