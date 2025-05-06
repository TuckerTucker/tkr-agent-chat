"""
Message handling module for Socket.IO communications in TKR Multi-Agent Chat.

This module provides structured handling of messages between clients and agents,
including validation, acknowledgment, retry logic, and error handling.
"""

import json
import uuid
import asyncio
import logging
import random
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple, Callable, Awaitable, Union
from pydantic import ValidationError

from ..services.logger_service import logger_service
from ..services.error_service import error_service
from ..models.error_responses import ErrorCodes, ErrorCategory, ErrorSeverity
from ..services.chat_service import chat_service
from ..services.context_service import context_service
from ..models.messages import MessageType

# Import standardized message schema
from ..models.message_schema import (
    MessageType as SocketMessageType,
    BaseMessage as SocketBaseMessage,
    Message as SocketMessage,
    UserTextMessage,
    AgentTextMessage,
    AgentToAgentMessage,
    ContextUpdateMessage,
    TaskUpdateMessage,
    ErrorMessage as SocketErrorMessage,
    MessageStatus
)

# Get a module-specific logger
logger = logger_service.get_logger(__name__)

# Validator functions
def validate_message_format(message: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate the format of an incoming message.
    
    Args:
        message: The message object to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check if message has legacy format or standardized format
    if "sessionId" in message and "id" in message:
        # Legacy format
        return validate_legacy_message_format(message)
    elif "session_id" in message and "id" in message:
        # Standardized format
        return validate_standardized_message_format(message)
    else:
        return False, "Missing required fields: id, session_id or sessionId"

def validate_standardized_message_format(message: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate message using the standardized schema with Pydantic models.
    
    Args:
        message: The message object to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        # First validate as base message
        base_message = SocketBaseMessage(**message)
        
        # Then validate based on message type
        if base_message.type == SocketMessageType.TEXT:
            if message.get("from_user"):
                UserTextMessage(**message)
            else:
                AgentTextMessage(**message)
        elif base_message.type == SocketMessageType.AGENT_MESSAGE:
            AgentToAgentMessage(**message)
        elif base_message.type == SocketMessageType.CONTEXT_UPDATE:
            ContextUpdateMessage(**message)
        elif base_message.type == SocketMessageType.TASK_UPDATE:
            TaskUpdateMessage(**message)
        elif base_message.type == SocketMessageType.ERROR:
            SocketErrorMessage(**message)
            
        # All validations passed
        return True, None
        
    except ValidationError as e:
        return False, f"Invalid message format: {str(e)}"
    except Exception as e:
        return False, f"Validation error: {str(e)}"

def validate_legacy_message_format(message: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate legacy message format.
    
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
    
    # Validate message type with both old and new types for compatibility
    valid_types = [t.value for t in SocketMessageType] + [
        "text", "agent_message", "system", "task_update", 
        "context_update", "error", "ack", "ping", "pong"
    ]
    
    if message["type"] not in valid_types:
        return False, f"Invalid message type: {message['type']}"
    
    # Validate content based on message type
    if message["type"] == "text" and not message.get("content") and not message.get("text"):
        return False, "Text messages must have content or text"
        
    if message["type"] == "agent_message":
        if not message.get("fromAgent") and not message.get("from_agent"):
            return False, "Agent messages must specify fromAgent or from_agent"
        if not message.get("toAgent") and not message.get("to_agent"):
            return False, "Agent messages must specify toAgent or to_agent"
            
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
        message: The message to store (in either legacy or standardized format)
        
    Returns:
        Tuple of (success, error_message, message_uuid)
    """
    try:
        # Import message adapter
        from .message_adapter import normalize_message, is_legacy_format, is_standard_format
        
        # Normalize the message to standardized format
        if is_legacy_format(message) or not is_standard_format(message):
            try:
                standardized_message = normalize_message(message)
            except Exception as norm_err:
                logger.warning(f"Failed to normalize message: {norm_err}, proceeding with original format")
                standardized_message = message
        else:
            standardized_message = message
        
        # Get core message information
        message_uuid = standardized_message.get("id") or message.get("id") or str(uuid.uuid4())
        session_id = standardized_message.get("session_id") or message.get("sessionId")
        
        # Determine sender type and ID based on standardized format
        from_agent = standardized_message.get("from_agent")
        from_user = standardized_message.get("from_user") 
        
        if from_agent:
            message_type = MessageType.AGENT
            agent_id = from_agent
        elif from_user:
            message_type = MessageType.USER
            agent_id = standardized_message.get("to_agent")  # Target agent
        else:
            # Default to user message if no sender type is specified
            message_type = MessageType.USER
            agent_id = standardized_message.get("to_agent")  # Target agent
            logger.warning(f"Message has neither from_agent nor from_user specified, defaulting to USER type: {standardized_message.get('id')}")
            
        # Prepare message parts based on content
        content = standardized_message.get("content")
        if content is not None:
            if isinstance(content, str):
                message_parts = [{"type": "text", "content": content}]
            else:
                # JSON content
                message_parts = [{"type": "json", "content": json.dumps(content)}]
        else:
            # Fallback to legacy fields
            text_content = message.get("text") or message.get("content") or ""
            message_parts = [{"type": "text", "content": text_content}]
            
        # Prepare metadata from standardized format
        metadata = {
            "timestamp": standardized_message.get("timestamp") or datetime.utcnow().isoformat(),
            "message_id": message_uuid,
            "socket_message": True,
            "message_type": standardized_message.get("type")
        }
        
        # Add streaming flags if present
        if "streaming" in standardized_message:
            metadata["streaming"] = standardized_message["streaming"]
        if "turn_complete" in standardized_message:
            metadata["turn_complete"] = standardized_message["turn_complete"]
            
        # Add reply reference if present
        if standardized_message.get("in_reply_to"):
            metadata["in_reply_to"] = standardized_message["in_reply_to"]
            
        # Add any additional metadata from the message
        if standardized_message.get("metadata"):
            metadata.update(standardized_message["metadata"])
        elif message.get("metadata"):
            metadata.update(message["metadata"])
            
        # Log detailed information about message before saving
        logger.info(f"📝 SAVING MESSAGE 📝 session={session_id}, type={message_type.name}, agent_id={agent_id or 'None'}")
        logger.info(f"Message parts preview: {str(message_parts)[:100]}...")
        
        # Save to database using chat_service with retry logic
        retry_count = 0
        max_retries = 3
        retry_delay = 0.5  # seconds
        
        while retry_count < max_retries:
            try:
                saved_message = chat_service.save_message(
                    session_id=session_id,
                    msg_type=message_type,
                    agent_id=agent_id,
                    parts=message_parts,
                    message_metadata=metadata
                )
                logger.info(f"✅ MESSAGE SAVED ✅ id={saved_message.get('message_uuid')}, type={message_type.name}")
                
                if saved_message:
                    # Verify message was saved by reading it back
                    try:
                        from ..db_factory import get_message_by_uuid
                        verification = get_message_by_uuid(saved_message.get("message_uuid"))
                        if verification:
                            logger.info(f"✅ MESSAGE VERIFIED ✅ id={saved_message.get('message_uuid')}")
                            return True, None, saved_message.get("message_uuid")
                        else:
                            logger.warning(f"⚠️ MESSAGE VERIFICATION FAILED ⚠️ id={saved_message.get('message_uuid')}")
                            retry_count += 1
                            await asyncio.sleep(retry_delay)
                            continue
                    except Exception as verify_err:
                        logger.error(f"Error verifying message: {verify_err}", exc_info=True)
                        # Continue with success if verification fails but message save succeeded
                        return True, None, saved_message.get("message_uuid")
                else:
                    retry_count += 1
                    logger.warning(f"⚠️ MESSAGE SAVE RETURNED NONE (Retry {retry_count}/{max_retries}) ⚠️")
                    await asyncio.sleep(retry_delay)
                    continue
            except Exception as e:
                logger.error(f"❌ MESSAGE SAVE FAILED (Retry {retry_count+1}/{max_retries}) ❌: {e}", exc_info=True)
                retry_count += 1
                if retry_count < max_retries:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    return False, f"Error saving message after {max_retries} attempts: {str(e)}", None
        
        return False, "Failed to save message to database after retries", None
            
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
        # Log message details for debugging
        logger.info(f"⭐ HANDLING TEXT MESSAGE ⭐ id={message.get('id')} session={message.get('session_id') or message.get('sessionId')}")
        logger.info(f"Message format indicators: from_user={message.get('from_user')}, fromUser={message.get('fromUser')}, from_agent={message.get('from_agent')}, fromAgent={message.get('fromAgent')}, type={message.get('type')}")
        
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
                
                # Trigger agent response generation if the message is targeting an agent
                asyncio.create_task(
                    generate_agent_response(
                        sio=sio, 
                        session_id=session_id, 
                        agent_id=message.get("toAgent"), 
                        message=message,
                        namespace=namespace
                    )
                )
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
        
async def generate_agent_response(sio, session_id: str, agent_id: str, message: Dict[str, Any], namespace: str) -> None:
    """
    Generate a response from an agent after receiving a message targeted at it.
    
    Args:
        sio: SocketIO server instance
        session_id: Chat session ID
        agent_id: Target agent ID
        message: The original message sent to the agent (legacy or standardized format)
        namespace: Socket.IO namespace
    """
    try:
        # Import message adapter
        from .message_adapter import normalize_message, standard_to_legacy
        
        # Log detailed information about the message
        logger.info(f"⭐ AGENT RESPONSE GENERATION STARTED ⭐")
        logger.info(f"Generating response from agent {agent_id} for message {message.get('id')} in session {session_id}")
        logger.info(f"Message details: type={message.get('type')}, content={message.get('content') or message.get('text')}")
        logger.info(f"Using namespace: {namespace}")
        
        # Convert message to standardized format if needed
        standard_message = normalize_message(message)
        
        # Get agent instance from chat service
        from ..services.chat_service import chat_service
        agent = chat_service.get_agent(agent_id)
        
        if not agent:
            logger.error(f"Agent {agent_id} not found, cannot generate response")
            return
        
        logger.info(f"Successfully retrieved agent: {agent.id} ({agent.name if hasattr(agent, 'name') else 'Unknown'})")
        
        # Get ADK session for this chat session
        adk_session = chat_service.get_or_create_adk_session(session_id)
        
        if not adk_session:
            logger.error(f"Could not create or get ADK session for {session_id}")
            return
        
        logger.info(f"Successfully created/retrieved ADK session for {session_id}")
        
        # Extract text content from standardized message
        user_content = None
        if standard_message.get('content'):
            if isinstance(standard_message['content'], str):
                user_content = standard_message['content']
                logger.info(f"Using content from standardized message: {user_content[:50]}...")
            else:
                # JSON content, convert to string
                user_content = json.dumps(standard_message['content'])
                logger.info(f"Using serialized JSON content: {user_content[:50]}...")
        
        # Fallback to legacy format fields if needed
        if not user_content:
            user_content = message.get('text') or message.get('content') or 'Please respond to this message.'
            logger.info(f"Using fallback content extraction: {user_content[:50]}...")
        
        # Prepare variables for agent's system prompt
        template_vars = {
            "session_id": session_id,
            "user_name": standard_message.get('from_user', 'User'),
            "message_id": standard_message.get('id'),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        logger.info(f"Prepared template variables: {template_vars}")
        
        # Prepare agent context
        try:
            # Get agent-specific system prompt with all template variables filled in
            logger.debug(f"Getting system prompt for agent {agent_id}")
            system_prompt = agent.get_system_prompt(**template_vars)
            logger.info(f"Successfully retrieved system prompt for agent {agent_id} - {len(system_prompt)} chars")
        except Exception as prompt_err:
            logger.error(f"Error preparing agent system prompt: {prompt_err}", exc_info=True)
            system_prompt = "You are a helpful AI assistant."
            logger.info(f"Using fallback system prompt: {system_prompt}")
        
        # Generate response using ADK
        try:
            # Create response message in standardized format
            response_uuid = str(uuid.uuid4())
            response_timestamp = datetime.utcnow().isoformat()
            
            # Import message types from standardized schema
            from ..models.message_schema import MessageType as SocketMessageType
            
            logger.info(f"Creating initial empty response message with ID {response_uuid}")
            
            # Create initial empty response message in standardized format
            response_message = {
                "id": response_uuid,
                "type": SocketMessageType.TEXT,
                "session_id": session_id,
                "from_agent": agent_id,
                "content": "",  # Start with empty content for streaming
                "in_reply_to": standard_message.get('id'),
                "timestamp": response_timestamp,
                "streaming": True
            }
            
            # Convert to legacy format for backward compatibility
            legacy_response_message = {
                **response_message,
                "fromAgent": agent_id,
                "sessionId": session_id,
                "inReplyTo": standard_message.get('id'),
                "text": ""
            }
            
            # Store initial empty message to begin the response
            logger.debug(f"Storing initial empty message in database")
            initial_stored, initial_error, initial_uuid = await store_message(response_message)
            
            if not initial_stored:
                logger.error(f"Failed to store initial agent response message: {initial_error}")
                return
                
            logger.info(f"Initial empty message stored successfully with ID {initial_uuid}")
            
            # Broadcast initial message to session room
            room = f"session_{session_id}"
            logger.info(f"Broadcasting initial empty message to room {room}")
            
            # Send both standardized and legacy formats for maximum compatibility
            broadcast_message = {
                # Standardized fields
                **response_message,
                
                # Legacy fields
                "fromAgent": agent_id,
                "sessionId": session_id,
                "inReplyTo": standard_message.get('id'),
                "text": "",
            }
            
            await sio.emit(
                "message", 
                broadcast_message,
                room=room,
                namespace=namespace
            )
            logger.info(f"Initial empty message broadcast successfully")
            
            # Since we don't have direct access to ADK in this context, we'll call the agent to generate a response
            try:
                # Use agent's own method to generate response if available
                if hasattr(agent, 'generate_response') and callable(agent.generate_response):
                    # If agent has ADK-compatible generate_response method
                    logger.info(f"Agent {agent_id} has generate_response method, calling it")
                    logger.info(f"Calling generate_response with message: {user_content[:50]}...")
                    response_text = await agent.generate_response(
                        session=adk_session,
                        message=user_content,
                        system_prompt=system_prompt
                    )
                    logger.info(f"Agent {agent_id} generated response with generate_response: {response_text[:50]}...")
                else:
                    # Simulate response as fallback
                    logger.warning(f"Agent {agent_id} doesn't have generate_response method, using fallback")
                    
                    # Fallback to a simple response
                    import random
                    responses = [
                        f"I received your message: '{user_content[:50]}...' and I'm processing it.",
                        "I'm here to help! What would you like to know?",
                        "Thanks for your message. How can I assist you further?",
                        f"This is a simulated response from {agent.name if hasattr(agent, 'name') else agent_id}. In a production environment, I would generate an actual response using my AI model."
                    ]
                    response_text = random.choice(responses)
                    logger.info(f"Using fallback response: {response_text}")
                    
                    # Add a small delay to simulate processing time
                    logger.debug(f"Adding artificial delay for fallback response")
                    await asyncio.sleep(1)
                
                logger.info(f"Response text generated: {response_text[:100]}...")
                
                # Update the message with the generated content
                updated_message = {
                    **response_message,
                    "content": response_text,
                    "streaming": False,
                    "turn_complete": True
                }
                
                # Store the updated message with content
                logger.info(f"Saving final message with content to database")
                try:
                    # Note: chat_service.save_message is not an async function, so don't use await
                    saved_message = chat_service.save_message(
                        session_id=session_id,
                        msg_type=MessageType.AGENT,
                        agent_id=agent_id,
                        parts=[{"type": "text", "content": response_text}],
                        message_metadata={
                            "message_id": response_uuid,
                            "in_reply_to": standard_message.get('id'),
                            "timestamp": response_timestamp,
                            "streaming": False,
                            "turn_complete": True
                        }
                    )
                    
                    if saved_message:
                        logger.info(f"Final message saved successfully: {saved_message.get('message_uuid')}")
                    else:
                        logger.warning(f"No confirmation of final message save")
                    
                    # Broadcast completed message to session room
                    logger.info(f"Broadcasting final message to room {room}")
                    
                    # Prepare final broadcast message with both formats
                    final_broadcast_message = {
                        # Standardized fields
                        "id": response_uuid,
                        "type": SocketMessageType.TEXT.value,
                        "session_id": session_id,
                        "from_agent": agent_id,
                        "content": response_text,
                        "in_reply_to": standard_message.get('id'),
                        "timestamp": response_timestamp,
                        "streaming": False,
                        "turn_complete": True,
                        
                        # Legacy fields
                        "fromAgent": agent_id,
                        "sessionId": session_id,
                        "text": response_text,
                        "inReplyTo": standard_message.get('id')
                    }
                    
                    # Broadcast to room
                    await sio.emit(
                        "message",
                        final_broadcast_message,
                        room=room,
                        namespace=namespace
                    )
                    logger.info(f"Final message broadcast successful with content: {response_text[:50]}...")
                    
                except Exception as save_err:
                    logger.error(f"Error saving or broadcasting final message: {save_err}", exc_info=True)
                    raise
                
                # Extract key information and share context with other agents
                asyncio.create_task(
                    share_response_context(
                        sio=sio,
                        session_id=session_id,
                        source_agent_id=agent_id,
                        response_text=response_text,
                        namespace=namespace
                    )
                )
                
                logger.info(f"Agent {agent_id} generated and delivered response for message {standard_message.get('id')}")
                logger.info(f"⭐ AGENT RESPONSE GENERATION COMPLETED ⭐")
                
            except Exception as gen_err:
                logger.error(f"Error generating response from agent {agent_id}: {gen_err}", exc_info=True)
                
                # Create error message in standardized format
                error_message = {
                    # Standardized fields
                    "id": str(uuid.uuid4()),
                    "type": SocketMessageType.ERROR.value,
                    "session_id": session_id,
                    "from_agent": agent_id,
                    "content": f"Error generating response: {str(gen_err)}",
                    "in_reply_to": standard_message.get('id'),
                    "timestamp": datetime.utcnow().isoformat(),
                    
                    # Legacy fields
                    "fromAgent": agent_id,
                    "sessionId": session_id,
                    "inReplyTo": standard_message.get('id'),
                    "text": f"Error generating response: {str(gen_err)}"
                }
                
                logger.info(f"Broadcasting error message to room {room}")
                await sio.emit(
                    "message", 
                    error_message,
                    room=room,
                    namespace=namespace
                )
                logger.error(f"⭐ AGENT RESPONSE GENERATION FAILED ⭐")
                
        except Exception as e:
            logger.error(f"Failed to process agent response: {e}", exc_info=True)
            logger.error(f"⭐ AGENT RESPONSE GENERATION FAILED ⭐")
            
    except Exception as e:
        logger.error(f"Unhandled error in generate_agent_response: {e}", exc_info=True)
        logger.error(f"⭐ AGENT RESPONSE GENERATION FAILED ⭐")

async def share_response_context(sio, session_id: str, source_agent_id: str, response_text: str, namespace: str) -> None:
    """
    Extract context from agent responses and share with other agents.
    
    Args:
        sio: SocketIO server instance
        session_id: Chat session ID
        source_agent_id: Agent that generated the response
        response_text: The generated response content 
        namespace: Socket.IO namespace
    """
    try:
        logger.info(f"🔄 CONTEXT SHARING: Starting context sharing from agent {source_agent_id} in session {session_id}")
        logger.info(f"🔄 CONTEXT SHARING: Response text length: {len(response_text)} chars")
        
        # Import chat_service here to avoid unbound local variable error
        from ..services.chat_service import chat_service
        
        # Get all agents in the session
        agents = chat_service.get_agents()
        logger.info(f"🔄 CONTEXT SHARING: Got agents - type: {type(agents)}, count: {len(agents) if hasattr(agents, '__len__') else 'unknown'}")
        
        # Skip sharing if there's only one agent
        # Handle both dictionary and list return types from get_agents()
        if isinstance(agents, dict):
            logger.info(f"🔄 CONTEXT SHARING: Agents returned as dictionary with {len(agents)} items")
            active_agents = [a for a in agents.values() if hasattr(a, 'id') and a.id != source_agent_id]
        else:
            logger.info(f"🔄 CONTEXT SHARING: Agents returned as list or other type with {len(agents) if hasattr(agents, '__len__') else 'unknown'} items")
            active_agents = [a for a in agents if hasattr(a, 'id') and a.id != source_agent_id]
            
        logger.info(f"🔄 CONTEXT SHARING: Found {len(active_agents)} active agents other than source agent")
        
        if not active_agents:
            logger.info(f"🔄 CONTEXT SHARING: No other agents available for context sharing in session {session_id}")
            return
        
        # Log active agents
        for i, agent in enumerate(active_agents):
            logger.info(f"🔄 CONTEXT SHARING: Active agent {i+1}: {agent.id} ({agent.name if hasattr(agent, 'name') else 'unknown'})")
            
        # Extract a meaningful context summary from the response
        # (could be enhanced with better content extraction or summarization)
        context_data = {
            "content": response_text,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        logger.info(f"🔄 CONTEXT SHARING: Created context data with timestamp {context_data['timestamp']}")
        logger.info(f"🔄 CONTEXT SHARING: Context data content: {context_data['content'][:100]}...")
        
        # Share with all other agents in the session
        context_update_ids = []
        for agent in active_agents:
            try:
                logger.info(f"🔄 CONTEXT SHARING: Attempting to share context with agent {agent.id}")
                # Debug check if agent exists in the database
                agent_info = chat_service.get_agent(agent.id)
                logger.info(f"🔄 CONTEXT SHARING: Agent {agent.id} exists: {agent_info is not None}")
                
                context_update = context_service.share_context(
                    source_agent_id=source_agent_id,
                    target_agent_id=agent.id,
                    context_data=context_data,
                    session_id=session_id
                )
                context_update_ids.append(context_update["id"])
                logger.info(f"🔄 CONTEXT SHARING: Successfully shared context from {source_agent_id} to {agent.id} with ID {context_update['id']}")
                
                # Debug log the formatted context after sharing
                formatted = context_service.format_context_for_content(
                    target_agent_id=agent.id,
                    session_id=session_id
                )
                logger.info(f"🔄 CONTEXT SHARING: Formatted context for agent {agent.id}: {formatted[:100] if formatted else 'None'}...")
                
            except Exception as agent_err:
                logger.error(f"🔄 CONTEXT SHARING: Failed to share context with agent {agent.id}: {agent_err}", exc_info=True)
                
        # Only broadcast if context was actually shared
        if context_update_ids:
            # Broadcast context update event to clients
            context_update_msg = {
                "id": str(uuid.uuid4()),
                "type": "context_update",
                "session_id": session_id,
                "from_agent": source_agent_id,
                "context_ids": context_update_ids,
                "contextData": context_data,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await sio.emit(
                "context:update", 
                context_update_msg,
                room=f"session_{session_id}",
                namespace=namespace
            )
            
            # Also emit A2A message for other agents to be notified
            a2a_message = {
                "id": str(uuid.uuid4()),
                "type": "agent_message",
                "message_type": "context_update",
                "session_id": session_id,
                "from_agent": source_agent_id,
                "content": {
                    "context_ids": context_update_ids,
                    "summary": f"Agent {source_agent_id} shared context with other agents"
                },
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await sio.emit(
                "message", 
                a2a_message,
                room=f"session_{session_id}",
                namespace=namespace
            )
            
            logger.info(f"Context update broadcasts sent to session {session_id} for {len(context_update_ids)} context updates")
    except Exception as e:
        logger.error(f"Error in share_response_context: {e}", exc_info=True)

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