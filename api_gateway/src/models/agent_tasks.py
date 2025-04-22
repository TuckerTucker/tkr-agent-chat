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
from pydantic import BaseModel, Field

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
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True

class A2ATaskCreate(BaseModel):
    """Schema for creating a new A2A task."""
    session_id: str
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
    created_at: str
    updated_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    config: Optional[Dict[str, Any]]
    context: Optional[Dict[str, Any]]
    result: Optional[Dict[str, Any]]
    agents: Optional[List[AgentCardRead]] = None

    class Config:
        from_attributes = True
