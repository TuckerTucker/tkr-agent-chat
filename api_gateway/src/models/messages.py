"""
Data models for the API Gateway.

Defines:
- SQLAlchemy models for database persistence (ChatSession, Message).
- Pydantic models for API validation (ErrorResponse).
- Enums for message types.
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
    USER = "user"
    AGENT = "agent"
    SYSTEM = "system"
    ERROR = "error" # Keep for potential system/error messages in DB

# --- SQLAlchemy Models ---

class ChatSession(Base):
    """SQLAlchemy model for a chat session."""
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # metadata = Column(JSON, nullable=True) # Optional: Store extra session metadata if needed

    # Relationship to messages (one-to-many)
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<ChatSession(id={self.id}, title='{self.title}')>"

class Message(Base):
    """SQLAlchemy model for a message."""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True) # Auto-incrementing integer PK is simpler for messages
    message_uuid = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4())) # Keep a UUID for external reference if needed
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False, index=True)
    type = Column(SQLAlchemyEnum(MessageType), nullable=False)
    agent_id = Column(String, nullable=True, index=True) # ID of the agent (for agent messages)
    # Store parts as JSON - requires JSON support in DB (SQLite supports JSON)
    # Note: Querying inside the JSON structure can be database-specific.
    parts = Column(JSON, nullable=False)
    message_metadata = Column(JSON, nullable=True) # Renamed from metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to session (many-to-one)
    session = relationship("ChatSession", back_populates="messages")

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
    id: int
    message_uuid: str
    session_id: str
    type: MessageType
    agent_id: Optional[str]
    parts: List[Dict[str, Any]] # Represent parts as dicts for API
    message_metadata: Optional[Dict[str, Any]] # Renamed from metadata
    created_at: datetime

    class Config:
        from_attributes = True # Updated from orm_mode for Pydantic v2
