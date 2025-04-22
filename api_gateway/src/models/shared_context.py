"""
Data model for shared context between agents.
"""

from typing import Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field

class ContextType(str, Enum):
    """Types of shared context."""
    FULL = "full"
    RELEVANT = "relevant"
    SUMMARY = "summary"

class SharedContext(BaseModel):
    """Model for shared context between agents."""
    id: str
    session_id: Optional[str] = None
    source_agent_id: str
    target_agent_id: str
    context_type: ContextType
    content: Dict[str, Any]
    context_metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    expires_at: Optional[str] = None

    class Config:
        from_attributes = True

class SharedContextCreate(BaseModel):
    """Schema for creating a new shared context."""
    session_id: Optional[str] = None
    source_agent_id: str
    target_agent_id: str
    context_type: ContextType
    content: Dict[str, Any]
    context_metadata: Optional[Dict[str, Any]] = None
    expires_at: Optional[str] = None

class SharedContextRead(BaseModel):
    """Schema for reading shared context data."""
    id: str
    session_id: Optional[str]
    source_agent_id: str
    target_agent_id: str
    context_type: ContextType
    content: Dict[str, Any]
    context_metadata: Optional[Dict[str, Any]]
    created_at: str
    expires_at: Optional[str]

    class Config:
        from_attributes = True
