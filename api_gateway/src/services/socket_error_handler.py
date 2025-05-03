"""
Error handling module for Socket.IO communications in TKR Multi-Agent Chat.

This module provides structured error handling, classification, recovery strategies,
and client notifications for Socket.IO connections.
"""

import json
import uuid
import logging
import traceback
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple, Union

from ..services.logger_service import logger_service
from ..services.error_service import error_service
from ..models.error_responses import ErrorCodes, ErrorCategory, ErrorSeverity

# Get a module-specific logger
logger = logger_service.get_logger(__name__)

# Error categories specific to Socket.IO
class SocketErrorCategory:
    CONNECTION = "connection"
    MESSAGE = "message"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    RATE_LIMIT = "rate_limit"
    PROTOCOL = "protocol"
    INTERNAL = "internal"
    CLIENT = "client"

# Error codes specific to Socket.IO
class SocketErrorCodes:
    # Connection errors
    CONNECTION_FAILED = "socket.connection.failed"
    CONNECTION_TIMEOUT = "socket.connection.timeout"
    CONNECTION_REJECTED = "socket.connection.rejected"
    CONNECTION_CLOSED = "socket.connection.closed"
    
    # Message errors
    MESSAGE_VALIDATION = "socket.message.validation"
    MESSAGE_DELIVERY = "socket.message.delivery"
    MESSAGE_TIMEOUT = "socket.message.timeout"
    MESSAGE_RATE_LIMIT = "socket.message.rate_limit"
    
    # Authentication errors
    AUTH_INVALID = "socket.auth.invalid"
    AUTH_EXPIRED = "socket.auth.expired"
    AUTH_REQUIRED = "socket.auth.required"
    
    # Authorization errors
    PERMISSION_DENIED = "socket.permission.denied"
    ROOM_ACCESS_DENIED = "socket.room.access_denied"
    NAMESPACE_ACCESS_DENIED = "socket.namespace.access_denied"
    
    # Protocol errors
    PROTOCOL_ERROR = "socket.protocol.error"
    INVALID_NAMESPACE = "socket.protocol.invalid_namespace"
    INVALID_EVENT = "socket.protocol.invalid_event"
    
    # Internal errors
    SERVER_ERROR = "socket.server.error"
    DATABASE_ERROR = "socket.server.database"
    BROADCAST_ERROR = "socket.server.broadcast"
    
    # Client errors
    CLIENT_ERROR = "socket.client.error"
    CLIENT_TIMEOUT = "socket.client.timeout"
    CLIENT_OFFLINE = "socket.client.offline"

# Standardized Socket.IO error response
class SocketErrorResponse:
    def __init__(
        self,
        error_code: str,
        message: str,
        category: str,
        severity: str = "error",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        recoverable: bool = True,
        retry_suggested: bool = False,
        context_id: Optional[str] = None,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None
    ):
        self.error_code = error_code
        self.message = message
        self.category = category
        self.severity = severity
        self.details = details or {}
        self.timestamp = datetime.utcnow().isoformat()
        self.request_id = request_id or str(uuid.uuid4())
        self.recoverable = recoverable
        self.retry_suggested = retry_suggested
        self.context_id = context_id
        self.session_id = session_id
        self.agent_id = agent_id
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format for JSON serialization."""
        return {
            "error_code": self.error_code,
            "message": self.message,
            "category": self.category,
            "severity": self.severity,
            "details": self.details,
            "timestamp": self.timestamp,
            "request_id": self.request_id,
            "recoverable": self.recoverable,
            "retry_suggested": self.retry_suggested,
            "context_id": self.context_id,
            "session_id": self.session_id,
            "agent_id": self.agent_id
        }
        
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())
        
    @classmethod
    def from_exception(
        cls,
        exception: Exception,
        category: str = SocketErrorCategory.INTERNAL,
        error_code: str = SocketErrorCodes.SERVER_ERROR,
        context: Optional[Dict[str, Any]] = None
    ) -> 'SocketErrorResponse':
        """Create an error response from an exception."""
        details = context or {}
        details["exception_type"] = type(exception).__name__
        details["exception_args"] = [str(arg) for arg in exception.args]
        
        # Add traceback for internal errors (but don't send to client)
        if category == SocketErrorCategory.INTERNAL:
            details["traceback"] = traceback.format_exc()
        
        return cls(
            error_code=error_code,
            message=str(exception),
            category=category,
            severity="error",
            details=details,
            recoverable=True,
            retry_suggested=False
        )

# Error handling registry - maps exception types to handlers
class SocketErrorHandler:
    def __init__(self):
        self.sio = None
        self.error_registry = {}
        self.default_error_handlers = {
            ConnectionError: self._handle_connection_error,
            TimeoutError: self._handle_timeout_error,
            ValueError: self._handle_validation_error,
            PermissionError: self._handle_permission_error,
            Exception: self._handle_general_exception
        }
        
    def initialize(self, sio):
        """Initialize with the Socket.IO server instance."""
        self.sio = sio
        return self
        
    def register_error_handler(self, exception_type, handler_func):
        """Register a custom error handler for an exception type."""
        self.error_registry[exception_type] = handler_func
        
    async def handle_error(
        self, 
        exc: Exception, 
        sid: Optional[str] = None, 
        namespace: str = '/',
        context: Optional[Dict[str, Any]] = None
    ) -> SocketErrorResponse:
        """
        Handle an exception and return a standardized error response.
        
        Args:
            exc: The exception to handle
            sid: Optional Socket.IO session ID for targeted response
            namespace: Socket.IO namespace
            context: Additional context information
            
        Returns:
            Standardized SocketErrorResponse
        """
        context = context or {}
        
        # Find the most specific handler
        handler = None
        for exc_type, handler_func in self.error_registry.items():
            if isinstance(exc, exc_type):
                handler = handler_func
                break
                
        # If no specific handler found, use default handlers
        if not handler:
            for exc_type, handler_func in self.default_error_handlers.items():
                if isinstance(exc, exc_type):
                    handler = handler_func
                    break
        
        # Use general exception handler if nothing else matched
        if not handler:
            handler = self._handle_general_exception
            
        # Call the handler to get error response
        error_response = handler(exc, context)
        
        # Log the error
        self._log_error(error_response)
        
        # Send error to client if SID provided
        if sid and self.sio:
            await self._send_error_to_client(error_response, sid, namespace)
            
        return error_response
        
    async def _send_error_to_client(
        self, 
        error_response: SocketErrorResponse, 
        sid: str,
        namespace: str = '/'
    ):
        """Send error response to the client."""
        if not self.sio:
            logger.error("Cannot send error to client: Socket.IO server not initialized")
            return
            
        try:
            # Remove server-only details like traceback before sending to client
            client_response = error_response.to_dict()
            if "traceback" in client_response.get("details", {}):
                del client_response["details"]["traceback"]
                
            # Send error event to client
            await self.sio.emit(
                "error", 
                client_response, 
                room=sid,
                namespace=namespace
            )
            logger.debug(f"Error sent to client {sid}: {error_response.error_code}")
        except Exception as e:
            logger.error(f"Failed to send error to client: {e}")
    
    def _log_error(self, error_response: SocketErrorResponse):
        """Log the error with appropriate severity."""
        severity = error_response.severity
        
        log_message = f"Socket.IO Error: [{error_response.error_code}] {error_response.message}"
        
        # Log with appropriate level
        if severity == "critical":
            logger.critical(log_message, extra={"error_details": error_response.to_dict()})
        elif severity == "error":
            logger.error(log_message, extra={"error_details": error_response.to_dict()})
        elif severity == "warning":
            logger.warning(log_message, extra={"error_details": error_response.to_dict()})
        else:
            logger.info(log_message, extra={"error_details": error_response.to_dict()})
        
        # Also log to error service for centralized tracking
        error_service.log_error(
            error=error_response.to_dict(),
            level=severity,
            context_id=error_response.context_id,
            include_traceback=True if "traceback" in error_response.details else False
        )
    
    def broadcast_error(
        self, 
        room: str, 
        error_code: str, 
        message: str,
        category: str = SocketErrorCategory.INTERNAL,
        severity: str = "error",
        details: Optional[Dict[str, Any]] = None,
        namespace: str = '/'
    ):
        """
        Create an error and broadcast it to all members of a room.
        
        Args:
            room: The room to broadcast to
            error_code: Error code
            message: Error message
            category: Error category
            severity: Error severity
            details: Additional error details
            namespace: Socket.IO namespace
        """
        if not self.sio:
            logger.error("Cannot broadcast error: Socket.IO server not initialized")
            return
            
        error = SocketErrorResponse(
            error_code=error_code,
            message=message,
            category=category,
            severity=severity,
            details=details
        )
        
        # Log the error
        self._log_error(error)
        
        # Broadcast to room
        try:
            client_response = error.to_dict()
            if "traceback" in client_response.get("details", {}):
                del client_response["details"]["traceback"]
                
            asyncio.create_task(
                self.sio.emit(
                    "error", 
                    client_response, 
                    room=room,
                    namespace=namespace
                )
            )
            logger.debug(f"Error broadcast to room {room}: {error.error_code}")
        except Exception as e:
            logger.error(f"Failed to broadcast error: {e}")
    
    # Default error handlers
    def _handle_connection_error(self, exc: Exception, context: Dict[str, Any]) -> SocketErrorResponse:
        """Handle connection-related errors."""
        return SocketErrorResponse(
            error_code=SocketErrorCodes.CONNECTION_FAILED,
            message=f"Connection error: {str(exc)}",
            category=SocketErrorCategory.CONNECTION,
            severity="error",
            details=context,
            recoverable=True,
            retry_suggested=True
        )
        
    def _handle_timeout_error(self, exc: Exception, context: Dict[str, Any]) -> SocketErrorResponse:
        """Handle timeout-related errors."""
        return SocketErrorResponse(
            error_code=SocketErrorCodes.CONNECTION_TIMEOUT,
            message=f"Connection timed out: {str(exc)}",
            category=SocketErrorCategory.CONNECTION,
            severity="warning",
            details=context,
            recoverable=True,
            retry_suggested=True
        )
        
    def _handle_validation_error(self, exc: Exception, context: Dict[str, Any]) -> SocketErrorResponse:
        """Handle validation errors."""
        return SocketErrorResponse(
            error_code=SocketErrorCodes.MESSAGE_VALIDATION,
            message=f"Validation error: {str(exc)}",
            category=SocketErrorCategory.MESSAGE,
            severity="warning",
            details=context,
            recoverable=True,
            retry_suggested=False
        )
        
    def _handle_permission_error(self, exc: Exception, context: Dict[str, Any]) -> SocketErrorResponse:
        """Handle permission and authorization errors."""
        return SocketErrorResponse(
            error_code=SocketErrorCodes.PERMISSION_DENIED,
            message=f"Permission denied: {str(exc)}",
            category=SocketErrorCategory.AUTHORIZATION,
            severity="warning",
            details=context,
            recoverable=False,
            retry_suggested=False
        )
        
    def _handle_general_exception(self, exc: Exception, context: Dict[str, Any]) -> SocketErrorResponse:
        """Handle general exceptions."""
        return SocketErrorResponse(
            error_code=SocketErrorCodes.SERVER_ERROR,
            message=f"Internal server error: {str(exc)}",
            category=SocketErrorCategory.INTERNAL,
            severity="error",
            details={
                **context,
                "exception_type": type(exc).__name__,
                "traceback": traceback.format_exc()
            },
            recoverable=True,
            retry_suggested=False
        )

# Create a singleton instance
socket_error_handler = SocketErrorHandler()