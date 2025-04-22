from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base
from .chat_sessions import ChatSession

class SharedContext(Base):
    __tablename__ = "shared_contexts"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    source_agent_id = Column(String, ForeignKey("agent_cards.id"))
    target_agent_id = Column(String, ForeignKey("agent_cards.id"))
    context_type = Column(String)
    content = Column(JSON)  # The shared context data
    context_metadata = Column(JSON)  # Additional context metadata
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)
    
    # Relationships
    session = relationship("ChatSession", back_populates="shared_contexts")
    
    # SQLite-compatible check constraint for context_type
    __table_args__ = (
        CheckConstraint(
            "context_type IN ('full', 'relevant', 'summary')",
            name="context_type_check"
        ),
    )
