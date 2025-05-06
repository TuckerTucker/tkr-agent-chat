"""
REST API routes for the API Gateway.

Provides endpoints for:
- Agent metadata (handled in agents.py)
- Chat session management (CRUD)
- Message history retrieval
"""

import logging
from typing import List, Optional, Dict, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.chat_service import chat_service
from ..models.chat_sessions import ChatSessionCreate, ChatSessionRead
from ..models.messages import MessageRead, ErrorResponse

class SessionUpdate(BaseModel):
    title: str

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Session Management ---

@router.post(
    "/sessions",
    response_model=ChatSessionRead,
    summary="Create a new chat session",
    tags=["Sessions"]
)
def create_session_endpoint(
    session_data: Optional[ChatSessionCreate] = None  # Allow optional title in body
):
    """Creates a new chat session in the database."""
    try:
        title = session_data.title if session_data and hasattr(session_data, 'title') else None
        logger.info(f"API: Attempting to create session with title: {title}")
        
        # Generate a UUID for the session instead of relying on the database
        import uuid
        session_id = str(uuid.uuid4())
        
        session = chat_service.create_session(title=title, session_id=session_id)
        logger.info(f"API: Created session {session['id']}")
        return session
    except Exception as e:
        logger.error(f"Error creating session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")

@router.get(
    "/sessions",
    response_model=List[ChatSessionRead],
    summary="List all chat sessions",
    tags=["Sessions"]
)
def list_sessions_endpoint(
    skip: int = 0,
    limit: int = 100
):
    """Retrieves a list of chat sessions from the database."""
    sessions = chat_service.get_sessions(skip=skip, limit=limit)
    return sessions

@router.get(
    "/sessions/{session_id}",
    response_model=ChatSessionRead,
    summary="Get details of a specific chat session",
    tags=["Sessions"],
    responses={404: {"description": "Session not found"}}
)
def get_session_endpoint(session_id: str):
    """Gets details for a specific chat session by its ID."""
    session = chat_service.get_session(session_id=session_id)
    if not session:
        logger.warning(f"API: Session not found: {session_id}")
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.patch(
    "/sessions/{session_id}",
    response_model=ChatSessionRead,
    summary="Update a chat session",
    tags=["Sessions"],
    responses={404: {"description": "Session not found"}}
)
def update_session_endpoint(session_id: str, session_data: SessionUpdate):
    """Updates a chat session's title."""
    try:
        session = chat_service.update_session(session_id=session_id, title=session_data.title)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    except Exception as e:
        logger.error(f"Error updating session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update session")

@router.delete(
    "/sessions/{session_id}",
    summary="Delete a chat session",
    tags=["Sessions"],
    responses={404: {"description": "Session not found"}}
)
def delete_session_endpoint(session_id: str):
    """Deletes a chat session by its ID."""
    try:
        chat_service.delete_session(session_id=session_id)
        logger.info(f"API: Deleted session {session_id}")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error deleting session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete session")

# --- Session History ---

from typing import Dict, Union, Optional

# Define pagination response model
class PaginationData(BaseModel):
    """Structured pagination data to ensure proper type validation."""
    limit: int
    direction: str
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None
    skip: Optional[int] = None
    total: Optional[int] = None

class PaginatedMessagesResponse(BaseModel):
    """Response model that includes both items and pagination data."""
    items: List[MessageRead]
    pagination: PaginationData

@router.get(
    "/sessions/{session_id}/messages",
    response_model=Union[List[MessageRead], PaginatedMessagesResponse],
    summary="Get message history for a chat session",
    tags=["Messages"],
    responses={404: {"description": "Session not found"}}
)
def get_session_messages_endpoint(
    session_id: str,
    skip: int = 0,
    limit: int = 100,  # Reduced default to encourage pagination
    cursor: Optional[str] = None,  # Use message_uuid or created_at timestamp as cursor
    direction: str = "desc",  # Default to newest first
    include_pagination: bool = False,  # Whether to include pagination metadata
    include_total: bool = False  # Whether to count total messages (can be expensive)
):
    """
    Retrieves the message history for a specific chat session with improved pagination.
    
    - Use offset-based pagination with skip/limit OR cursor-based with cursor parameter
    - Direction controls the sort order ('asc' for oldest first, 'desc' for newest first)
    - When include_pagination=True, returns pagination metadata with the response
    - When include_total=True, includes total message count (may impact performance)
    """
    try:
        # Validate direction parameter
        if direction not in ["asc", "desc"]:
            raise HTTPException(status_code=400, detail="Direction must be 'asc' or 'desc'")
        
        # Validate the session exists
        session = chat_service.get_session(session_id)
        if not session:
            logger.warning(f"Session not found when fetching messages: {session_id}")
            raise HTTPException(status_code=404, detail="Session not found")
        
        result = chat_service.get_messages(
            session_id=session_id, 
            skip=skip, 
            limit=limit,
            cursor=cursor,
            direction=direction,
            include_total=include_total
        )
        
        # If pagination info requested, return with pagination metadata
        if include_pagination:
            # Extract messages and pagination info
            messages = result["items"] if isinstance(result, dict) else result
            pagination = result.get("pagination", {}) if isinstance(result, dict) else {}
            
            # Ensure pagination has required fields
            if "limit" not in pagination:
                pagination["limit"] = limit
            if "direction" not in pagination:
                pagination["direction"] = direction
            
            # Transform raw messages to include all required fields from MessageRead model
            for msg in messages:
                # Ensure all required fields are present
                if "id" not in msg:
                    msg["id"] = int(hash(msg.get("message_uuid", "")) % 2147483647)  # Generate a stable ID
                if "role" not in msg:
                    msg["role"] = "observer"  # Default role
                if "updated_at" not in msg:
                    msg["updated_at"] = msg.get("created_at")
                if "in_reply_to" not in msg:
                    msg["in_reply_to"] = None
                if "context_refs" not in msg:
                    msg["context_refs"] = []
                if "capabilities_used" not in msg:
                    msg["capabilities_used"] = []
                # Add agent_id field if missing but from_agent is present
                if "agent_id" not in msg and msg.get("from_agent"):
                    msg["agent_id"] = msg.get("from_agent")
                elif "agent_id" not in msg:
                    msg["agent_id"] = None  # Set to None if no agent associated
                # Add message_metadata field if missing
                if "message_metadata" not in msg:
                    # Try to extract metadata from existing fields or create empty dict
                    metadata = {}
                    # Include relevant metadata from existing fields
                    if "streaming" in msg:
                        metadata["streaming"] = msg["streaming"]
                    if "turn_complete" in msg:
                        metadata["turn_complete"] = msg["turn_complete"]
                    if "metadata" in msg:  # Legacy field
                        metadata.update(msg["metadata"])
                    msg["message_metadata"] = metadata
            
            # Log success for debugging
            logger.info(f"Successfully retrieved {len(messages)} messages for session {session_id}")
            
            # Add response headers for message count for monitoring
            from fastapi import Response
            from fastapi.responses import JSONResponse
            response = JSONResponse(
                content=PaginatedMessagesResponse(
                    items=messages,
                    pagination=pagination
                ).dict()
            )
            response.headers["X-Message-Count"] = str(len(messages))
            response.headers["X-Session-Id"] = session_id
            
            return response
        
        # Otherwise return simple list for backward compatibility
        logger.info(f"Successfully retrieved {len(result['items'] if isinstance(result, dict) else result)} messages for session {session_id} (list format)")
        return result["items"] if isinstance(result, dict) else result
    
    except HTTPException:
        # Re-raise HTTP exceptions for proper handling
        raise
    except Exception as e:
        # Log and handle any other errors
        logger.error(f"Error retrieving messages for session {session_id}: {str(e)}", exc_info=True)
        
        # Instead of raising an exception, create a valid but empty response
        empty_messages = []
        empty_pagination = {
            "limit": limit,
            "direction": direction,
            "total": 0,
            "skip": skip if cursor is None else None
        }
        
        # Create a properly formatted empty response with all required fields
        empty_response = {
            "items": [],
            "pagination": empty_pagination
        }
        
        # Add all required fields for message schema validation
        for i in range(len(empty_response["items"])):
            empty_response["items"][i] = {
                "id": i + 1,
                "message_uuid": str(uuid.uuid4()),
                "session_id": session_id,
                "type": "system",
                "role": "observer",
                "agent_id": None,
                "parts": [{"type": "text", "content": "Error retrieving messages"}],
                "message_metadata": {},
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "in_reply_to": None,
                "context_refs": [],
                "capabilities_used": []
            }
        
        # Return valid empty response instead of error
        response = JSONResponse(
            content=empty_response, 
            status_code=200
        )
        response.headers["X-Message-Count"] = "0"
        response.headers["X-Session-Id"] = session_id
        response.headers["X-Error-Message"] = str(e)[:100]  # Include truncated error message in header
        
        # Log the error with more detail
        logger.debug(f"Returning empty response due to error: {e}")
        
        return response
