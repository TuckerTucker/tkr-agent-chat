"""
REST API routes for the API Gateway.

Provides endpoints for:
- Agent metadata and management
- Chat session management
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..models.messages import ChatSession, Message, ErrorResponse
from ..services.chat_service import chat_service

router = APIRouter()

# Session Management

@router.post("/sessions", response_model=ChatSession)
async def create_session(title: Optional[str] = None):
    """Create a new chat session."""
    return chat_service.create_session(title)

@router.get("/sessions/{session_id}", response_model=ChatSession)
async def get_session(session_id: str):
    """Get details of a specific chat session."""
    session = chat_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post("/sessions/{session_id}/agents/{agent_id}")
async def add_agent_to_session(session_id: str, agent_id: str):
    """Add an agent to a chat session."""
    success = chat_service.add_agent_to_session(session_id, agent_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Session or agent not found"
        )
    return {"status": "success"}

# Session History

class MessageResponse(BaseModel):
    messages: List[Message]

@router.get("/sessions/{session_id}/messages", response_model=MessageResponse)
async def get_session_messages(session_id: str):
    """Get message history for a chat session."""
    session = chat_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # TODO: Implement message history retrieval
    return MessageResponse(messages=[])

# System Status

class SystemStatus(BaseModel):
    status: str
    active_sessions: int
    available_agents: List[str]

@router.get("/status", response_model=SystemStatus)
async def get_system_status():
    """Get current system status."""
    return SystemStatus(
        status="operational",
        active_sessions=len(chat_service.sessions),
        available_agents=list(chat_service.agent_instances.keys())
    )
