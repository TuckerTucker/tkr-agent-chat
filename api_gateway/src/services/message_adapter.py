"""
Message adapter service for TKR Multi-Agent Chat System.

This module provides adapters for converting between standardized and legacy message formats
to ensure compatibility during the transition period.
"""

from datetime import datetime
import uuid
from typing import Dict, Any, List, Optional, Union

from ..models.message_schema import (
    MessageType,
    BaseMessage,
    Message,
    UserTextMessage,
    AgentTextMessage,
    AgentToAgentMessage,
    SystemMessage,
    ErrorMessage,
    ContextUpdateMessage,
    TaskUpdateMessage,
    PingMessage,
    PongMessage
)

def legacy_to_standard(message: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a legacy format message to standardized format.
    
    Args:
        message: The legacy message object
        
    Returns:
        Standardized message dictionary
    """
    # Create base message with required fields
    standard_message = {
        "id": message.get("id") or str(uuid.uuid4()),
        "timestamp": message.get("timestamp") or datetime.utcnow().isoformat(),
        "session_id": message.get("sessionId") or message.get("session_id"),
    }
    
    # Convert message type
    msg_type = message.get("type", "text")
    standard_message["type"] = msg_type  # Use same type string, validated elsewhere
    
    # Add content - both content and text are used in legacy messages
    if "content" in message:
        standard_message["content"] = message["content"]
    elif "text" in message:
        standard_message["content"] = message["text"]
    
    # Handle agent vs user specifics
    if message.get("fromAgent") or message.get("from_agent"):
        standard_message["from_agent"] = message.get("fromAgent") or message.get("from_agent")
        # Ensure it's explicitly marked as not a user message
        standard_message["from_user"] = False
    elif message.get("fromUser") or message.get("from_user") or message.get("fromUser") == True or message.get("from_user") == True:
        # Explicitly set to true (handle both boolean and string values)
        standard_message["from_user"] = True
        # Make sure from_agent is not set
        standard_message.pop("from_agent", None)
    else:
        # Default to user message if no source specified
        standard_message["from_user"] = True
        # Make sure from_agent is not set
        standard_message.pop("from_agent", None)
    
    # Handle target agent
    if message.get("toAgent") or message.get("to_agent"):
        standard_message["to_agent"] = message.get("toAgent") or message.get("to_agent")
    
    # Copy additional fields if present
    if "inReplyTo" in message or "in_reply_to" in message:
        standard_message["in_reply_to"] = message.get("inReplyTo") or message.get("in_reply_to")
    
    if "streaming" in message:
        standard_message["streaming"] = message["streaming"]
    
    if "turnComplete" in message or "turn_complete" in message:
        standard_message["turn_complete"] = message.get("turnComplete") or message.get("turn_complete")
    
    if "metadata" in message:
        standard_message["metadata"] = message["metadata"]
    
    # Handle message type specific fields
    if msg_type == "context_update":
        standard_message["context_id"] = message.get("contextId") or message.get("context_id")
        standard_message["context_data"] = message.get("contextData") or message.get("context_data")
        if "targetAgents" in message or "target_agents" in message:
            standard_message["target_agents"] = message.get("targetAgents") or message.get("target_agents")
            
    elif msg_type == "task_update":
        standard_message["task_id"] = message.get("taskId") or message.get("task_id")
        if "status" in message:
            standard_message["status"] = message["status"]
        if "action" in message:
            standard_message["action"] = message["action"]
        if "result" in message:
            standard_message["result"] = message["result"]
            
    elif msg_type == "error":
        if "errorCode" in message or "error_code" in message:
            standard_message["error_code"] = message.get("errorCode") or message.get("error_code")
        if "errorDetails" in message or "error_details" in message:
            standard_message["error_details"] = message.get("errorDetails") or message.get("error_details")
        if "severity" in message:
            standard_message["severity"] = message["severity"]
        if "recoverable" in message:
            standard_message["recoverable"] = message["recoverable"]
    
    return standard_message

def standard_to_legacy(message: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a standardized format message to legacy format.
    
    Args:
        message: The standardized message object
        
    Returns:
        Legacy format message dictionary
    """
    # Create legacy message with camelCase fields
    legacy_message = {
        "id": message["id"],
        "type": message["type"],
        "timestamp": message["timestamp"],
        "sessionId": message["session_id"]
    }
    
    # Handle content field
    if "content" in message:
        legacy_message["content"] = message["content"]
        legacy_message["text"] = message["content"] if isinstance(message["content"], str) else str(message["content"])
    
    # Handle agent vs user specifics
    if "from_agent" in message and message["from_agent"]:
        legacy_message["fromAgent"] = message["from_agent"]
    if "to_agent" in message:
        legacy_message["toAgent"] = message["to_agent"]
    if "from_user" in message and message["from_user"]:
        legacy_message["fromUser"] = message["from_user"]
    
    # Copy additional fields
    if "in_reply_to" in message and message["in_reply_to"]:
        legacy_message["inReplyTo"] = message["in_reply_to"]
    
    if "streaming" in message:
        legacy_message["streaming"] = message["streaming"]
    
    if "turn_complete" in message:
        legacy_message["turnComplete"] = message["turn_complete"]
        
    if "metadata" in message and message["metadata"]:
        legacy_message["metadata"] = message["metadata"]
    
    # Handle message type specific fields
    msg_type = message["type"]
    if msg_type == "context_update":
        if "context_id" in message:
            legacy_message["contextId"] = message["context_id"]
        if "context_data" in message:
            legacy_message["contextData"] = message["context_data"]
        if "target_agents" in message:
            legacy_message["targetAgents"] = message["target_agents"]
            
    elif msg_type == "task_update":
        if "task_id" in message:
            legacy_message["taskId"] = message["task_id"]
        if "status" in message:
            legacy_message["status"] = message["status"]
        if "action" in message:
            legacy_message["action"] = message["action"]
        if "result" in message:
            legacy_message["result"] = message["result"]
            
    elif msg_type == "error":
        if "error_code" in message:
            legacy_message["errorCode"] = message["error_code"]
        if "error_details" in message:
            legacy_message["errorDetails"] = message["error_details"]
        if "severity" in message:
            legacy_message["severity"] = message["severity"]
        if "recoverable" in message:
            legacy_message["recoverable"] = message["recoverable"]
    
    return legacy_message

def is_standard_format(message: Dict[str, Any]) -> bool:
    """
    Check if a message is in standardized format.
    
    Args:
        message: The message to check
        
    Returns:
        True if message has standardized format, False otherwise
    """
    # Primary indicator is snake_case fields
    return "session_id" in message and "id" in message

def is_legacy_format(message: Dict[str, Any]) -> bool:
    """
    Check if a message is in legacy format.
    
    Args:
        message: The message to check
        
    Returns:
        True if message has legacy format, False otherwise
    """
    # Primary indicator is camelCase fields
    return "sessionId" in message and "id" in message

def normalize_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a message to standardized format regardless of input format.
    Adds validation to ensure message has minimum required fields.
    
    Args:
        message: Message in either legacy or standardized format
        
    Returns:
        Normalized message in standardized format
        
    Raises:
        ValueError: If message cannot be normalized or is missing required fields
        TypeError: If message is not a dictionary
    """
    # Handle None or empty dictionaries
    if message is None:
        raise ValueError("Cannot normalize None message")
    
    # Ensure message is a dictionary
    if not isinstance(message, dict):
        raise TypeError(f"Message must be a dictionary, got {type(message)}")
    
    if not message:
        raise ValueError("Cannot normalize empty message dictionary")
    
    if is_legacy_format(message):
        return legacy_to_standard(message)
    elif is_standard_format(message):
        return message
    else:
        # Try to guess format and convert to standard
        if "sessionId" in message:
            return legacy_to_standard(message)
        else:
            # Create minimum valid message
            standard = {
                "id": message.get("id") or str(uuid.uuid4()),
                "session_id": message.get("session_id") or "default",
                "type": message.get("type") or "text",
                "timestamp": message.get("timestamp") or datetime.utcnow().isoformat()
            }
            
            # Copy any content
            if "content" in message:
                standard["content"] = message["content"]
            elif "text" in message:
                standard["content"] = message["text"]
            else:
                # No content found - set to empty string
                standard["content"] = ""
            
            # Validate the created message has minimum fields
            if not standard.get("id") or not standard.get("session_id") or not standard.get("type"):
                import logging
                logging.getLogger(__name__).warning(f"Normalized message is missing required fields: {standard}")
            
            return standard