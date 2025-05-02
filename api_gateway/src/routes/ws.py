"""
WebSocket route for the API Gateway using ADK Streaming.

Handles real-time, bidirectional communication between the frontend
and a selected agent using the google-adk library based on the quickstart.
Saves messages to the database.
"""

import os
import json
import asyncio
import logging
import uuid
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

# FastAPI Imports
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from starlette.websockets import WebSocketState
from ..services.state import shared_state
from ..services.error_service import error_service
from ..models.error_responses import (
    ErrorCodes, ErrorCategory, ErrorSeverity, 
    WebSocketErrorResponse, create_websocket_error, create_adk_error
)

from dotenv import load_dotenv

# --- ADK Imports ---
print("DEBUG: Starting ADK imports in ws.py...")
try:
    from google.genai.types import Part, Content
    from google.adk.runners import Runner
    from google.adk.agents import LiveRequestQueue
    from google.adk.agents.run_config import RunConfig
    from google.adk.sessions.in_memory_session_service import InMemorySessionService
    print("DEBUG: Successfully imported ADK components in ws.py")
    ADK_AVAILABLE = True
except ImportError as e:
    print(f"DEBUG: Failed to import ADK components in ws.py: {str(e)}")
    logging.warning("google-adk library not found. WebSocket functionality will be limited.")
    ADK_AVAILABLE = False
    # Define dummy classes if ADK is not available to avoid runtime errors on import
    class Runner: pass
    class InMemorySessionService: pass
    class LiveRequestQueue: pass
    class RunConfig: pass
    class Content:
        def __init__(self, parts: List[Part], role: str = None):
            self.parts = parts
            self.role = role
    class Part:
        def __init__(self, text: str):
            self.text = text  # Match the real Part class structure

# --- Local Imports ---
from ..services.chat_service import chat_service
from ..models.messages import MessageType, MessageRole
from ..services.a2a_service import A2AService
from ..services.context_service import context_service

# --- Configuration ---
router = APIRouter()
logger = logging.getLogger(__name__)

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

APP_NAME = "TKR Multi-Agent Chat"

# --- ADK Setup (if available) ---
if ADK_AVAILABLE:
    async def start_agent_session(session_id: str, agent_id: str):
        """
        Starts an ADK agent session for streaming using the shared ADK Session.
        
        Args:
            session_id: The session ID to use
            agent_id: The agent ID to connect to
            
        Returns:
            Tuple[Any, LiveRequestQueue]: A tuple of (live_events, live_request_queue)
            
        Raises:
            WebSocketErrorResponse: Standardized error response for WebSocket clients
        """
        request_id = str(uuid.uuid4())
        logger.info(f"Starting or reusing ADK session {session_id} for agent {agent_id} (request_id: {request_id})")

        try:
            # Get the shared ADK session object from ChatService
            # Use session_id as user_id for simplicity here
            adk_session = chat_service.get_or_create_adk_session(session_id=session_id, user_id=session_id)
            if not adk_session:
                raise WebSocketErrorResponse(
                    error_code=ErrorCodes.ADK_SESSION_FAILED,
                    message=f"Failed to create or get ADK session for agent {agent_id}",
                    category=ErrorCategory.ADK,
                    severity=ErrorSeverity.ERROR,
                    details={
                        "session_id": session_id,
                        "agent_id": agent_id
                    },
                    request_id=request_id,
                    reconnect_suggested=True,
                    session_id=session_id,
                    agent_id=agent_id
                )

            # Get the specific agent instance from the global ChatService instance
            agent_instance = chat_service.get_agent(agent_id)
            if not agent_instance:
                logger.error(f"Agent instance '{agent_id}' not found in global ChatService.")
                raise WebSocketErrorResponse(
                    error_code=ErrorCodes.ADK_AGENT_NOT_FOUND,
                    message=f"Agent '{agent_id}' not found or not available",
                    category=ErrorCategory.ADK,
                    severity=ErrorSeverity.ERROR,
                    details={
                        "agent_id": agent_id,
                        "available_agents": [a.id for a in chat_service.get_agents()]
                    },
                    request_id=request_id,
                    reconnect_suggested=False,
                    close_connection=True,
                    session_id=session_id,
                    agent_id=agent_id
                )

            # Use the shared session service from ChatService
            if not chat_service.adk_session_service:
                raise WebSocketErrorResponse(
                    error_code=ErrorCodes.ADK_SESSION_FAILED,
                    message="ADK Session Service not initialized in ChatService",
                    category=ErrorCategory.ADK,
                    severity=ErrorSeverity.CRITICAL,
                    details={
                        "session_id": session_id,
                        "agent_id": agent_id
                    },
                    request_id=request_id,
                    reconnect_suggested=False,
                    close_connection=True,
                    session_id=session_id,
                    agent_id=agent_id
                )

            # Create the ADK runner
            try:
                runner = Runner(
                    app_name=APP_NAME,
                    agent=agent_instance,
                    session_service=chat_service.adk_session_service,
                )
                run_config = RunConfig(
                    response_modalities=["TEXT"]
                )
                live_request_queue = LiveRequestQueue()
                live_events = runner.run_live(
                    session=adk_session,
                    live_request_queue=live_request_queue,
                    run_config=run_config,
                )
                logger.info(f"ADK runner started for session {session_id}, agent {agent_id}")
                return live_events, live_request_queue
                
            except Exception as e:
                logger.exception(f"Error starting ADK runner for {agent_id}: {e}")
                raise WebSocketErrorResponse(
                    error_code=ErrorCodes.ADK_RUNNER_ERROR,
                    message=f"Failed to start ADK runner: {str(e)}",
                    category=ErrorCategory.ADK,
                    severity=ErrorSeverity.ERROR,
                    details={
                        "session_id": session_id,
                        "agent_id": agent_id,
                        "exception": str(e)
                    },
                    request_id=request_id,
                    reconnect_suggested=True,
                    session_id=session_id,
                    agent_id=agent_id
                )
                
        except WebSocketErrorResponse:
            # Re-raise WebSocketErrorResponse exceptions directly
            raise
        except Exception as e:
            # Convert other exceptions to WebSocketErrorResponse
            logger.exception(f"Unexpected error starting agent session for {agent_id}: {e}")
            raise WebSocketErrorResponse(
                error_code=ErrorCodes.ADK_SESSION_FAILED,
                message=f"Unexpected error starting agent session: {str(e)}",
                category=ErrorCategory.ADK,
                severity=ErrorSeverity.ERROR,
                details={
                    "session_id": session_id,
                    "agent_id": agent_id,
                    "exception": str(e),
                    "exception_type": type(e).__name__
                },
                request_id=request_id,
                reconnect_suggested=True,
                session_id=session_id,
                agent_id=agent_id
            )
else:
    async def start_agent_session(session_id: str, agent_id: str):
        """Fallback when ADK is not available."""
        logger.error("ADK library not available. Cannot start agent session.")
        raise WebSocketErrorResponse(
            error_code=ErrorCodes.ADK_NOT_AVAILABLE,
            message="ADK library not installed or available on the server",
            category=ErrorCategory.ADK,
            severity=ErrorSeverity.CRITICAL,
            details={
                "session_id": session_id,
                "agent_id": agent_id
            },
            request_id=str(uuid.uuid4()),
            reconnect_suggested=False,
            close_connection=True,
            session_id=session_id,
            agent_id=agent_id
        )

async def agent_to_client_messaging(
    websocket: WebSocket,
    live_events,
    session_id: str,
    agent_id: str
):
    """
    Listens to agent events, sends packets to client,
    and saves the final agent message to the database.
    
    Uses a lock to prevent concurrent access to the same WebSocket.
    
    Returns:
        Tuple[Any, Any] | None: A tuple of (live_events, live_request_queue) if reconnected,
                                None otherwise
                                
    Raises:
        WebSocketErrorResponse: Standardized error for WebSocket clients
        WebSocketDisconnect: When client disconnects
    """
    request_id = str(uuid.uuid4())
    logger.debug(f"[{agent_id}] Starting agent_to_client_messaging loop. (request_id: {request_id})")
    accumulated_text = ""
    final_event_processed = False
    message_saved_in_loop = False
    last_activity_time = datetime.utcnow()
    
    # Get a lock for this websocket
    websocket_lock = shared_state.get_websocket_lock(websocket)
    
    try:
        async for event in live_events:
            # Update activity timestamp
            last_activity_time = datetime.utcnow()
            
            logger.debug(f"[{agent_id}] Received ADK event type: {type(event)}")
            logger.debug(f"[{agent_id}] Event details: {vars(event)}")
            final_event_processed = False

            # Extract message parts safely with proper error handling
            try:
                part: Optional[Part] = (
                    event.content and event.content.parts and event.content.parts[0]
                )
                
                if part:
                    logger.debug(f"[{agent_id}] Part details: {vars(part)}")
                
                text_chunk = getattr(part, 'text', None)
                is_partial_content = getattr(event, 'partial', True)
                is_final_turn = event.turn_complete or event.interrupted
                
                logger.debug(
                    f"[{agent_id}] Text chunk: {text_chunk[:100] if text_chunk else None}, "
                    f"Partial: {is_partial_content}, Final: {is_final_turn}"
                )
            except Exception as parsing_error:
                logger.error(f"[{agent_id}] Error parsing ADK event: {parsing_error}")
                # Create a standardized error response
                raise WebSocketErrorResponse(
                    error_code=ErrorCodes.ADK_RUNNER_ERROR,
                    message="Error parsing ADK event data",
                    category=ErrorCategory.ADK,
                    severity=ErrorSeverity.ERROR,
                    details={
                        "session_id": session_id,
                        "agent_id": agent_id,
                        "error": str(parsing_error),
                        "event_type": str(type(event))
                    },
                    request_id=request_id,
                    reconnect_suggested=True,
                    session_id=session_id,
                    agent_id=agent_id
                )

            # Handle full message resets
            if not is_partial_content and text_chunk:
                logger.debug(f"[{agent_id}] Received full message event. Resetting accumulator.")
                accumulated_text = ""

            # Send text chunks to client - use the lock to prevent concurrent sends
            if text_chunk:
                try:
                    chunk_packet = {"message": text_chunk, "turn_complete": False}
                    
                    # Use the lock when sending messages
                    async with websocket_lock:
                        await websocket.send_text(json.dumps(chunk_packet))
                        
                    logger.debug(f"[{agent_id}] Sent text chunk: '{text_chunk}'")
                    accumulated_text += text_chunk
                except Exception as send_error:
                    logger.error(f"[{agent_id}] Failed to send text chunk: {send_error}")
                    if isinstance(send_error, WebSocketDisconnect):
                        raise  # Re-raise WebSocketDisconnect for proper handling
                    
                    # For other errors, create a standardized error response
                    raise WebSocketErrorResponse(
                        error_code=ErrorCodes.WS_MESSAGE_ERROR,
                        message="Failed to send message chunk to client",
                        category=ErrorCategory.WEBSOCKET,
                        severity=ErrorSeverity.ERROR,
                        details={
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "error": str(send_error)
                        },
                        request_id=request_id,
                        reconnect_suggested=True,
                        session_id=session_id,
                        agent_id=agent_id
                    )

            # Handle turn completion
            if is_final_turn:
                saved_message_uuid = None
                if accumulated_text.strip():
                    try:
                        # Prepare message data
                        message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                        msg_metadata = {
                            "timestamp": datetime.utcnow().isoformat(),
                            "streaming": False,
                            "used_context": True,
                            "request_id": request_id
                        }
                        
                        # Save the message
                        saved_message = chat_service.save_message(
                            session_id=session_id,
                            msg_type=MessageType.AGENT,
                            agent_id=agent_id,
                            parts=message_parts,
                            message_metadata=msg_metadata
                        )

                        # Share message as context with other agents
                        try:
                            other_agents = [a for a in chat_service.get_agents() if a.id != agent_id]
                            for other_agent in other_agents:
                                context_service.share_context(
                                    source_agent_id=agent_id,
                                    target_agent_id=other_agent.id,
                                    context_data={
                                        "content": accumulated_text.strip()
                                    },
                                    session_id=session_id
                                )
                            logger.debug(f"[{agent_id}] Shared context with {len(other_agents)} other agents")
                        except Exception as context_error:
                            logger.error(f"[{agent_id}] Error sharing context: {context_error}")
                            # Continue execution - context sharing failure shouldn't stop the flow

                        # Extract message UUID and send confirmation
                        saved_message_uuid = saved_message['message_uuid']
                        logger.info(f"[{agent_id}] Saved agent message to DB (UUID: {saved_message_uuid}): '{accumulated_text[:50]}...'")
                        message_saved_in_loop = True

                        try:
                            confirmation_packet = {
                                "type": "message_saved",
                                "agent_id": agent_id,
                                "message_uuid": saved_message_uuid
                            }
                            # Use the lock when sending messages
                            async with websocket_lock:
                                await websocket.send_text(json.dumps(confirmation_packet))
                                
                            logger.debug(f"[{agent_id}] Sent message_saved confirmation for {saved_message_uuid}")
                        except Exception as send_err:
                            logger.error(f"[{agent_id}] Failed to send message_saved confirmation: {send_err}")
                            # Don't raise here - this is not critical to the core functionality

                    except Exception as db_err:
                        logger.error(f"[{agent_id}] Failed to save agent message to DB: {db_err}", exc_info=True)
                        # Create a standardized DB error response, but don't throw it here
                        # Just log it and continue with the turn completion
                        error_service.log_error(
                            WebSocketErrorResponse(
                                error_code=ErrorCodes.DB_QUERY_ERROR,
                                message="Failed to save agent message to database",
                                category=ErrorCategory.DATABASE,
                                severity=ErrorSeverity.ERROR,
                                details={
                                    "session_id": session_id,
                                    "agent_id": agent_id,
                                    "error": str(db_err)
                                },
                                request_id=request_id,
                                session_id=session_id,
                                agent_id=agent_id
                            )
                        )

                # Send turn completion packet
                try:
                    response_packet = {
                        "turn_complete": True,
                        "interrupted": event.interrupted if event.interrupted else False
                    }
                    # Use the lock when sending messages
                    async with websocket_lock:
                        await websocket.send_text(json.dumps(response_packet))
                        
                    final_event_processed = True

                    if event.interrupted:
                        logger.info(f"[{agent_id}] ADK event: Interrupted.")
                    else:
                        logger.info(f"[{agent_id}] ADK event: Turn complete.")
                except Exception as send_err:
                    logger.error(f"[{agent_id}] Failed to send turn completion: {send_err}")
                    if isinstance(send_err, WebSocketDisconnect):
                        raise  # Re-raise WebSocketDisconnect
                    
                    # For other errors, raise a standardized error
                    raise WebSocketErrorResponse(
                        error_code=ErrorCodes.WS_MESSAGE_ERROR,
                        message="Failed to send turn completion to client",
                        category=ErrorCategory.WEBSOCKET,
                        severity=ErrorSeverity.ERROR,
                        details={
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "error": str(send_err)
                        },
                        request_id=request_id,
                        reconnect_suggested=True,
                        session_id=session_id,
                        agent_id=agent_id
                    )

                # Reset accumulated text for next turn
                accumulated_text = ""

        # End of event stream - check if we need to save any remaining text
        if not message_saved_in_loop and accumulated_text.strip():
            logger.warning(f"[{agent_id}] Safeguard: Saving accumulated text because loop finished unexpectedly before final save.")
            try:
                message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                msg_metadata = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "streaming": False,
                    "used_context": True,
                    "request_id": request_id,
                    "safeguard_save": True  # Mark this as a safeguard save
                }
                saved_message = chat_service.save_message(
                    session_id=session_id,
                    msg_type=MessageType.AGENT,
                    agent_id=agent_id,
                    parts=message_parts,
                    message_metadata=msg_metadata
                )
                
                if saved_message:
                    try:
                        confirmation_packet = {
                            "type": "message_saved",
                            "agent_id": agent_id,
                            "message_uuid": saved_message['message_uuid'],
                            "safeguard": True
                        }
                        # Use the lock when sending messages
                        async with websocket_lock:
                            await websocket.send_text(json.dumps(confirmation_packet))
                            
                        logger.debug(f"[{agent_id}] Safeguard: Sent message_saved confirmation for {saved_message['message_uuid']}")
                    except Exception as send_err:
                        logger.error(f"[{agent_id}] Safeguard: Failed to send message_saved confirmation: {send_err}")
            except Exception as db_err:
                logger.error(f"[{agent_id}] Safeguard: Failed to save final agent message to DB: {db_err}", exc_info=True)

    except WebSocketDisconnect:
        logger.info(f"[{agent_id}] Client disconnected during agent_to_client messaging.")
        raise  # Re-raise to properly handle disconnection
        
    except WebSocketErrorResponse:
        # Re-raise WebSocketErrorResponse for proper handling at the endpoint level
        raise
        
    except Exception as e:
        logger.exception(f"[{agent_id}] Error in agent_to_client_messaging: {e}")
        
        # Check if we need to attempt a session restart
        try:
            # Check if it's an ADK WebSocket error or connection issue
            if "invalid frame payload data" in str(e) or "connection" in str(e).lower():
                logger.info(f"[{agent_id}] ADK connection error detected, attempting reconnection...")
                
                # Clear and restart ADK session
                chat_service.clear_adk_session(session_id)
                
                try:
                    new_events, new_queue = await start_agent_session(session_id, agent_id)
                    if new_events and new_queue:
                        logger.info(f"[{agent_id}] Successfully reconnected ADK session")
                        # Send a reconnection notification to the client
                        try:
                            # Use the lock when sending messages
                            async with websocket_lock:
                                await websocket.send_text(json.dumps({
                                    "type": "reconnected",
                                    "agent_id": agent_id,
                                    "session_id": session_id
                                }))
                        except Exception:
                            pass  # Ignore send errors here
                        
                        # Return the new events and queue to the main loop
                        return new_events, new_queue
                except WebSocketErrorResponse as ws_error:
                    # Re-raise standardized errors
                    raise ws_error
                except Exception as reconnect_err:
                    logger.error(f"[{agent_id}] Failed to reconnect ADK session: {reconnect_err}")
                    raise WebSocketErrorResponse(
                        error_code=ErrorCodes.ADK_SESSION_FAILED,
                        message=f"Failed to reconnect ADK session: {str(reconnect_err)}",
                        category=ErrorCategory.ADK,
                        severity=ErrorSeverity.ERROR,
                        details={
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "original_error": str(e),
                            "reconnect_error": str(reconnect_err)
                        },
                        request_id=request_id,
                        reconnect_suggested=True,
                        session_id=session_id,
                        agent_id=agent_id
                    )
            
            # For other errors, create a standardized error response
            raise WebSocketErrorResponse(
                error_code=ErrorCodes.ADK_RUNNER_ERROR,
                message=f"Error in agent_to_client_messaging: {str(e)}",
                category=ErrorCategory.ADK, 
                severity=ErrorSeverity.ERROR,
                details={
                    "session_id": session_id,
                    "agent_id": agent_id,
                    "error": str(e),
                    "accumulated_text_length": len(accumulated_text) if accumulated_text else 0
                },
                request_id=request_id,
                reconnect_suggested=True,
                session_id=session_id,
                agent_id=agent_id
            )
            
        except Exception as handler_err:
            # Last resort error handling
            logger.error(f"[{agent_id}] Failed to handle messaging error: {handler_err}")
            raise WebSocketErrorResponse(
                error_code=ErrorCodes.INTERNAL_ERROR,
                message="Unhandled server error in messaging",
                category=ErrorCategory.GENERAL,
                severity=ErrorSeverity.CRITICAL,
                details={
                    "session_id": session_id,
                    "agent_id": agent_id,
                    "original_error": str(e),
                    "handler_error": str(handler_err)
                },
                request_id=request_id,
                reconnect_suggested=False,
                close_connection=True,
                session_id=session_id,
                agent_id=agent_id
            )
            
    finally:
        logger.debug(f"[{agent_id}] Exiting agent_to_client_messaging loop. (request_id: {request_id})")

async def client_to_agent_messaging(
    websocket: WebSocket,
    live_request_queue: LiveRequestQueue,
    session_id: str,
    agent_id: str
):
    """
    Receives messages from client, saves user message to DB,
    and sends them to the agent via LiveRequestQueue.
    History is managed by the shared ADK Session.
    
    Uses a lock to prevent concurrent access to the same WebSocket.
    """
    logger.debug(f"[{agent_id}] Starting client_to_agent_messaging loop.")
    
    # Get a lock for this websocket
    websocket_lock = shared_state.get_websocket_lock(websocket)
    
    try:
        while True:
            # Use the lock when receiving messages to prevent concurrent access
            async with websocket_lock:
                try:
                    data = await websocket.receive_json()
                except Exception as e:
                    logger.error(f"[{agent_id}] Error receiving message: {e}")
                    if isinstance(e, WebSocketDisconnect):
                        return "DISCONNECT"
                    continue  # Try again if possible
            
            message_type = data.get("type", "text")
            logger.info(f"[{agent_id}] Received {message_type} from client")

            if message_type == "task":
                task_action = data.get("action")
                task_id = data.get("task_id")
                a2a_service = A2AService()

                if task_action == "start":
                    task = await a2a_service.create_task(
                        session_id=session_id,
                        title=data.get("title"),
                        description=data.get("description"),
                        agent_ids=[agent_id],
                        context=data.get("context")
                    )
                    new_user_content = Content(
                        parts=[Part(text=f"Task created: {task.title}")],
                        role="user"
                    )
                    live_request_queue.send_content(content=new_user_content)

                elif task_action == "update":
                    task = await a2a_service.update_task_status(
                        task_id=task_id,
                        status=data.get("status"),
                        result=data.get("result")
                    )
                    new_user_content = Content(
                        parts=[Part(text=f"Task {task_id} updated: {task.status}")],
                        role="user"
                    )
                    live_request_queue.send_content(content=new_user_content)

            else:
                text = data.get("text", "")
                logger.info(f"[{agent_id}] Received text from client: '{text[:50]}...'")

                try:
                    message_parts = [{"type": "text", "content": text.strip()}]
                    msg_metadata = {"timestamp": datetime.utcnow().isoformat()}
                    saved_message = chat_service.save_message(
                        session_id=session_id,
                        msg_type=MessageType.USER,
                        parts=message_parts,
                        message_metadata=msg_metadata
                    )

                    # Don't share user messages as context - they'll be part of the conversation history
                    logger.debug(f"[{agent_id}] User message saved, proceeding with direct message handling")
                    logger.info(f"[{agent_id}] Saved user message to DB: '{text[:50]}...'")
                except Exception as db_err:
                    logger.error(f"[{agent_id}] Failed to save user message to DB: {db_err}", exc_info=True)

                # Fetch context and combine with user message
                try:
                    context_text = context_service.format_context_for_content(
                        target_agent_id=agent_id,
                        session_id=session_id
                    )
                    
                    # Combine context and user message
                    combined_text = text
                    if context_text:
                        logger.debug(f"[{agent_id}] Adding context: {context_text[:100]}...")
                        combined_text = f"{context_text}\nUser message: {text}"

                    # Send combined message
                    new_content = Content(
                        parts=[Part(text=combined_text)],
                        role="user"
                    )
                    live_request_queue.send_content(content=new_content)
                    logger.debug(f"[{agent_id}] Sent combined content to agent's LiveRequestQueue.")
                except Exception as e:
                    logger.error(f"[{agent_id}] Failed to send user message: {e}", exc_info=True)
                    # Try to reconnect ADK session
                    try:
                        chat_service.clear_adk_session(session_id)
                        live_events, live_request_queue = await start_agent_session(session_id, agent_id)
                        logger.info(f"[{agent_id}] Successfully reconnected ADK session")
                    except Exception as reconnect_err:
                        logger.error(f"[{agent_id}] Failed to reconnect ADK session: {reconnect_err}")
                        raise

    except WebSocketDisconnect:
        logger.info(f"[{agent_id}] Client disconnected during client_to_agent messaging.")
        return "DISCONNECT"
    except Exception as e:
        logger.exception(f"[{agent_id}] Error in client_to_agent_messaging: {e}")
        # Don't return, let the loop continue
    finally:
        logger.debug(f"[{agent_id}] Exiting client_to_agent_messaging loop.")
        return None

@router.websocket("/chat/{session_id}/{agent_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    agent_id: str,
):
    """
    WebSocket endpoint for streaming chat with a specific agent using ADK.
    Saves messages to the database and uses standardized error handling.
    """
    # Generate a request ID for this connection
    request_id = str(uuid.uuid4())
    
    # Accept the connection
    await websocket.accept()
    logger.info(f"WebSocket client connected for session {session_id}, agent {agent_id} (request_id: {request_id})")

    # Add connection to active websockets
    shared_state.add_websocket(websocket)

    live_events = None
    live_request_queue = None

    try:
        # Check if ADK is available
        if not ADK_AVAILABLE:
            error_resp = WebSocketErrorResponse(
                error_code=ErrorCodes.ADK_NOT_AVAILABLE,
                message="ADK library not available on the server",
                category=ErrorCategory.ADK,
                severity=ErrorSeverity.CRITICAL,
                details={"session_id": session_id, "agent_id": agent_id},
                request_id=request_id,
                reconnect_suggested=False,
                close_connection=True,
                session_id=session_id,
                agent_id=agent_id
            )
            await error_service.send_websocket_error(
                websocket=websocket,
                error=error_resp,
                close_connection=True
            )
            return

        # Get or create session in DB before starting ADK
        try:
            session = chat_service.get_session(session_id)
            if not session:
                logger.info(f"Creating new session for WebSocket connection: {session_id}")
                session = chat_service.create_session(session_id=session_id)
                if not session:
                    raise ValueError(f"Failed to create session {session_id}")
        except Exception as e:
            error_resp = WebSocketErrorResponse(
                error_code=ErrorCodes.DB_QUERY_ERROR,
                message=f"Database error: {str(e)}",
                category=ErrorCategory.DATABASE,
                severity=ErrorSeverity.ERROR,
                details={"session_id": session_id, "agent_id": agent_id},
                request_id=request_id,
                reconnect_suggested=True,
                session_id=session_id,
                agent_id=agent_id
            )
            await error_service.send_websocket_error(websocket, error_resp)
            return

        # Start the specific agent session using the shared ADK session
        try:
            live_events, live_request_queue = await start_agent_session(session_id, agent_id)
        except WebSocketErrorResponse as ws_error:
            # Already formatted with proper error structure
            await error_service.send_websocket_error(
                websocket=websocket,
                error=ws_error,
                close_connection=getattr(ws_error, "close_connection", False)
            )
            if getattr(ws_error, "close_connection", False):
                return
        except Exception as e:
            # Convert generic exception to WebSocketErrorResponse
            error_resp = WebSocketErrorResponse(
                error_code=ErrorCodes.ADK_SESSION_FAILED,
                message=f"Failed to start agent session: {str(e)}",
                category=ErrorCategory.ADK,
                severity=ErrorSeverity.ERROR,
                details={"session_id": session_id, "agent_id": agent_id, "error": str(e)},
                request_id=request_id,
                reconnect_suggested=True,
                session_id=session_id,
                agent_id=agent_id
            )
            await error_service.send_websocket_error(websocket, error_resp)
            return

        # --- Main communication loop ---
        while True:
            # Run both tasks and wait for either to complete
            try:
                agent_to_client_task = asyncio.create_task(
                    agent_to_client_messaging(websocket, live_events, session_id, agent_id)
                )
                client_to_agent_task = asyncio.create_task(
                    client_to_agent_messaging(websocket, live_request_queue, session_id, agent_id)
                )

                # Wait for either task to complete with a timeout
                done, pending = await asyncio.wait(
                    [agent_to_client_task, client_to_agent_task],
                    return_when=asyncio.FIRST_COMPLETED,
                    timeout=60  # Add 60 second timeout
                )
                
                # Check for timeout (no tasks completed)
                if not done:
                    logger.warning(f"[{agent_id}] Communication tasks timed out after 60s")
                    error_resp = WebSocketErrorResponse(
                        error_code=ErrorCodes.WS_TIMEOUT,
                        message="WebSocket communication timed out after 60 seconds",
                        category=ErrorCategory.WEBSOCKET,
                        severity=ErrorSeverity.WARNING,
                        details={"timeout_seconds": 60, "session_id": session_id, "agent_id": agent_id},
                        request_id=request_id,
                        reconnect_suggested=True,
                        session_id=session_id,
                        agent_id=agent_id
                    )
                    await error_service.send_websocket_error(websocket, error_resp, close_connection=False)
                    
                    # Cancel pending tasks
                    for task in pending:
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass
                    
                    # Create new tasks and continue
                    continue

                # Check results of completed tasks
                for task in done:
                    try:
                        if task == agent_to_client_task:
                            result = await task
                            if isinstance(result, tuple) and len(result) == 2:
                                logger.info(f"[{agent_id}] Received new ADK session from reconnection")
                                live_events, live_request_queue = result
                                # Cancel pending tasks
                                for p in pending:
                                    p.cancel()
                                    try:
                                        await p
                                    except asyncio.CancelledError:
                                        pass
                                # Continue with new session
                                continue
                        elif task == client_to_agent_task:
                            # Check if client disconnected
                            result = await task
                            if result == "DISCONNECT":
                                logger.info(f"[{agent_id}] Client disconnected, exiting loop.")
                                return
                    except WebSocketErrorResponse as ws_error:
                        # Handle structured WebSocket error
                        await error_service.send_websocket_error(
                            websocket=websocket,
                            error=ws_error,
                            close_connection=getattr(ws_error, "close_connection", False)
                        )
                        if getattr(ws_error, "close_connection", False):
                            return
                        # For non-closing errors, continue the loop
                    except Exception as e:
                        logger.error(f"[{agent_id}] Error processing task result: {e}")
                        # Send a standardized error message
                        error_resp = WebSocketErrorResponse(
                            error_code=ErrorCodes.WS_MESSAGE_ERROR,
                            message=f"Error processing message: {str(e)}",
                            category=ErrorCategory.WEBSOCKET,
                            severity=ErrorSeverity.ERROR,
                            details={"session_id": session_id, "agent_id": agent_id, "error": str(e)},
                            request_id=request_id,
                            reconnect_suggested=True,
                            session_id=session_id,
                            agent_id=agent_id
                        )
                        await error_service.send_websocket_error(websocket, error_resp)
                        
                        # Only break if it's a fatal error
                        if "invalid frame payload data" in str(e):
                            break

                # Cancel pending tasks and start new ones
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

                # Create new tasks and continue the loop
                agent_to_client_task = asyncio.create_task(
                    agent_to_client_messaging(websocket, live_events, session_id, agent_id)
                )
                client_to_agent_task = asyncio.create_task(
                    client_to_agent_messaging(websocket, live_request_queue, session_id, agent_id)
                )

            except asyncio.CancelledError:
                logger.info(f"[{agent_id}] Tasks cancelled, exiting loop.")
                break
            except WebSocketDisconnect:
                logger.info(f"[{agent_id}] Client disconnected during communication loop.")
                break
            except Exception as e:
                # Log and continue for non-fatal errors
                logger.error(f"[{agent_id}] Error in communication loop: {e}")
                # Send a standardized error message
                error_resp = WebSocketErrorResponse(
                    error_code=ErrorCodes.WS_MESSAGE_ERROR,
                    message=f"Error in WebSocket communication: {str(e)}",
                    category=ErrorCategory.WEBSOCKET,
                    severity=ErrorSeverity.ERROR,
                    details={"session_id": session_id, "agent_id": agent_id, "error": str(e)},
                    request_id=request_id,
                    reconnect_suggested=True,
                    session_id=session_id,
                    agent_id=agent_id
                )
                await error_service.send_websocket_error(websocket, error_resp)
                # Continue the loop for recoverable errors
                continue

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}, agent {agent_id}")
    except asyncio.CancelledError:
        logger.info(f"WebSocket tasks cancelled for session {session_id}, agent {agent_id}")
    except Exception as e:
        logger.exception(f"Unexpected error in WebSocket endpoint for session {session_id}, agent {agent_id}: {e}")
        try:
            # Send a standardized error message for unexpected errors
            error_resp = WebSocketErrorResponse(
                error_code=ErrorCodes.INTERNAL_ERROR,
                message=f"Unexpected server error: {str(e)}",
                category=ErrorCategory.GENERAL,
                severity=ErrorSeverity.ERROR,
                details={"session_id": session_id, "agent_id": agent_id},
                request_id=request_id,
                reconnect_suggested=True,
                close_connection=True,
                session_id=session_id,
                agent_id=agent_id
            )
            await error_service.send_websocket_error(websocket, error_resp, close_connection=True)
        except Exception:
            pass
    finally:
        logger.info(f"Closing WebSocket connection for session {session_id}, agent {agent_id}")
        try:
            # Remove from active connections
            shared_state.remove_websocket(websocket)
            
            # Clean up ADK session
            chat_service.clear_adk_session(session_id)
            
            # Ensure WebSocket is closed
            if not websocket.client_state == WebSocketState.DISCONNECTED:
                await websocket.close()
        except Exception as e:
            logger.error(f"Error during WebSocket cleanup: {e}")
