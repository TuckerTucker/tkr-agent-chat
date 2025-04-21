"""
Models for Agent-to-Agent (A2A) protocol implementation.

Defines:
- AgentCard: Stores agent metadata and capabilities
- A2ATask: Manages agent-to-agent communication tasks
- TaskStatus: Enum for task states
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum

from sqlalchemy import (
    Column, String, DateTime, ForeignKey, JSON, Text, Integer, 
    Enum as SQLAlchemyEnum, Boolean, Table, ForeignKeyConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pydantic import BaseModel, Field

from ..database import Base

# --- Enums ---

class TaskStatus(str, Enum):
    """Status states for A2A tasks."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TaskPriority(str, Enum):
    """Priority levels for A2A tasks."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

# --- Association Tables ---

agent_capabilities = Table(
    'agent_capabilities',
    Base.metadata,
    Column('agent_id', String, ForeignKey('agent_cards.id'), primary_key=True),
    Column('capability', String, primary_key=True)
)

task_agents = Table(
    'task_agents',
    Base.metadata,
    Column('task_id', String, ForeignKey('a2a_tasks.id'), primary_key=True),
    Column('agent_id', String, ForeignKey('agent_cards.id'), primary_key=True)
)

# --- SQLAlchemy Models ---

class AgentCard(Base):
    """
    SQLAlchemy model for storing agent metadata and capabilities.
    """
    __tablename__ = "agent_cards"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    color = Column(String)  # RGB/HEX color code
    icon_path = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Store additional configuration as JSON
    config = Column(JSON, nullable=True)
    
    # Many-to-many relationship with capabilities
    capabilities = relationship(
        "str", 
        secondary=agent_capabilities,
        collection_class=set
    )
    
    # Relationship to tasks (many-to-many)
    tasks = relationship(
        "A2ATask",
        secondary=task_agents,
        back_populates="agents"
    )

    def __repr__(self):
        return f"<AgentCard(id='{self.id}', name='{self.name}')>"

class A2ATask(Base):
    """
    SQLAlchemy model for managing agent-to-agent communication tasks.
    """
    __tablename__ = "a2a_tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False)
    
    # Task details
    title = Column(String, nullable=False)
    description = Column(Text)
    status = Column(SQLAlchemyEnum(TaskStatus), nullable=False, default=TaskStatus.PENDING)
    priority = Column(SQLAlchemyEnum(TaskPriority), nullable=False, default=TaskPriority.MEDIUM)
    
    # Timing information
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Task configuration and results
    config = Column(JSON, nullable=True)  # Task-specific configuration
    context = Column(JSON, nullable=True)  # Shared context between agents
    result = Column(JSON, nullable=True)   # Task results
    
    # Relationships
    session = relationship("ChatSession", backref="tasks")
    agents = relationship(
        "AgentCard",
        secondary=task_agents,
        back_populates="tasks"
    )
    
    # Link to related messages
    messages = relationship(
        "Message",
        primaryjoin="and_(Message.session_id==A2ATask.session_id, "
                   "Message.message_metadata.contains({'task_id': A2ATask.id}))",
        viewonly=True
    )

    def __repr__(self):
        return f"<A2ATask(id='{self.id}', title='{self.title}', status='{self.status}')>"

# --- Pydantic Models ---

class AgentCardCreate(BaseModel):
    """Schema for creating a new agent card."""
    id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon_path: Optional[str] = None
    capabilities: Optional[List[str]] = Field(default_factory=list)
    config: Optional[Dict[str, Any]] = None

class AgentCardRead(BaseModel):
    """Schema for reading agent card data."""
    id: str
    name: str
    description: Optional[str]
    color: Optional[str]
    icon_path: Optional[str]
    is_active: bool
    capabilities: List[str]
    config: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class A2ATaskCreate(BaseModel):
    """Schema for creating a new A2A task."""
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    agent_ids: List[str]
    config: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = None

class A2ATaskRead(BaseModel):
    """Schema for reading A2A task data."""
    id: str
    session_id: str
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    created_at: datetime
    updated_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    config: Optional[Dict[str, Any]]
    context: Optional[Dict[str, Any]]
    result: Optional[Dict[str, Any]]

    class Config:
        from_attributes = True
