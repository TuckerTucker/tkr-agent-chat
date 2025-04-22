"""
Data models for the API Gateway.

Defines:
- Pydantic models for API validation
- Enums for message types and roles
- Support for A2A protocol features
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field

# --- Enums ---

class MessageType(str, Enum):
    """Types of messages in the system."""
    USER = "user"
    AGENT = "agent"
    SYSTEM = "system"
    ERROR = "error"
    TASK = "task"  # For A2A task-related messages

class MessageRole(str, Enum):
    """Roles for messages in A2A communication."""
    INITIATOR = "initiator"
    RESPONDER = "responder"
    OBSERVER = "observer"
    COORDINATOR = "coordinator"

# --- API Models ---

class ErrorResponse(BaseModel):
    """Standard error response format."""
    code: int = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional error details")

class Message(BaseModel):
    """Model for a message."""
    id: Optional[int] = None
    message_uuid: str
    session_id: str
    type: MessageType
    role: Optional[MessageRole] = None
    agent_id: Optional[str] = None
    parts: List[Dict[str, Any]]
    message_metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    in_reply_to: Optional[str] = None
    context_refs: Optional[List[Dict[str, Any]]] = None
    capabilities_used: Optional[List[str]] = None

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    """Schema for creating a new message."""
    type: MessageType
    role: Optional[MessageRole] = None
    agent_id: Optional[str] = None
    parts: List[Dict[str, Any]]
    message_metadata: Optional[Dict[str, Any]] = None
    in_reply_to: Optional[str] = None
    context_refs: Optional[List[Dict[str, Any]]] = None
    capabilities_used: Optional[List[str]] = None

class MessageRead(BaseModel):
    """Schema for reading message data."""
    id: int
    message_uuid: str
    session_id: str
    type: MessageType
    role: Optional[MessageRole]
    agent_id: Optional[str]
    parts: List[Dict[str, Any]]
    message_metadata: Optional[Dict[str, Any]]
    created_at: str
    updated_at: Optional[str]
    in_reply_to: Optional[str]
    context_refs: Optional[List[Dict[str, Any]]]
    capabilities_used: Optional[List[str]]

    class Config:
        from_attributes = True
