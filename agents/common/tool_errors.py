"""
Standardized tool error handling for agent tools.

This module provides:
- Error categories specifically for agent tools
- Standardized error response format
- Error code definitions
- Helper functions for creating tool error responses
"""

import logging
import traceback
from enum import Enum
from typing import Dict, Any, Optional, List, Union
from datetime import datetime

# Configure logger
logger = logging.getLogger("agents.common.tool_errors")

# Error categories specific to tools
class ToolErrorCategory(str, Enum):
    """Categories of errors that can occur in agent tools."""
    INVALID_INPUT = "invalid_input"      # Input validation errors
    MISSING_CREDENTIAL = "missing_credential"  # Missing API key or auth
    NETWORK = "network"           # Network-related errors
    TIMEOUT = "timeout"           # Request timeout
    RATE_LIMIT = "rate_limit"     # Rate limiting
    PERMISSION = "permission"     # Permission or access denied
    RESOURCE = "resource"         # Resource not found
    API = "api"                   # API-specific errors
    PARSING = "parsing"           # Data parsing errors
    INTERNAL = "internal"         # Internal tool errors
    UNKNOWN = "unknown"           # Uncategorized errors

# Error severity levels
class ToolErrorSeverity(str, Enum):
    """Severity levels for tool errors."""
    INFO = "info"           # Informational errors that don't impact functionality
    WARNING = "warning"     # Warnings that may affect some functionality
    ERROR = "error"         # Serious errors that prevent expected functionality
    CRITICAL = "critical"   # Critical failures that affect system stability

# Standard error codes
class ToolErrorCodes:
    """Common error codes for agent tools."""
    # Input validation
    INVALID_PARAMETER = "INVALID_PARAMETER"
    MISSING_REQUIRED_PARAMETER = "MISSING_REQUIRED_PARAMETER"
    PARAMETER_TYPE_ERROR = "PARAMETER_TYPE_ERROR"
    
    # Authentication/Credentials
    MISSING_API_KEY = "MISSING_API_KEY"
    INVALID_API_KEY = "INVALID_API_KEY"
    AUTH_FAILURE = "AUTH_FAILURE"
    
    # Network
    CONNECTION_ERROR = "CONNECTION_ERROR"
    TIMEOUT_ERROR = "TIMEOUT_ERROR"
    DNS_ERROR = "DNS_ERROR"
    
    # API 
    API_ERROR = "API_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    
    # Parsing
    PARSING_ERROR = "PARSING_ERROR"
    DATA_FORMAT_ERROR = "DATA_FORMAT_ERROR"
    UNEXPECTED_RESPONSE = "UNEXPECTED_RESPONSE"
    
    # Internal
    INTERNAL_ERROR = "INTERNAL_ERROR"
    DEPENDENCY_ERROR = "DEPENDENCY_ERROR"
    UNHANDLED_ERROR = "UNHANDLED_ERROR"

# Standardized tool error response
class ToolErrorResponse:
    """
    Creates a standardized error response for agent tools.
    
    This class helps ensure consistent error formatting across different
    agent tools and provides useful debugging information.
    """
    
    @staticmethod
    def create(
        error_code: str,
        message: str,
        category: Union[str, ToolErrorCategory] = ToolErrorCategory.UNKNOWN,
        severity: Union[str, ToolErrorSeverity] = ToolErrorSeverity.ERROR,
        details: Optional[Dict[str, Any]] = None,
        tool_name: Optional[str] = None,
        retry_suggested: bool = False,
        retry_delay_seconds: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a standardized tool error response.
        
        Args:
            error_code: Unique identifier for the error type
            message: Human-readable error message
            category: Category of the error
            severity: Severity level of the error
            details: Additional error details
            tool_name: Name of the tool generating the error
            retry_suggested: Whether retry is suggested
            retry_delay_seconds: Suggested delay before retry (if applicable)
            
        Returns:
            A standardized error response dictionary
        """
        # Ensure category and severity are string values
        if isinstance(category, ToolErrorCategory):
            category = category.value
        
        if isinstance(severity, ToolErrorSeverity):
            severity = severity.value
            
        # Create the error response
        error_response = {
            "error": True,  # Flag to easily identify error responses
            "error_code": error_code,
            "message": message,
            "category": category,
            "severity": severity,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Add optional fields if provided
        if details:
            error_response["details"] = details
            
        if tool_name:
            error_response["tool"] = tool_name
            
        if retry_suggested:
            error_response["retry_suggested"] = True
            if retry_delay_seconds:
                error_response["retry_delay_seconds"] = retry_delay_seconds
                
        return error_response
    
    @staticmethod
    def from_exception(
        exception: Exception,
        tool_name: Optional[str] = None,
        category: Union[str, ToolErrorCategory] = ToolErrorCategory.UNKNOWN,
        include_traceback: bool = False,
        additional_details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create an error response from an exception.
        
        Args:
            exception: The exception that occurred
            tool_name: Name of the tool generating the error
            category: Error category (will try to determine automatically)
            include_traceback: Whether to include exception traceback in details
            additional_details: Any additional error details to include
            
        Returns:
            A standardized error response dictionary
        """
        # Determine error code and category based on exception type
        error_code, determined_category = ToolErrorResponse._categorize_exception(exception)
        
        # If category not overridden, use determined category
        if category == ToolErrorCategory.UNKNOWN:
            category = determined_category
            
        # Create details dictionary
        details = additional_details or {}
        details["exception_type"] = type(exception).__name__
        
        # Add traceback if requested
        if include_traceback:
            details["traceback"] = traceback.format_exc()
            
        # Create the error response
        return ToolErrorResponse.create(
            error_code=error_code,
            message=str(exception),
            category=category,
            details=details,
            tool_name=tool_name
        )
    
    @staticmethod
    def _categorize_exception(exception: Exception) -> tuple:
        """
        Determine error code and category based on exception type.
        
        Args:
            exception: The exception to categorize
            
        Returns:
            Tuple of (error_code, category)
        """
        import requests
        import json
        
        # Check for different types of common exceptions
        if isinstance(exception, (ValueError, TypeError, KeyError, IndexError)):
            return ToolErrorCodes.PARAMETER_TYPE_ERROR, ToolErrorCategory.INVALID_INPUT
            
        elif isinstance(exception, requests.Timeout):
            return ToolErrorCodes.TIMEOUT_ERROR, ToolErrorCategory.TIMEOUT
            
        elif isinstance(exception, requests.ConnectionError):
            return ToolErrorCodes.CONNECTION_ERROR, ToolErrorCategory.NETWORK
            
        elif isinstance(exception, requests.HTTPError):
            # Determine more specific HTTP error codes
            try:
                status_code = exception.response.status_code
                if status_code == 401:
                    return ToolErrorCodes.AUTH_FAILURE, ToolErrorCategory.PERMISSION
                elif status_code == 403:
                    return ToolErrorCodes.PERMISSION_DENIED, ToolErrorCategory.PERMISSION
                elif status_code == 404:
                    return ToolErrorCodes.RESOURCE_NOT_FOUND, ToolErrorCategory.RESOURCE
                elif status_code == 429:
                    return ToolErrorCodes.RATE_LIMITED, ToolErrorCategory.RATE_LIMIT
                elif status_code >= 500:
                    return ToolErrorCodes.SERVICE_UNAVAILABLE, ToolErrorCategory.API
                else:
                    return ToolErrorCodes.API_ERROR, ToolErrorCategory.API
            except:
                return ToolErrorCodes.API_ERROR, ToolErrorCategory.API
                
        elif isinstance(exception, json.JSONDecodeError):
            return ToolErrorCodes.PARSING_ERROR, ToolErrorCategory.PARSING
            
        # Default for unrecognized exceptions
        return ToolErrorCodes.UNHANDLED_ERROR, ToolErrorCategory.UNKNOWN


# Helper functions for common error scenarios

def missing_api_key_error(
    key_name: str, 
    env_var: str, 
    tool_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a standardized error for a missing API key.
    
    Args:
        key_name: Human-readable name of the API key
        env_var: Environment variable name for the API key
        tool_name: Name of the tool requiring the API key
        
    Returns:
        Error response dictionary
    """
    message = f"Missing {key_name}. Set the {env_var} environment variable."
    return ToolErrorResponse.create(
        error_code=ToolErrorCodes.MISSING_API_KEY,
        message=message,
        category=ToolErrorCategory.MISSING_CREDENTIAL,
        severity=ToolErrorSeverity.ERROR,
        tool_name=tool_name,
        details={"env_var": env_var}
    )

def invalid_parameter_error(
    param_name: str,
    message: str,
    tool_name: Optional[str] = None,
    received_value: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Create a standardized error for an invalid parameter.
    
    Args:
        param_name: Name of the parameter with the issue
        message: Explanation of the validation issue
        tool_name: Name of the tool with the parameter
        received_value: The invalid value that was received (if safe to include)
        
    Returns:
        Error response dictionary
    """
    details = {"parameter": param_name}
    if received_value is not None:
        details["received_value"] = str(received_value)
        
    return ToolErrorResponse.create(
        error_code=ToolErrorCodes.INVALID_PARAMETER,
        message=f"Invalid parameter '{param_name}': {message}",
        category=ToolErrorCategory.INVALID_INPUT,
        severity=ToolErrorSeverity.ERROR,
        tool_name=tool_name,
        details=details
    )

def rate_limit_error(
    service_name: str,
    tool_name: Optional[str] = None,
    retry_delay_seconds: Optional[int] = 60
) -> Dict[str, Any]:
    """
    Create a standardized error for rate limiting.
    
    Args:
        service_name: Name of the service imposing rate limits
        tool_name: Name of the tool being rate limited
        retry_delay_seconds: Suggested retry delay in seconds
        
    Returns:
        Error response dictionary
    """
    return ToolErrorResponse.create(
        error_code=ToolErrorCodes.RATE_LIMITED,
        message=f"Rate limit exceeded for {service_name}",
        category=ToolErrorCategory.RATE_LIMIT,
        severity=ToolErrorSeverity.WARNING,
        tool_name=tool_name,
        retry_suggested=True,
        retry_delay_seconds=retry_delay_seconds,
        details={"service": service_name}
    )

def network_error(
    service_name: str,
    error_details: str,
    tool_name: Optional[str] = None,
    retry_suggested: bool = True
) -> Dict[str, Any]:
    """
    Create a standardized error for network issues.
    
    Args:
        service_name: Name of the service having connection issues
        error_details: Details about the network error
        tool_name: Name of the tool experiencing the error
        retry_suggested: Whether retry is suggested
        
    Returns:
        Error response dictionary
    """
    return ToolErrorResponse.create(
        error_code=ToolErrorCodes.CONNECTION_ERROR,
        message=f"Network error connecting to {service_name}: {error_details}",
        category=ToolErrorCategory.NETWORK,
        severity=ToolErrorSeverity.ERROR,
        tool_name=tool_name,
        retry_suggested=retry_suggested,
        details={"service": service_name}
    )

def timeout_error(
    service_name: str, 
    timeout_seconds: int,
    tool_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a standardized error for request timeouts.
    
    Args:
        service_name: Name of the service that timed out
        timeout_seconds: The timeout duration in seconds
        tool_name: Name of the tool experiencing the timeout
        
    Returns:
        Error response dictionary
    """
    return ToolErrorResponse.create(
        error_code=ToolErrorCodes.TIMEOUT_ERROR,
        message=f"Request to {service_name} timed out after {timeout_seconds} seconds",
        category=ToolErrorCategory.TIMEOUT,
        severity=ToolErrorSeverity.ERROR,
        tool_name=tool_name,
        retry_suggested=True,
        details={
            "service": service_name,
            "timeout_seconds": timeout_seconds
        }
    )