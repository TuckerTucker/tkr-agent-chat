"""
Error handling service for the TKR Multi-Agent Chat API Gateway.

This service provides utilities for standardized error handling, logging,
and response creation across REST API and Socket.IO endpoints.
"""

import json
import logging
import traceback
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Union, Type
from fastapi import HTTPException, status
from pydantic import ValidationError

from ..models.error_responses import (
    StandardErrorResponse, 
    SocketErrorResponse,
    SocketErrorResponseModel,
    TaskErrorResponse,
    ErrorCodes,
    ErrorCategory,
    ErrorSeverity,
    create_socket_error,
    create_adk_error,
    create_task_error,
    create_not_found_error
)

# Import the centralized logger service
from .logger_service import logger_service

# Set up logger with improved context tracking
logger = logger_service.get_logger(__name__)


class ErrorService:
    """Service for standardized error handling across the application."""
    
    @staticmethod
    async def send_socket_error(
        sio: any,
        sid: str,
        error: Union[SocketErrorResponse, SocketErrorResponseModel, StandardErrorResponse, Exception],
        log_error: bool = True,
        close_connection: bool = False,
        namespace: str = '/'
    ) -> None:
        """
        Send a standardized error response over a Socket.IO connection.
        
        Args:
            sio: The Socket.IO server instance
            sid: The Socket.IO session ID
            error: The error to send (can be a SocketErrorResponse, SocketErrorResponseModel, StandardErrorResponse, or Exception)
            log_error: Whether to log the error
            close_connection: Whether to close the Socket.IO connection after sending the error
            namespace: The Socket.IO namespace to use
        """
        # The response model that will be sent to the client
        error_model: Union[SocketErrorResponseModel, StandardErrorResponse]
        
        # Generate a request ID for tracking
        request_id = str(uuid.uuid4())
        
        # Handle different error types
        if isinstance(error, SocketErrorResponse):
            # For our custom SocketErrorResponse exception, use its model
            error_model = error.model
            # Update request ID if not present
            if not error_model.request_id:
                error_model.request_id = request_id
                
        elif isinstance(error, (StandardErrorResponse, SocketErrorResponseModel)):
            error_model = error
            # Update request ID if not present
            if not error_model.request_id:
                error_model.request_id = request_id
                
            # If StandardErrorResponse was passed but we need SocketErrorResponseModel features
            if isinstance(error, StandardErrorResponse) and not isinstance(error, SocketErrorResponseModel):
                # Convert to SocketErrorResponseModel
                error_model = SocketErrorResponseModel(
                    **error.dict(),
                    close_connection=close_connection
                )
        
        elif isinstance(error, Exception):
            # Create a SocketErrorResponseModel from the exception
            error_message = str(error)
            error_code = ErrorCodes.INTERNAL_ERROR
            category = ErrorCategory.GENERAL
            severity = ErrorSeverity.ERROR
            details = {"exception_type": type(error).__name__}
            
            # Handle specific exception types
            if isinstance(error, ValidationError):
                error_code = ErrorCodes.VALIDATION_ERROR
                category = ErrorCategory.VALIDATION
                error_message = "Validation error in request data"
                details["validation_errors"] = error.errors()
            
            error_model = SocketErrorResponseModel(
                error_code=error_code,
                message=error_message,
                category=category,
                severity=severity,
                details=details,
                request_id=request_id,
                close_connection=close_connection
            )
        
        # Log the error if requested
        if log_error:
            logger.error(
                f"Socket.IO Error [{error_model.error_code}]: {error_model.message} "
                f"(request_id: {error_model.request_id})", 
                extra={
                    "error_details": error_model.details,
                    "request_id": error_model.request_id,
                    "socket_id": sid,
                    "namespace": namespace
                }
            )
            if isinstance(error, Exception) and not isinstance(error, (SocketErrorResponse, StandardErrorResponse, SocketErrorResponseModel)):
                logger.error(f"Exception details: {traceback.format_exc()}")
        
        # Send the error response using Socket.IO
        try:
            await sio.emit('error', error_model.dict(), room=sid, namespace=namespace)
            
            # Close the connection if requested
            if close_connection or getattr(error_model, 'close_connection', False):
                await sio.disconnect(sid, namespace=namespace)
        except Exception as send_error:
            logger.error(f"Failed to send error over Socket.IO: {send_error}")

    @staticmethod
    def create_http_exception(
        error: Union[StandardErrorResponse, Exception],
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    ) -> HTTPException:
        """
        Create a FastAPI HTTPException from a StandardErrorResponse or Exception.
        
        Args:
            error: The error to convert
            status_code: The HTTP status code to use
            
        Returns:
            HTTPException: A FastAPI HTTPException
        """
        if isinstance(error, StandardErrorResponse):
            # Map error categories to appropriate status codes if not explicitly provided
            if status_code == status.HTTP_500_INTERNAL_SERVER_ERROR:
                if error.category == ErrorCategory.VALIDATION:
                    status_code = status.HTTP_400_BAD_REQUEST
                elif error.category == ErrorCategory.RESOURCE:
                    status_code = status.HTTP_404_NOT_FOUND
                elif error.category == ErrorCategory.AUTHORIZATION:
                    status_code = status.HTTP_401_UNAUTHORIZED
            
            return HTTPException(
                status_code=status_code,
                detail=error.dict()
            )
        else:
            # Create a StandardErrorResponse from the exception
            error_response = StandardErrorResponse(
                error_code=ErrorCodes.INTERNAL_ERROR,
                message=str(error),
                category=ErrorCategory.GENERAL,
                severity=ErrorSeverity.ERROR,
                details={"exception_type": type(error).__name__},
                request_id=str(uuid.uuid4())
            )
            
            # Handle specific exception types
            if isinstance(error, ValidationError):
                error_response.error_code = ErrorCodes.VALIDATION_ERROR
                error_response.category = ErrorCategory.VALIDATION
                error_response.message = "Validation error in request data"
                error_response.details = {"validation_errors": error.errors()}
                status_code = status.HTTP_400_BAD_REQUEST
            
            return HTTPException(
                status_code=status_code,
                detail=error_response.dict()
            )
    
    @staticmethod
    def log_error(
        error: Union[StandardErrorResponse, SocketErrorResponse, SocketErrorResponseModel, Exception],
        level: str = "error",
        include_traceback: bool = True,
        extra: Optional[Dict[str, Any]] = None,
        context_id: Optional[str] = None,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None
    ) -> None:
        """
        Log an error with standardized formatting and enhanced context.
        
        Args:
            error: The error to log
            level: The logging level to use
            include_traceback: Whether to include the traceback for exceptions
            extra: Additional data to include in the log
            context_id: Optional correlation ID for the error context
            session_id: Optional session ID related to the error
            agent_id: Optional agent ID related to the error
        """
        # Create context dictionary with common fields
        context = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "context_id": context_id or str(uuid.uuid4()),
            "session_id": session_id,
            "agent_id": agent_id
        }
        
        # Add extra data if provided
        if extra:
            context.update(extra)
        
        # Add detailed error information based on error type
        if isinstance(error, SocketErrorResponse):
            # For our custom exception class, use its model field
            model = error.model
            log_message = f"[{model.error_code}] {model.message}"
            context.update({
                "error_code": model.error_code,
                "error_category": str(model.category),
                "error_severity": str(model.severity),
                "error_details": model.details,
                "request_id": model.request_id or context["context_id"],
                "recoverable": model.recoverable,
                "reconnect_suggested": model.reconnect_suggested,
                "close_connection": model.close_connection,
                "error_type": "socket_exception"
            })
            
        elif isinstance(error, StandardErrorResponse):
            log_message = f"[{error.error_code}] {error.message}"
            context.update({
                "error_code": error.error_code,
                "error_category": str(error.category),
                "error_severity": str(error.severity),
                "error_details": error.details,
                "request_id": error.request_id or context["context_id"],
                "recoverable": error.recoverable,
                "error_type": "structured"
            })
            
            # Add SocketResponseModel-specific fields if applicable
            if isinstance(error, SocketErrorResponseModel):
                context.update({
                    "reconnect_suggested": error.reconnect_suggested,
                    "close_connection": error.close_connection,
                    "error_type": "socket_model"
                })
                
            # Add Task-specific fields if applicable
            elif isinstance(error, TaskErrorResponse):
                context.update({
                    "task_id": error.task_id,
                    "task_status": error.task_status,
                    "error_type": "task"
                })
                
        else:
            # Handle regular exceptions
            log_message = f"Exception: {str(error)}"
            context.update({
                "exception_type": type(error).__name__,
                "error_type": "exception"
            })
        
        # Log using the enhanced context logging from logger_service
        logger_service.log_with_context(
            logger=logger,
            level=level,
            message=log_message,
            context=context,
            exc_info=error if include_traceback and not isinstance(error, (StandardErrorResponse, SocketErrorResponse)) else None
        )
        
        # Additionally log the full traceback at debug level if requested
        if include_traceback and isinstance(error, Exception) and not isinstance(error, (StandardErrorResponse, SocketErrorResponse)):
            logger_service.log_with_context(
                logger=logger,
                level="debug",
                message="Detailed exception traceback",
                context={
                    "context_id": context["context_id"],
                    "traceback": traceback.format_exc()
                }
            )


# Create a singleton instance
error_service = ErrorService()