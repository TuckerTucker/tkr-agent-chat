"""
Message handling module for Socket.IO communications in TKR Multi-Agent Chat.

This module provides structured handling of messages between clients and agents,
including validation, acknowledgment, retry logic, and error handling.
"""

import json
import uuid
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple, Callable, Awaitable

from ..services.logger_service import logger_service
from ..services.error_service import error_service
from ..models.error_responses import ErrorCodes, ErrorCategory, ErrorSeverity
from ..services.chat_service import chat_service
from ..models.messages import MessageType
# Temporarily comment out missing imports
# from ..db import save_message_to_db, get_message_by_id

# Get a module-specific logger
logger = logger_service.get_logger(__name__)

# Message type definitions
MESSAGE_TYPES = [
    "text",            # Plain text message
    "agent_message",   # Message from one agent to another
    "system",          # System notification or status update
    "task_update",     # Task status update
    "context_update",  # Context sharing update
    "error",           # Error message
    "ack",             # Message acknowledgment
    "ping",            # Connection check
    "pong"             # Connection check response
]

# Message status definitions
MESSAGE_STATUS = [
    "sent",            # Message sent, not yet acknowledged
    "delivered",       # Message delivered to recipient
    "read",            # Message read by recipient
    "error",           # Error during delivery
    "pending",         # Message queued locally but not sent
    "retrying"         # Message delivery being retried
]

# Validator functions
def validate_message_format(message: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate the format of an incoming message.
    
    Args:
        message: The message object to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check for required fields
    required_fields = ["id", "type", "sessionId"]
    
    for field in required_fields:
        if field not in message:
            return False, f"Missing required field: {field}"
    
    # Validate message type
    if message["type"] not in MESSAGE_TYPES:
        return False, f"Invalid message type: {message['type']}"
    
    # Validate content based on message type
    if message["type"] == "text" and "content" not in message:
        return False, "Text messages must have content"
        
    if message["type"] == "agent_message":
        if "fromAgent" not in message:
            return False, "Agent messages must specify fromAgent"
        if "toAgent" not in message:
            return False, "Agent messages must specify toAgent"
            
    # All checks passed
    return True, None
    
def validate_message_permissions(message: Dict[str, Any], sid: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that the message sender has permission to send this type of message.
    
    Args:
        message: The message object to validate
        sid: The Socket.IO session ID of the sender
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # This is a simplified implementation - in a real system you'd check:
    # - User/client authorization
    # - Rate limiting
    # - Agent permissions
    # - Session access control
    
    # Check basic permissions based on metadata stored with the connection
    # This is placeholder logic - replace with actual permission checks
    try:
        # Placeholder for permission check
        return True, None
    except Exception as e:
        logger.error(f"Error validating message permissions: {e}")
        return False, "Permission validation error"

async def store_message(message: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Store a message in the database.
    
    Args:
        message: The message to store
        
    Returns:
        Tuple of (success, error_message, message_uuid)
    """
    try:
        # Prepare message for storage
        message_uuid = message.get("id") or str(uuid.uuid4())
        session_id = message.get("sessionId")
        
        # Determine sender type and ID
        from_agent = message.get("fromAgent")
        from_user = message.get("fromUser")
        
        if from_agent:
            message_type = MessageType.AGENT
            agent_id = from_agent
        else:
            message_type = MessageType.USER
            agent_id = message.get("toAgent")  # For user messages, this is the target agent
            
        # Prepare message parts
        if message.get("type") == "text":
            message_parts = [{"type": "text", "content": message.get("content")}]
        else:
            # For other message types, store the whole message as JSON
            message_parts = [{"type": "json", "content": json.dumps(message)}]
            
        # Prepare metadata
        metadata = {
            "timestamp": message.get("timestamp") or datetime.utcnow().isoformat(),
            "message_id": message_uuid,
            "socket_message": True,
            "message_type": message.get("type")
        }
        
        # Add any additional metadata from the message
        if message.get("metadata"):
            metadata.update(message.get("metadata"))
            
        # Save to database using chat_service
        saved_message = chat_service.save_message(
            session_id=session_id,
            msg_type=message_type,
            agent_id=agent_id,
            parts=message_parts,
            message_metadata=metadata
        )
        
        if saved_message:
            return True, None, saved_message.get("message_uuid")
        else:
            return False, "Failed to save message to database", None
            
    except Exception as e:
        logger.error(f"Error storing message: {e}", exc_info=True)
        return False, f"Database error: {str(e)}", None
        
async def get_missed_messages(
    session_id: str, 
    last_message_id: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get messages that were sent after a specific message ID.
    
    Args:
        session_id: The session ID to retrieve messages for
        last_message_id: The ID of the last message received by the client
        limit: Maximum number of messages to retrieve
        
    Returns:
        List of message objects
    """
    try:
        # Get messages from chat_service
        messages = chat_service.get_session_messages(
            session_id=session_id,
            after_message_id=last_message_id,
            limit=limit
        )
        
        # Convert to Socket.IO message format
        socket_messages = []
        for msg in messages:
            # Extract basic message data
            message_id = msg.get("message_uuid")
            timestamp = msg.get("timestamp")
            msg_type = msg.get("type")
            agent_id = msg.get("agent_id")
            
            # Extract content based on message parts
            content = ""
            parts = msg.get("parts", [])
            for part in parts:
                if part.get("type") == "text":
                    content += part.get("content", "")
            
            # Create a Socket.IO compatible message
            socket_message = {
                "id": message_id,
                "sessionId": session_id,
                "timestamp": timestamp,
                "type": "text",
                "content": content
            }
            
            # Add appropriate sender fields
            if msg_type == "agent":
                socket_message["fromAgent"] = agent_id
            else:
                socket_message["fromUser"] = "user"  # Simplified - could use actual user ID
                if agent_id:
                    socket_message["toAgent"] = agent_id
                    
            # Add to results
            socket_messages.append(socket_message)
            
        return socket_messages
    except Exception as e:
        logger.error(f"Error retrieving missed messages: {e}", exc_info=True)
        return []

# Message Handling Functions
async def handle_text_message(sio, sid: str, message: Dict[str, Any], namespace: str) -> Dict[str, Any]:
    """
    Handle a text message sent over Socket.IO.
    
    Args:
        sio: SocketIO server instance
        sid: Socket.IO session ID
        message: The message object
        namespace: Socket.IO namespace
        
    Returns:
        Acknowledgment object
    """
    try:
        # Validate message
        is_valid, error = validate_message_format(message)
        if not is_valid:
            logger.warning(f"Invalid message format: {error}")
            return {
                "status": "error",
                "id": message.get("id"),
                "message": error
            }
            
        # Store in database
        stored, error, message_uuid = await store_message(message)
        if not stored:
            logger.error(f"Failed to store message: {error}")
            return {
                "status": "error",
                "id": message.get("id"),
                "message": error
            }
            
        # Get session room
        session_id = message.get("sessionId")
        room = f"session_{session_id}"
        
        # Get recipient-specific room if targeting a specific agent
        recipient_room = None
        if message.get("toAgent"):
            recipient_room = f"agent_{message.get('toAgent')}"
            
        # Broadcast to appropriate room, skipping the sender
        try:
            # For messages targeting a specific agent, emit to that agent's room
            if recipient_room:
                await sio.emit(
                    "message", 
                    message, 
                    room=recipient_room,
                    namespace=namespace,
                    skip_sid=sid
                )
                logger.debug(f"Message {message.get('id')} sent to agent {message.get('toAgent')}")
            else:
                # Otherwise, broadcast to the session room
                await sio.emit(
                    "message", 
                    message, 
                    room=room,
                    namespace=namespace,
                    skip_sid=sid
                )
                logger.debug(f"Message {message.get('id')} broadcast to session {session_id}")
                
            # Return success acknowledgment
            return {
                "status": "delivered",
                "id": message.get("id"),
                "persistedId": message_uuid,
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Error broadcasting message: {e}")
            return {
                "status": "error",
                "id": message.get("id"),
                "message": f"Broadcast error: {str(e)}"
            }
    except Exception as e:
        logger.error(f"Error handling text message: {e}", exc_info=True)
        return {
            "status": "error",
            "id": message.get("id", "unknown"),
            "message": f"Internal server error: {str(e)}"
        }

async def handle_context_update(sio, sid: str, message: Dict[str, Any], namespace: str) -> Dict[str, Any]:
    """
    Handle a context update message sent over Socket.IO.
    
    Args:
        sio: SocketIO server instance
        sid: Socket.IO session ID
        message: The message object
        namespace: Socket.IO namespace
        
    Returns:
        Acknowledgment object
    """
    try:
        # Validate message
        if not message.get("contextId"):
            return {
                "status": "error",
                "id": message.get("id"),
                "message": "Missing contextId"
            }
            
        if not message.get("contextData"):
            return {
                "status": "error",
                "id": message.get("id"),
                "message": "Missing contextData"
            }
            
        session_id = message.get("sessionId")
        source_agent = message.get("fromAgent")
        
        # Store context using context_service
        from ..services.context_service import context_service
        
        context_id = message.get("contextId")
        context_data = message.get("contextData")
        
        try:
            # Store the context
            await context_service.store_context(
                context_id=context_id,
                session_id=session_id,
                source_agent_id=source_agent,
                context_data=context_data
            )
            
            # Share with appropriate agents
            if message.get("targetAgents"):
                # Selective sharing
                target_agents = message.get("targetAgents")
                for agent_id in target_agents:
                    await context_service.share_context(
                        source_agent_id=source_agent,
                        target_agent_id=agent_id,
                        context_data=context_data,
                        session_id=session_id
                    )
            else:
                # Share with all other agents in the session
                agents = chat_service.get_agents()
                for agent in agents:
                    if agent.id != source_agent:
                        await context_service.share_context(
                            source_agent_id=source_agent,
                            target_agent_id=agent.id,
                            context_data=context_data,
                            session_id=session_id
                        )
            
            # Broadcast the context update
            room = f"session_{session_id}"
            await sio.emit(
                "context:update", 
                message, 
                room=room,
                namespace=namespace,
                skip_sid=sid
            )
            
            # Return success
            return {
                "status": "success",
                "id": message.get("id"),
                "contextId": context_id,
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Error sharing context: {e}")
            return {
                "status": "error",
                "id": message.get("id"),
                "message": f"Context sharing error: {str(e)}"
            }
    except Exception as e:
        logger.error(f"Error handling context update: {e}", exc_info=True)
        return {
            "status": "error",
            "id": message.get("id", "unknown"),
            "message": f"Internal error: {str(e)}"
        }
        
async def handle_task_update(sio, sid: str, message: Dict[str, Any], namespace: str) -> Dict[str, Any]:
    """
    Handle a task update message sent over Socket.IO.
    
    Args:
        sio: SocketIO server instance
        sid: Socket.IO session ID
        message: The message object
        namespace: Socket.IO namespace
        
    Returns:
        Acknowledgment object
    """
    try:
        # Validate message
        if not message.get("taskId"):
            return {
                "status": "error",
                "id": message.get("id"),
                "message": "Missing taskId"
            }
            
        # Process task update
        task_id = message.get("taskId")
        task_action = message.get("action", "update")
        task_status = message.get("status")
        task_result = message.get("result")
        
        # Handle task
        from ..services.a2a_service import A2AService
        a2a_service = A2AService()
        
        try:
            if task_action == "create":
                # Create new task
                task = await a2a_service.create_task(
                    session_id=message.get("sessionId"),
                    title=message.get("title", "Untitled Task"),
                    description=message.get("description", ""),
                    agent_ids=message.get("agentIds", []),
                    context=message.get("context", {})
                )
                task_id = task.id
                
            elif task_action == "update":
                # Update existing task
                task = await a2a_service.update_task_status(
                    task_id=task_id,
                    status=task_status,
                    result=task_result
                )
                
            elif task_action == "cancel":
                # Cancel task
                task = await a2a_service.update_task_status(
                    task_id=task_id,
                    status="cancelled",
                    result=message.get("result", {"reason": "Cancelled by user"})
                )
                
            # Broadcast the task update
            task_room = f"task_{task_id}"
            session_room = f"session_{message.get('sessionId')}"
            
            # Broadcast to task subscribers
            await sio.emit(
                "task:update", 
                message, 
                room=task_room,
                namespace=namespace
            )
            
            # Also broadcast to session room
            await sio.emit(
                "task:update", 
                message, 
                room=session_room,
                namespace=namespace
            )
            
            # Return success
            return {
                "status": "success",
                "id": message.get("id"),
                "taskId": task_id,
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Error processing task update: {e}")
            return {
                "status": "error",
                "id": message.get("id"),
                "message": f"Task update error: {str(e)}"
            }
    except Exception as e:
        logger.error(f"Error handling task update: {e}", exc_info=True)
        return {
            "status": "error",
            "id": message.get("id", "unknown"),
            "message": f"Internal error: {str(e)}"
        }
        
# Message handler registry - maps message types to handler functions
MESSAGE_HANDLERS = {
    "text": handle_text_message,
    "agent_message": handle_text_message,  # Reuse text message handler
    "context_update": handle_context_update,
    "task_update": handle_task_update
}

async def process_message(sio, sid: str, message: Dict[str, Any], namespace: str) -> Dict[str, Any]:
    """
    Process an incoming Socket.IO message.
    
    Args:
        sio: SocketIO server instance
        sid: Socket.IO session ID
        message: The message object
        namespace: Socket.IO namespace
        
    Returns:
        Acknowledgment object
    """
    # Get message type
    message_type = message.get("type")
    
    # Get handler for message type
    handler = MESSAGE_HANDLERS.get(message_type)
    
    if handler:
        # Process with specific handler
        return await handler(sio, sid, message, namespace)
    else:
        # Unknown message type
        logger.warning(f"Unknown message type: {message_type}")
        return {
            "status": "error",
            "id": message.get("id"),
            "message": f"Unknown message type: {message_type}"
        }