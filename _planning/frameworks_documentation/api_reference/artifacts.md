# Artifacts Module

The `google.adk.artifacts` module provides components for handling data and outputs generated during agent execution.

## Overview

This module contains services for managing artifacts (files and data) created or used by agents during their execution. It provides interfaces and implementations for storing, retrieving, and managing versioned artifacts.

## Classes

### BaseArtifactService
Abstract base class for artifact services.

#### Abstract Methods
- `delete_artifact(app_name, user_id, session_id, filename)`: Deletes an artifact
- `list_artifact_keys(app_name, user_id, session_id)`: Lists all artifact filenames within a session
- `list_versions(app_name, user_id, session_id, filename)`: Lists all versions of an artifact
- `load_artifact(app_name, user_id, session_id, filename, version=None)`: Gets an artifact from storage
- `save_artifact(app_name, user_id, session_id, filename, artifact)`: Saves an artifact to storage

### GcsArtifactService
An artifact service implementation using Google Cloud Storage (GCS).

#### Constructor Parameters
- `bucket_name`: The name of the GCS bucket to use
- `**kwargs`: Additional keyword arguments for the Google Cloud Storage client

#### Methods
Implements all methods from BaseArtifactService:
- `delete_artifact`: Deletes an artifact from GCS
- `list_artifact_keys`: Lists artifacts in a session from GCS
- `list_versions`: Lists versions of an artifact in GCS
- `load_artifact`: Loads an artifact from GCS
- `save_artifact`: Saves an artifact to GCS

### InMemoryArtifactService
An in-memory implementation of the artifact service for testing and development.

#### Fields
- `artifacts` (dict[str, list[Part]]): In-memory storage for artifacts

#### Methods
Implements all methods from BaseArtifactService using in-memory storage.

## Usage Examples

```python
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService

# Using GCS Artifact Service
gcs_service = GcsArtifactService(
    bucket_name="my-artifacts-bucket",
    project="my-project-id"
)

# Using In-Memory Artifact Service (for testing)
memory_service = InMemoryArtifactService()

# Save an artifact
revision_id = service.save_artifact(
    app_name="my_app",
    user_id="user123",
    session_id="session456",
    filename="output.txt",
    artifact=text_content
)

# Load an artifact
content = service.load_artifact(
    app_name="my_app",
    user_id="user123",
    session_id="session456",
    filename="output.txt"
)

# List artifacts in a session
artifacts = service.list_artifact_keys(
    app_name="my_app",
    user_id="user123",
    session_id="session456"
)
```

## Best Practices

1. **Storage Selection**
   - Use GcsArtifactService for production environments
   - Use InMemoryArtifactService for testing and development
   - Consider implementing custom services for other storage backends

2. **Artifact Management**
   - Use meaningful filenames for artifacts
   - Implement proper cleanup of old artifacts
   - Handle versioning appropriately

3. **Error Handling**
   - Handle storage service errors gracefully
   - Implement proper retry logic for transient failures
   - Validate artifacts before saving

4. **Security**
   - Ensure proper access controls on storage
   - Validate user and session IDs
   - Sanitize filenames and paths

## Related Modules
- [Sessions](sessions.md): Session management
- [Events](events.md): Event handling
- [Models](models.md): Model integration
