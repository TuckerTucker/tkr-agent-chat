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

# Import standardized message schema
from .message_schema import (
    MessageType as SocketMessageType,
    BaseMessage as SocketBaseMessage,
    Message as SocketMessage,
    UserTextMessage,
    AgentTextMessage
)

# --- Legacy Enums (for database compatibility) ---

class MessageType(str, Enum):
    """Types of messages in the system (DB storage format)."""
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
    """Model for a message in database storage."""
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

    def to_socket_message(self) -> SocketMessage:
        """Convert database message to socket message format."""
        # Extract content from parts
        content = ""
        if self.parts:
            for part in self.parts:
                if part.get("type") == "text":
                    content += part.get("content", "")
        
        # Build common base message fields
        base_fields = {
            "id": self.message_uuid,
            "session_id": self.session_id,
            "timestamp": self.created_at or datetime.utcnow().isoformat(),
            "content": content,
            "in_reply_to": self.in_reply_to,
            "metadata": self.message_metadata
        }
        
        # Add message type specific fields
        if self.type == MessageType.USER:
            return UserTextMessage(
                **base_fields,
                type=SocketMessageType.TEXT,
                from_user=True,
                to_agent=self.agent_id
            )
        elif self.type == MessageType.AGENT:
            return AgentTextMessage(
                **base_fields,
                type=SocketMessageType.TEXT,
                from_agent=self.agent_id,
                streaming=self.message_metadata.get("streaming", False) if self.message_metadata else False,
                turn_complete=self.message_metadata.get("turn_complete", True) if self.message_metadata else True
            )
        else:
            # Default to generic socket base message
            return SocketBaseMessage(
                **base_fields,
                type=SocketMessageType.SYSTEM
            )

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
    
    def to_socket_message(self) -> SocketMessage:
        """Convert read message to socket message format."""
        msg = Message(
            id=self.id,
            message_uuid=self.message_uuid,
            session_id=self.session_id,
            type=self.type,
            role=self.role,
            agent_id=self.agent_id,
            parts=self.parts,
            message_metadata=self.message_metadata,
            created_at=self.created_at,
            updated_at=self.updated_at,
            in_reply_to=self.in_reply_to,
            context_refs=self.context_refs,
            capabilities_used=self.capabilities_used
        )
        return msg.to_socket_message()
