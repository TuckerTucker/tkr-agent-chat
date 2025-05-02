# Agent Tool Error Handling Guide

This document describes the standardized error handling pattern for tools in the TKR Multi-Agent Chat System. Following these guidelines ensures consistent error reporting and improves error handling throughout the system.

## Table of Contents

1. [Overview](#overview)
2. [Error Structure](#error-structure)
3. [Usage Guidelines](#usage-guidelines)
4. [Examples](#examples)
5. [Integration with ADK](#integration-with-adk)

## Overview

The tool error handling system provides:

- Standardized error response format
- Categorized error types for better error handling
- Helper functions for common error scenarios
- Consistent error logging
- Support for centralized error tracking

## Error Structure

All tool errors follow this standardized structure:

```json
{
  "error": true,                  // Flag to easily identify error responses
  "error_code": "ERROR_CODE",     // Unique identifier for the error type
  "message": "Human-readable message", // Descriptive message
  "category": "category_name",    // Error category (e.g., "network", "api")
  "severity": "error",            // Severity level (info/warning/error/critical)
  "timestamp": "2023-05-01T12:34:56.789Z", // ISO timestamp
  "tool": "tool_name",            // Name of the tool (optional)
  "details": {                    // Additional contextual information (optional)
    "param1": "value1",
    "param2": "value2"
  },
  "retry_suggested": true,        // Whether retry might succeed (optional)
  "retry_delay_seconds": 30       // Suggested delay before retry (optional)
}
```

### Error Categories

Error categories help classify errors by their nature:

- `invalid_input`: Input validation errors
- `missing_credential`: Missing API key or authentication
- `network`: Network-related errors
- `timeout`: Request timeout
- `rate_limit`: Rate limiting
- `permission`: Permission or access denied
- `resource`: Resource not found
- `api`: API-specific errors
- `parsing`: Data parsing errors
- `internal`: Internal tool errors
- `unknown`: Uncategorized errors

### Severity Levels

Severity levels indicate the impact of the error:

- `info`: Informational issues that don't impact functionality
- `warning`: Warnings that may affect some functionality
- `error`: Serious errors that prevent expected functionality
- `critical`: Critical failures affecting system stability

## Usage Guidelines

### Basic Usage

1. **Import the module**:

```python
from agents.common.tool_errors import (
    ToolErrorResponse, 
    ToolErrorCategory,
    ToolErrorCodes,
    # Helper functions for common errors
    missing_api_key_error,
    invalid_parameter_error,
    timeout_error,
    network_error,
    rate_limit_error
)
```

2. **Define your tool name constant**:

```python
# Used in all error responses for tracking
TOOL_NAME = "my_tool_name"
```

3. **Create error responses using helper functions**:

```python
# For invalid parameters
if not param or not isinstance(param, str):
    error = invalid_parameter_error(
        param_name="param_name",
        message="Please provide a valid string",
        tool_name=TOOL_NAME,
        received_value=param
    )
    logger.error(f"Invalid parameter: {error['message']}")
    return error
```

4. **Handle exception cases**:

```python
try:
    # Your code here
except requests.Timeout:
    error = timeout_error(
        service_name="Service Name",
        timeout_seconds=10,
        tool_name=TOOL_NAME
    )
    logger.error(f"Request timeout: {error['message']}")
    return error
except Exception as e:
    error = ToolErrorResponse.from_exception(
        exception=e,
        tool_name=TOOL_NAME,
        additional_details={"param": param}
    )
    logger.exception(f"Unexpected error: {error['message']}")
    return error
```

### Best Practices

1. **Always include tool name** in error responses for tracking
2. **Log errors consistently** using the logger
3. **Include appropriate details** but avoid sensitive information
4. **Use appropriate categories** for better error handling
5. **Use helper functions** for common error types
6. **Include retry information** when appropriate
7. **Return the error response** directly from your tool function

## Examples

### Input Validation Example

```python
def my_tool(url: str, limit: int = 10) -> Dict[str, Any]:
    """Example tool with input validation."""
    
    # Validate URL parameter
    if not url or not isinstance(url, str):
        return invalid_parameter_error(
            param_name="url",
            message="Please provide a valid URL as a string",
            tool_name="my_tool",
            received_value=url
        )
        
    # Validate limit parameter
    if not isinstance(limit, int) or limit < 1:
        return invalid_parameter_error(
            param_name="limit",
            message="Limit must be a positive integer",
            tool_name="my_tool",
            received_value=limit
        )
    
    # Tool implementation continues...
```

### API Request Example

```python
def weather_api_tool(location: str) -> Dict[str, Any]:
    """Example API tool with error handling."""
    
    API_KEY = os.getenv("WEATHER_API_KEY")
    if not API_KEY:
        return missing_api_key_error(
            key_name="Weather API key",
            env_var="WEATHER_API_KEY",
            tool_name="weather_api_tool"
        )
    
    try:
        response = requests.get(API_URL, params={"q": location}, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Process data and return results...
        return {"temperature": data["temp"], "location": location}
        
    except requests.Timeout:
        return timeout_error(
            service_name="Weather API",
            timeout_seconds=10,
            tool_name="weather_api_tool"
        )
        
    except requests.RequestException as e:
        return network_error(
            service_name="Weather API",
            error_details=str(e),
            tool_name="weather_api_tool"
        )
        
    except Exception as e:
        return ToolErrorResponse.from_exception(
            exception=e,
            tool_name="weather_api_tool",
            additional_details={"location": location}
        )
```

## Integration with ADK

When using tools with the ADK (Agent Development Kit), you need to handle error responses appropriately in agent prompts and tool interface functions.

### Prompt Template Examples

Include instructions in your agent's prompt about how to handle tool errors:

```
When using tools, always check for an "error" field in the response.
If a tool returns an error:
1. Look at the "message" field for details about what went wrong
2. Check the "category" to understand the type of error
3. Consider the "retry_suggested" field to determine if retrying might help
4. If retrying, respect the "retry_delay_seconds" value if provided
```

### Reporting Errors to Users

When reporting errors to users, consider the error category and severity to provide appropriate messages. For example:

- For `invalid_input` errors, ask the user to provide correct input
- For `network` or `timeout` errors, suggest trying again later
- For `missing_credential` errors, avoid exposing the missing key name to users

## Advanced Usage

For more advanced error handling scenarios, use the `ToolErrorResponse.create()` method directly:

```python
ToolErrorResponse.create(
    error_code=ToolErrorCodes.CUSTOM_ERROR,
    message="Custom error message",
    category=ToolErrorCategory.INTERNAL,
    severity=ToolErrorSeverity.CRITICAL,
    details={"custom_field": "value"},
    tool_name="my_tool",
    retry_suggested=False
)
```

---

By following this standardized error handling approach, we can improve error reporting, enable better troubleshooting, and provide more consistent user experiences across the TKR Multi-Agent Chat System.