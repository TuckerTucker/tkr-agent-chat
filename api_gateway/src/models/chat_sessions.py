from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from ..database import Base

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    session_type = Column(String, default="chat")  # chat, task, etc.
    session_metadata = Column(JSON, nullable=True)  # Store session configuration, preferences, etc.
    
    # Relationships
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan", lazy="selectin")
    tasks = relationship("A2ATask", back_populates="session", cascade="all, delete-orphan", overlaps="a2a_tasks")
    shared_contexts = relationship("SharedContext", back_populates="session")

    def __repr__(self):
        return f"<ChatSession(id='{self.id}', title='{self.title}')>"
