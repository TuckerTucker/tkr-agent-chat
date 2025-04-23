"""
REST API routes for the API Gateway.

Provides endpoints for:
- Agent metadata (handled in agents.py)
- Chat session management (CRUD)
- Message history retrieval
"""

import logging
from typing import List, Optional

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

@router.get(
    "/sessions/{session_id}/messages",
    response_model=List[MessageRead],
    summary="Get message history for a chat session",
    tags=["Messages"],
    responses={404: {"description": "Session not found"}}
)
def get_session_messages_endpoint(
    session_id: str,
    skip: int = 0,
    limit: int = 1000  # Default to a larger limit for messages
):
    """Retrieves the message history for a specific chat session."""
    messages = chat_service.get_messages(session_id=session_id, skip=skip, limit=limit)
    return messages
