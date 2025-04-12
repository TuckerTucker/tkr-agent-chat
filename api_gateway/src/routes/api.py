"""
REST API routes for the API Gateway.

Provides endpoints for:
- Agent metadata (handled in agents.py)
- Chat session management (CRUD)
- Message history retrieval
"""

import logging
from typing import List, Optional

# FastAPI & SQLAlchemy Imports
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

# Local Imports
from ..database import get_db
from ..services.chat_service import ChatService # Import the class
from ..models.messages import ( # Import DB and Pydantic models
    ChatSession,
    Message,
    ChatSessionCreate,
    ChatSessionRead,
    MessageRead,
    ErrorResponse
)
# Agent related imports are likely in agents.py now

router = APIRouter()
logger = logging.getLogger(__name__)

# Instantiate service here for simplicity, or use FastAPI dependency injection
# For now, we'll instantiate within routes as methods require the db session
# chat_service = ChatService() # Remove global instance

# --- Session Management ---

@router.post(
    "/sessions",
    response_model=ChatSessionRead,
    summary="Create a new chat session",
    tags=["Sessions"]
)
async def create_session_endpoint(
    session_data: Optional[ChatSessionCreate] = None, # Allow optional title in body
    db: AsyncSession = Depends(get_db)
):
    """Creates a new chat session in the database."""
    chat_service = ChatService() # Instantiate service
    title = session_data.title if session_data else None
    try:
        session = await chat_service.create_session(db=db, title=title)
        logger.info(f"API: Created session {session.id}")
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
async def list_sessions_endpoint(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Retrieves a list of chat sessions from the database."""
    chat_service = ChatService() # Instantiate service
    sessions = await chat_service.get_sessions(db=db, skip=skip, limit=limit)
    return sessions

@router.get(
    "/sessions/{session_id}",
    response_model=ChatSessionRead,
    summary="Get details of a specific chat session",
    tags=["Sessions"],
    responses={404: {"description": "Session not found"}}
)
async def get_session_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Gets details for a specific chat session by its ID."""
    chat_service = ChatService() # Instantiate service
    session = await chat_service.get_session(db=db, session_id=session_id)
    if not session:
        logger.warning(f"API: Session not found: {session_id}")
        raise HTTPException(status_code=404, detail="Session not found")
    return session

# Removed POST /sessions/{session_id}/agents/{agent_id} as it's no longer relevant

# --- Session History ---

@router.get(
    "/sessions/{session_id}/messages",
    response_model=List[MessageRead],
    summary="Get message history for a chat session",
    tags=["Messages"],
    responses={404: {"description": "Session not found"}}
)
async def get_session_messages_endpoint(
    session_id: str,
    skip: int = 0,
    limit: int = 1000, # Default to a larger limit for messages
    db: AsyncSession = Depends(get_db)
):
    """Retrieves the message history for a specific chat session."""
    chat_service = ChatService() # Instantiate service
    # Service method already checks if session exists
    messages = await chat_service.get_messages(db=db, session_id=session_id, skip=skip, limit=limit)
    # The service returns [] if session not found, so no 404 needed here unless required
    # if not messages and not await chat_service.get_session(db, session_id):
    #     raise HTTPException(status_code=404, detail="Session not found")
    return messages


# --- System Status (Simplified) ---
# Removed active_sessions count as it's less meaningful now

# class SystemStatus(BaseModel):
#     status: str
#     # available_agents: List[str] # Agent info likely comes from agents.py endpoint

# @router.get("/status", response_model=SystemStatus, tags=["System"])
# async def get_system_status():
#     """Get current system status (simplified)."""
#     # Agent loading happens at startup, need access to the loaded agents
#     # This endpoint might be better placed elsewhere or removed if agent info
#     # is served by agents.py
#     # For now, return a basic status
#     return SystemStatus(
#         status="operational",
#         # available_agents=list(chat_service.agent_instances.keys()) # Needs access to service instance
#     )

# Note: Agent-related endpoints (like listing available agents) should be in agents.py
