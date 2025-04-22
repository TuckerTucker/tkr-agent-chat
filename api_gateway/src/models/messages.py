"""
Data models for the API Gateway.

Defines:
- SQLAlchemy models for database persistence (ChatSession, Message).
- Pydantic models for API validation (ErrorResponse).
- Enums for message types and roles.
- Support for A2A protocol features.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum

# SQLAlchemy Imports
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, JSON, Text, Integer, Enum as SQLAlchemyEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID # Use Text for SQLite compatibility if needed
from sqlalchemy.sql import func

# Pydantic Imports (for API validation, keep ErrorResponse)
from pydantic import BaseModel, Field

# Local Imports
from ..database import Base # Import Base from database setup

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

# --- SQLAlchemy Models ---

class Message(Base):
    """SQLAlchemy model for a message."""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    message_uuid = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False, index=True)
    type = Column(SQLAlchemyEnum(MessageType), nullable=False)
    role = Column(SQLAlchemyEnum(MessageRole), nullable=True)  # Role in A2A communication
    agent_id = Column(String, ForeignKey("agent_cards.id"), nullable=True, index=True)
    
    # Message content and metadata
    parts = Column(JSON, nullable=False)  # Message content parts
    message_metadata = Column(JSON, nullable=True)  # Includes task_id for A2A messages
    
    # Timing information
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # A2A protocol fields
    in_reply_to = Column(String, ForeignKey("messages.message_uuid"), nullable=True)
    context_refs = Column(JSON, nullable=True)  # References to relevant context
    capabilities_used = Column(JSON, nullable=True)  # Capabilities used in message

    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    agent = relationship("AgentCard", backref="messages")
    parent = relationship(
        "Message",
        remote_side=[message_uuid],
        backref="replies",
        foreign_keys=[in_reply_to]
    )

    def __repr__(self):
        return f"<Message(id={self.id}, type='{self.type}', session_id='{self.session_id}')>"


# --- Pydantic Models (for API Validation) ---
# Keep ErrorResponse, potentially add others for request/response bodies if needed

class ErrorResponse(BaseModel):
    """
    Standard error response format.
    """
    code: int = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional error details")

# You might want Pydantic models that mirror the SQLAlchemy models
# for request validation and response serialization, excluding relationships
# or sensitive fields. Example:

class ChatSessionCreate(BaseModel):
    title: Optional[str] = None

class ChatSessionRead(BaseModel):
    id: str
    title: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True # Updated from orm_mode for Pydantic v2

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
    created_at: datetime
    updated_at: Optional[datetime]
    in_reply_to: Optional[str]
    context_refs: Optional[List[Dict[str, Any]]]
    capabilities_used: Optional[List[str]]

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    """Schema for creating a new message."""
    type: MessageType
    role: Optional[MessageRole]
    agent_id: Optional[str]
    parts: List[Dict[str, Any]]
    message_metadata: Optional[Dict[str, Any]] = None
    in_reply_to: Optional[str] = None
    context_refs: Optional[List[Dict[str, Any]]] = None
    capabilities_used: Optional[List[str]] = None
