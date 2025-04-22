"""
Data model for chat sessions.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base

class ChatSession(Base):
    """SQLAlchemy model for a chat session."""
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=True)
    session_metadata = Column(JSON, nullable=True)  # Additional session metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
    shared_contexts = relationship("SharedContext", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ChatSession(id='{self.id}' title='{self.title}')>"
