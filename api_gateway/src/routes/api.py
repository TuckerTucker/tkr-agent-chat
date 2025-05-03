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
    title = session_data.title if session_data else None
    try:
        session = chat_service.create_session(title=title)
        logger.info(f"API: Created session {session['id']}")
        return session
    except Exception as e:
        logger.error(f"Error creating session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create session")

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
            
            return PaginatedMessagesResponse(
                items=messages,
                pagination=pagination
            )
        
        # Otherwise return simple list for backward compatibility
        return result["items"] if isinstance(result, dict) else result
    
    except HTTPException:
        # Re-raise HTTP exceptions for proper handling
        raise
    except Exception as e:
        # Log and convert any other errors to HTTPException
        logger.error(f"Error retrieving messages for session {session_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve messages: {str(e)}")
