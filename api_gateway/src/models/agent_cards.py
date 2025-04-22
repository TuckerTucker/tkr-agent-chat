"""
Data model for agent metadata and capabilities.
"""

from sqlalchemy import Column, String, JSON
from sqlalchemy.orm import relationship

from database import Base

class AgentCard(Base):
    """SQLAlchemy model for agent metadata."""
    __tablename__ = "agent_cards"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(String)
    capabilities = Column(JSON)  # List of agent capabilities
    agent_metadata = Column(JSON)  # Additional agent metadata

    # Relationships for shared contexts
    # Use different relationship names to avoid conflicts
    outbound_contexts = relationship(
        "SharedContext",
        foreign_keys="SharedContext.source_agent_id",
        back_populates="source_agent"
    )
    inbound_contexts = relationship(
        "SharedContext",
        foreign_keys="SharedContext.target_agent_id",
        back_populates="target_agent"
    )

    def __repr__(self):
        """String representation of the agent card."""
        return f"<AgentCard(id='{self.id}', name='{self.name}')>"
