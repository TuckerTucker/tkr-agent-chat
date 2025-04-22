"""
Data model for chat sessions.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel

class ChatSession(BaseModel):
    """Model for a chat session."""
    id: str
    title: Optional[str] = None
    session_type: Optional[str] = None
    session_metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

class ChatSessionCreate(BaseModel):
    """Schema for creating a new chat session."""
    title: Optional[str] = None
    session_type: Optional[str] = None
    session_metadata: Optional[Dict[str, Any]] = None

class ChatSessionRead(BaseModel):
    """Schema for reading chat session data."""
    id: str
    title: Optional[str]
    session_type: Optional[str]
    session_metadata: Optional[Dict[str, Any]]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True
