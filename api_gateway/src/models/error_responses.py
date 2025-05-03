"""
Standardized error response models for the TKR Multi-Agent Chat API Gateway.

These models ensure consistent error handling and responses across all API and Socket.IO endpoints.
"""

from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field
from enum import Enum


class ErrorSeverity(str, Enum):
    """Error severity levels to indicate the impact of errors."""
    INFO = "info"           # Informational errors that don't impact functionality
    WARNING = "warning"     # Warnings that may affect some functionality
    ERROR = "error"         # Serious errors that prevent expected functionality
    CRITICAL = "critical"   # Critical failures that affect system stability


class ErrorCategory(str, Enum):
    """Categories of errors to help with error grouping and handling."""
    VALIDATION = "validation"       # Input validation errors 
    AUTHORIZATION = "authorization" # Authentication/authorization errors
    RESOURCE = "resource"           # Resource not found or unavailable
    CONNECTION = "connection"       # Connection or network issues
    AGENT = "agent"                 # Agent-specific errors (LLM, tools, etc)
    ADK = "adk"                     # ADK-related errors
    A2A = "a2a"                     # Agent-to-agent protocol errors
    DATABASE = "database"           # Database errors
    CONTEXT = "context"             # Context-handling errors
    GENERAL = "general"             # General application errors
    SOCKET = "socket"               # Socket.IO-specific errors
    TASK = "task"                   # Task-handling errors


class StandardErrorResponse(BaseModel):
    """
    Standard error response model to ensure consistency across all endpoints.
    
    This model is used for both REST API and WebSocket error responses.
    """
    error_code: str = Field(
        description="A unique code identifying the error type"
    )
    message: str = Field(
        description="Human-readable error message"
    )
    category: ErrorCategory = Field(
        default=ErrorCategory.GENERAL,
        description="Category of the error for grouping"
    )
    severity: ErrorSeverity = Field(
        default=ErrorSeverity.ERROR,
        description="Severity level of the error"
    )
    details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional error details when available"
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Request ID for tracking (if available)"
    )
    recoverable: bool = Field(
        default=True,
        description="Whether this error is potentially recoverable by retrying or changing input"
    )
    retry_after: Optional[int] = Field(
        default=None, 
        description="Seconds to wait before retrying (for recoverable errors)"
    )
    docs_url: Optional[str] = Field(
        default=None,
        description="URL to documentation for this error type"
    )

    class Config:
        schema_extra = {
            "example": {
                "error_code": "ADK_SESSION_FAILED",
                "message": "Failed to create ADK session for agent",
                "category": "adk",
                "severity": "error",
                "details": {
                    "agent_id": "chloe",
                    "session_id": "123456",
                    "reason": "Connection timeout"
                },
                "recoverable": True,
                "retry_after": 5
            }
        }


class SocketErrorResponseModel(StandardErrorResponse):
    """
    Socket.IO-specific error response model with additional fields.
    Extends the standard error response model.
    """
    reconnect_suggested: bool = Field(
        default=False,
        description="Whether the client should attempt to reconnect"
    )
    close_connection: bool = Field(
        default=False,
        description="Whether the server will close the connection after this error"
    )
    session_id: Optional[str] = Field(
        default=None, 
        description="The session ID associated with this Socket.IO connection"
    )
    agent_id: Optional[str] = Field(
        default=None,
        description="The agent ID associated with this Socket.IO connection"
    )

class SocketErrorResponse(Exception):
    """
    Exception class for Socket.IO errors that properly inherits from BaseException.
    Contains a response model with detailed error information.
    """
    def __init__(
        self,
        error_code: str,
        message: str,
        category: ErrorCategory = ErrorCategory.SOCKET,
        severity: ErrorSeverity = ErrorSeverity.ERROR,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        reconnect_suggested: bool = False,
        close_connection: bool = False,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None
    ):
        self.model = SocketErrorResponseModel(
            error_code=error_code,
            message=message,
            category=category,
            severity=severity,
            details=details,
            request_id=request_id,
            reconnect_suggested=reconnect_suggested,
            close_connection=close_connection,
            session_id=session_id,
            agent_id=agent_id
        )
        self.error_code = error_code
        self.message = message
        self.reconnect_suggested = reconnect_suggested
        self.close_connection = close_connection
        self.session_id = session_id
        self.agent_id = agent_id
        
        # Call the base Exception constructor with the message
        super().__init__(message)

    class Config:
        schema_extra = {
            "example": {
                "error_code": "SOCKET_CONNECTION_TIMEOUT",
                "message": "Socket.IO connection timed out",
                "category": "socket",
                "severity": "error",
                "details": {
                    "timeout_seconds": 60
                },
                "session_id": "session_123",
                "agent_id": "chloe",
                "reconnect_suggested": True,
                "close_connection": True
            }
        }


class TaskErrorResponse(StandardErrorResponse):
    """
    Task-specific error response for A2A protocol task handling.
    Extends the standard error response.
    """
    task_id: str = Field(
        description="The task ID associated with this error"
    )
    task_status: Optional[str] = Field(
        default=None,
        description="The current task status after the error"
    )

    class Config:
        schema_extra = {
            "example": {
                "error_code": "TASK_CREATION_FAILED",
                "message": "Failed to create task",
                "category": "task",
                "severity": "error",
                "details": {
                    "agents": ["agent1", "agent2"],
                    "reason": "Invalid task description"
                },
                "task_id": "task_123456",
                "task_status": "failed"
            }
        }


# Common error codes
class ErrorCodes:
    """Common error codes used across the application."""
    # General errors
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    
    # Database errors
    DB_CONNECTION_ERROR = "DB_CONNECTION_ERROR"
    DB_QUERY_ERROR = "DB_QUERY_ERROR"
    
    # ADK errors
    ADK_NOT_AVAILABLE = "ADK_NOT_AVAILABLE"
    ADK_SESSION_FAILED = "ADK_SESSION_FAILED"
    ADK_AGENT_NOT_FOUND = "ADK_AGENT_NOT_FOUND"
    ADK_RUNNER_ERROR = "ADK_RUNNER_ERROR"
    
    # Socket.IO errors
    SOCKET_CONNECTION_ERROR = "SOCKET_CONNECTION_ERROR"
    SOCKET_MESSAGE_ERROR = "SOCKET_MESSAGE_ERROR"
    SOCKET_TIMEOUT = "SOCKET_TIMEOUT"
    
    # A2A errors
    A2A_TASK_ERROR = "A2A_TASK_ERROR"
    A2A_MESSAGE_ERROR = "A2A_MESSAGE_ERROR"
    
    # Context errors
    CONTEXT_NOT_FOUND = "CONTEXT_NOT_FOUND"
    CONTEXT_SHARING_ERROR = "CONTEXT_SHARING_ERROR"


# Define factory functions for creating common error responses

def create_not_found_error(resource_type: str, resource_id: str) -> StandardErrorResponse:
    """Create a standardized not found error."""
    return StandardErrorResponse(
        error_code=ErrorCodes.NOT_FOUND,
        message=f"{resource_type} not found: {resource_id}",
        category=ErrorCategory.RESOURCE,
        severity=ErrorSeverity.ERROR,
        details={
            "resource_type": resource_type,
            "resource_id": resource_id
        }
    )


def create_socket_error(
    error_code: str,
    message: str,
    session_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    reconnect_suggested: bool = True,
    close_connection: bool = False,
    severity: ErrorSeverity = ErrorSeverity.ERROR
) -> SocketErrorResponse:
    """Create a standardized Socket.IO error response."""
    return SocketErrorResponse(
        error_code=error_code,
        message=message,
        category=ErrorCategory.SOCKET,
        severity=severity,
        details=details,
        session_id=session_id,
        agent_id=agent_id,
        reconnect_suggested=reconnect_suggested,
        close_connection=close_connection
    )


def create_adk_error(
    error_code: str,
    message: str,
    agent_id: Optional[str] = None,
    session_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    recoverable: bool = True
) -> StandardErrorResponse:
    """Create a standardized ADK error response."""
    error_details = details or {}
    if agent_id:
        error_details["agent_id"] = agent_id
    if session_id:
        error_details["session_id"] = session_id
        
    return StandardErrorResponse(
        error_code=error_code,
        message=message,
        category=ErrorCategory.ADK,
        severity=severity,
        details=error_details,
        recoverable=recoverable
    )


def create_task_error(
    error_code: str,
    message: str,
    task_id: str,
    task_status: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    severity: ErrorSeverity = ErrorSeverity.ERROR
) -> TaskErrorResponse:
    """Create a standardized task error response."""
    return TaskErrorResponse(
        error_code=error_code,
        message=message,
        category=ErrorCategory.TASK,
        severity=severity,
        details=details,
        task_id=task_id,
        task_status=task_status
    )