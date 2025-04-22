"""
Data model for agent metadata and capabilities.
"""

from typing import Optional, Dict, List, Any
from pydantic import BaseModel

class AgentCard(BaseModel):
    """Model for agent metadata."""
    id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon_path: Optional[str] = None
    is_active: Optional[bool] = None
    capabilities: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True  # For compatibility with both dict and SQLite Row objects
