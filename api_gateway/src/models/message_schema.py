"""
Standardized Message Schema for TKR Multi-Agent Chat System

This module defines the canonical message formats used throughout the application
for communication between clients, agents, and the server.
"""

from enum import Enum
from typing import Dict, List, Optional, Union, Any
from pydantic import BaseModel, Field
from datetime import datetime


class MessageType(str, Enum):
    """Message types used in socket communication."""
    TEXT = "text"                     # Plain text message
    AGENT_MESSAGE = "agent_message"   # Agent-to-agent message
    SYSTEM = "system"                 # System notification
    ERROR = "error"                   # Error message
    CONTEXT_UPDATE = "context_update" # Context sharing
    TASK_UPDATE = "task_update"       # Task status update
    PING = "ping"                     # Connection check
    PONG = "pong"                     # Connection check response


class MessageStatus(str, Enum):
    """Message delivery status."""
    SENT = "sent"             # Message sent, not yet acknowledged
    DELIVERED = "delivered"   # Message delivered to recipient
    READ = "read"             # Message read by recipient
    ERROR = "error"           # Error during delivery
    PENDING = "pending"       # Message queued locally but not sent
    RETRYING = "retrying"     # Message delivery being retried


class SeverityLevel(str, Enum):
    """Severity levels for messages."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class MessagePart(BaseModel):
    """A part of a structured message."""
    type: str
    content: Any
    metadata: Optional[Dict[str, Any]] = None


class BaseMessage(BaseModel):
    """Base message model for all message types."""
    # Core fields (required in all messages)
    id: str
    type: MessageType
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    session_id: str

    # Optional fields (may be present based on message type)
    from_agent: Optional[str] = None
    to_agent: Optional[str] = None
    from_user: Optional[bool] = None
    content: Optional[Union[str, Dict[str, Any]]] = None
    in_reply_to: Optional[str] = None
    
    # Streaming-related fields
    streaming: Optional[bool] = None
    turn_complete: Optional[bool] = None
    
    # Additional metadata
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        """Pydantic model configuration."""
        from_attributes = True


class UserTextMessage(BaseMessage):
    """Message sent by a user."""
    type: MessageType = MessageType.TEXT
    from_user: bool = True
    content: str
    to_agent: Optional[str] = None


class AgentTextMessage(BaseMessage):
    """Text message sent by an agent."""
    type: MessageType = MessageType.TEXT
    from_agent: str
    content: str
    streaming: Optional[bool] = None
    turn_complete: Optional[bool] = None


class AgentToAgentMessage(BaseMessage):
    """Message sent from one agent to another."""
    type: MessageType = MessageType.AGENT_MESSAGE
    from_agent: str
    to_agent: str
    content: Any
    task_id: Optional[str] = None


class SystemMessage(BaseMessage):
    """System notification message."""
    type: MessageType = MessageType.SYSTEM
    content: str
    severity: Optional[str] = "info"


class ErrorMessage(BaseMessage):
    """Error message."""
    type: MessageType = MessageType.ERROR
    content: str
    error_code: Optional[str] = None
    error_details: Optional[Any] = None
    severity: Optional[str] = "error"
    recoverable: Optional[bool] = False


class ContextUpdateMessage(BaseMessage):
    """Context sharing message."""
    type: MessageType = MessageType.CONTEXT_UPDATE
    from_agent: str
    context_id: str
    context_data: Any
    target_agents: Optional[List[str]] = None


class TaskUpdateMessage(BaseMessage):
    """Task status update message."""
    type: MessageType = MessageType.TASK_UPDATE
    task_id: str
    status: Optional[str] = None
    action: Optional[str] = None
    result: Optional[Any] = None


class PingMessage(BaseMessage):
    """Connection check ping message."""
    type: MessageType = MessageType.PING


class PongMessage(BaseMessage):
    """Connection check pong message."""
    type: MessageType = MessageType.PONG


class MessageAcknowledgment(BaseModel):
    """Response acknowledgment for messages."""
    status: MessageStatus
    id: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    error_message: Optional[str] = None
    persisted_id: Optional[str] = None


# Message union type for validators
Message = Union[
    UserTextMessage, 
    AgentTextMessage, 
    AgentToAgentMessage,
    SystemMessage,
    ErrorMessage,
    ContextUpdateMessage,
    TaskUpdateMessage,
    PingMessage,
    PongMessage
]