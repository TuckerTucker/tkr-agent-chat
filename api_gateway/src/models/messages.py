"""
Message models for the API Gateway.

Defines the structure of messages exchanged between:
- Frontend and Gateway
- Gateway and Agents
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum

class MessageType(str, Enum):
    USER = "user"
    AGENT = "agent"
    SYSTEM = "system"
    ERROR = "error"

class MessagePart(BaseModel):
    """
    A part of a message (text, file, or structured data).
    Based on A2A protocol's Part interface.
    """
    type: str = Field(..., description="Type of content (text, file, data)")
    content: Any = Field(..., description="The actual content")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")

class Message(BaseModel):
    """
    A message in the chat system.
    Based on A2A protocol's Message interface.
    """
    type: MessageType
    agent_id: Optional[str] = Field(default=None, description="ID of the agent (for agent messages)")
    session_id: Optional[str] = Field(default=None, description="Session ID for conversation tracking")
    parts: List[MessagePart] = Field(default_factory=list, description="Message content parts")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")

class ChatSession(BaseModel):
    """
    Represents an active chat session.
    """
    id: str = Field(..., description="Unique session identifier")
    title: Optional[str] = Field(default=None, description="Chat session title")
    created_at: str = Field(..., description="ISO datetime when session was created")
    active_agents: List[str] = Field(default_factory=list, description="IDs of agents in this session")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional session metadata")

class ErrorResponse(BaseModel):
    """
    Standard error response format.
    Based on A2A protocol's ErrorMessage interface.
    """
    code: int = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional error details")
