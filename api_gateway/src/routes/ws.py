"""
WebSocket route for the API Gateway using ADK Streaming.

Handles real-time, bidirectional communication between the frontend
and a selected agent using the google-adk library based on the quickstart.
Saves messages to the database.
"""

import os
import json
import time
import asyncio
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

# FastAPI Imports
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from starlette.websockets import WebSocketState
from ..services.state import shared_state

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

class WebSocketCoordinator:
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.receive_lock = asyncio.Lock()
        self.send_lock = asyncio.Lock()
        self.is_receiving = False
        self.max_retries = 3
        self.current_attempt = 0
        self.base_delay = 1.0
        self.active = True
        self.last_heartbeat = time.time()
        self.heartbeat_interval = 30  # 30 seconds
        self.stale_threshold = 90  # 90 seconds
        self.check_connection_task = None

    async def start_connection_checker(self):
        """Start the connection checker task"""
        if self.check_connection_task is None:
            self.check_connection_task = asyncio.create_task(self._check_connection())
            logger.info(f"[{self.agent_id}] Started connection checker task")

    async def _check_connection(self):
        """Periodically check if the connection is stale"""
        while self.active:
            try:
                time_since_heartbeat = time.time() - self.last_heartbeat
                if time_since_heartbeat > self.stale_threshold:
                    logger.warning(f"[{self.agent_id}] Connection appears stale (no heartbeat for {time_since_heartbeat:.1f}s)")
                    # Let the main loop handle reconnection
                    self.active = False
                await asyncio.sleep(self.heartbeat_interval)
            except Exception as e:
                logger.error(f"[{self.agent_id}] Error in connection checker: {e}")
                await asyncio.sleep(self.heartbeat_interval)

    def update_heartbeat(self):
        """Update the last heartbeat timestamp"""
        self.last_heartbeat = time.time()
        
    async def safe_receive(self, websocket: WebSocket):
        """Safely receive a message with coordination"""
        if not self.active:
            return None
            
        if self.is_receiving:
            logger.warning(f"[{self.agent_id}] Blocked concurrent receive attempt")
            return None
            
        async with self.receive_lock:
            try:
                self.is_receiving = True
                try:
                    return await websocket.receive_json()
                except RuntimeError as e:
                    if "disconnect message has been received" in str(e):
                        logger.info(f"[{self.agent_id}] WebSocket disconnected, attempting reconnection")
                        # Don't raise, let reconnection handle it
                        return None
                    raise
            except Exception as e:
                logger.error(f"[{self.agent_id}] Error in safe_receive: {e}")
                return None
            finally:
                self.is_receiving = False
                
    async def check_websocket_state(self, websocket: WebSocket) -> bool:
        """Check if WebSocket is in a valid state for sending messages"""
        try:
            if websocket.client_state == WebSocketState.DISCONNECTED:
                logger.warning(f"[{self.agent_id}] WebSocket is disconnected")
                return False
            if not self.active:
                logger.warning(f"[{self.agent_id}] Coordinator is not active")
                return False
            return True
        except Exception as e:
            logger.error(f"[{self.agent_id}] Error checking WebSocket state: {e}")
            return False

    async def safe_send(self, websocket: WebSocket, data: Any):
        """Safely send a message with coordination"""
        if not await self.check_websocket_state(websocket):
            return
            
        async with self.send_lock:
            try:
                await websocket.send_text(json.dumps(data))
            except RuntimeError as e:
                if "disconnect message has been received" in str(e):
                    logger.info(f"[{self.agent_id}] WebSocket disconnected during send")
                    # Don't raise, let reconnection handle it
                    return
                raise
            except Exception as e:
                logger.error(f"[{self.agent_id}] Error in safe_send: {e}")
                # Mark connection as potentially problematic
                self.last_heartbeat = 0  # Force next heartbeat check to fail
            
    async def handle_error(self, error: Exception) -> bool:
        """Returns True if should retry, False if should exit"""
        if not self.active or self.current_attempt >= self.max_retries:
            logger.error(f"[{self.agent_id}] Max retries ({self.max_retries}) reached")
            return False
            
        delay = self.base_delay * (2 ** self.current_attempt)
        logger.warning(f"[{self.agent_id}] Retry attempt {self.current_attempt + 1} after {delay}s delay")
        await asyncio.sleep(delay)
        self.current_attempt += 1
        return True
        
    def reset(self):
        """Reset attempt counter after successful operation"""
        self.current_attempt = 0
        
    async def stop(self):
        """Stop the coordinator and cleanup tasks"""
        self.active = False
        if self.check_connection_task:
            self.check_connection_task.cancel()
            try:
                await self.check_connection_task
            except asyncio.CancelledError:
                pass
            self.check_connection_task = None

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

APP_NAME = "TKR Multi-Agent Chat"

# --- ADK Setup (if available) ---
if ADK_AVAILABLE:
    async def start_agent_session(session_id: str, agent_id: str):
        """
        Starts an ADK agent session for streaming using a dedicated ADK Session per agent.
        """
        logger.info(f"Starting or reusing ADK session {session_id} for agent {agent_id}")

        # Create a unique session ID for this agent
        agent_session_id = f"{session_id}_{agent_id}"
        
        # Get or create a dedicated ADK session for this agent
        adk_session = chat_service.get_or_create_adk_session(session_id=agent_session_id, user_id=session_id)
        if not adk_session:
            raise RuntimeError("Failed to get or create ADK session.")

        # Get the specific agent instance from the global ChatService instance
        agent_instance = chat_service.get_agent(agent_id)
        if not agent_instance:
             logger.error(f"Agent instance '{agent_id}' not found in global ChatService.")
             raise ValueError(f"Agent '{agent_id}' not found.")

        # Use the shared session service from ChatService
        if not chat_service.adk_session_service:
             raise RuntimeError("ADK Session Service not initialized in ChatService.")

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
else:
    async def start_agent_session(session_id: str, agent_id: str):
        logger.error("ADK library not available. Cannot start agent session.")
        raise RuntimeError("ADK library not installed or available.")

async def agent_to_client_messaging(
    websocket: WebSocket,
    live_events,
    session_id: str,
    agent_id: str,
    coordinator: WebSocketCoordinator
):
    """
    Listens to agent events, sends packets to client,
    and saves the final agent message to the database.
    """
    logger.debug(f"[{agent_id}] Starting agent_to_client_messaging loop.")
    
    accumulated_text = ""
    final_event_processed = False
    message_saved_in_loop = False
    try:
        async for event in live_events:
            if not coordinator.active:
                break

            # Check for cancellation
            if asyncio.current_task().cancelled():
                logger.info(f"[{agent_id}] Task cancelled, cleaning up")
                return None

            logger.debug(f"[{agent_id}] Received ADK event type: {type(event)}")
            logger.debug(f"[{agent_id}] Event details: {vars(event)}")
            final_event_processed = False

            part: Optional[Part] = (
                event.content and event.content.parts and event.content.parts[0]
            )
            if part:
                logger.debug(f"[{agent_id}] Part details: {vars(part)}")
            text_chunk = getattr(part, 'text', None)
            is_partial_content = getattr(event, 'partial', True)
            logger.debug(f"[{agent_id}] Text chunk: {text_chunk[:100] if text_chunk else None}, Partial: {is_partial_content}")

            response_packet: Dict[str, Any] = {}
            is_final_turn = event.turn_complete or event.interrupted

            if not is_partial_content and text_chunk:
                 logger.debug(f"[{agent_id}] Received full message event.")
                 logger.info(f"[{agent_id}] Full message event received but continuing to accumulate. Current length: {len(accumulated_text)}")

            if text_chunk:
                if text_chunk.strip():
                    logger.info(f"[{agent_id}] Processing text chunk: length={len(text_chunk)}, content='{text_chunk}'")
                    logger.info(f"[{agent_id}] Current accumulated length: {len(accumulated_text)}")
                    
                    if text_chunk.endswith(('...', '…')):
                        logger.warning(f"[{agent_id}] Detected potential truncation marker at end of chunk")
                    
                    chunk_packet = {"message": text_chunk, "turn_complete": False}
                    await coordinator.safe_send(websocket, chunk_packet)
                    logger.debug(f"[{agent_id}] Sent text chunk: '{text_chunk}'")
                    accumulated_text += text_chunk

            if is_final_turn:
                logger.info(f"[{agent_id}] Processing final turn. Accumulated text length: {len(accumulated_text)}")
                logger.info(f"[{agent_id}] Last chunk received: '{text_chunk}'")
                logger.info(f"[{agent_id}] Is interrupted: {event.interrupted}")
                
                await asyncio.sleep(0.1)
                
                saved_message_uuid = None
                if accumulated_text.strip():
                    try:
                        message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                        msg_metadata = {
                            "timestamp": datetime.utcnow().isoformat(),
                            "streaming": False,
                            "used_context": True,
                            "final_length": len(accumulated_text)
                        }
                        saved_message = chat_service.save_message(
                            session_id=session_id,
                            msg_type=MessageType.AGENT,
                            agent_id=agent_id,
                            parts=message_parts,
                            message_metadata=msg_metadata
                        )

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

                        saved_message_uuid = saved_message['message_uuid']
                        logger.info(f"[{agent_id}] Saved agent message to DB (UUID: {saved_message_uuid}): '{accumulated_text[:50]}...'")
                        message_saved_in_loop = True

                        try:
                            confirmation_packet = {
                                "type": "message_saved",
                                "agent_id": agent_id,
                                "message_uuid": saved_message_uuid
                            }
                            await coordinator.safe_send(websocket, confirmation_packet)
                            logger.debug(f"[{agent_id}] Sent message_saved confirmation for {saved_message_uuid}")
                        except Exception as send_err:
                            logger.error(f"[{agent_id}] Failed to send message_saved confirmation: {send_err}")

                    except Exception as db_err:
                        logger.error(f"[{agent_id}] Failed to save agent message to DB: {db_err}", exc_info=True)

                response_packet = {
                    "turn_complete": True,
                    "interrupted": event.interrupted if event.interrupted else False
                }
                await coordinator.safe_send(websocket, response_packet)
                final_event_processed = True

                if event.interrupted:
                    logger.info(f"[{agent_id}] ADK event: Interrupted.")
                else:
                    logger.info(f"[{agent_id}] ADK event: Turn complete.")

                accumulated_text = ""

        if not message_saved_in_loop and accumulated_text.strip():
             logger.warning(f"[{agent_id}] Safeguard: Saving accumulated text because loop finished unexpectedly before final save.")
             try:
                 message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                 msg_metadata = {
                     "timestamp": datetime.utcnow().isoformat(),
                     "streaming": False,
                     "used_context": True
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
                             "message_uuid": saved_message['message_uuid']
                         }
                         await coordinator.safe_send(websocket, confirmation_packet)
                         logger.debug(f"[{agent_id}] Safeguard: Sent message_saved confirmation for {saved_message['message_uuid']}")
                     except Exception as send_err:
                         logger.error(f"[{agent_id}] Safeguard: Failed to send message_saved confirmation: {send_err}")

             except Exception as db_err:
                 logger.error(f"[{agent_id}] Safeguard: Failed to save final agent message to DB: {db_err}", exc_info=True)

    except WebSocketDisconnect:
        logger.info(f"[{agent_id}] Client disconnected during agent_to_client messaging.")
        return None
    except Exception as e:
        logger.exception(f"[{agent_id}] Error in agent_to_client_messaging: {e}")
        try:
            # Handle any error with backoff
            if not await coordinator.handle_error(e):
                logger.error(f"[{agent_id}] Max retries reached for error: {e}")
                return None

            # Try to reconnect ADK session if needed
            if "invalid frame payload data" in str(e):
                logger.info(f"[{agent_id}] ADK WebSocket error detected, attempting reconnection...")
                agent_session_id = f"{session_id}_{agent_id}"
                chat_service.clear_adk_session(agent_session_id)
                new_events, new_queue = await start_agent_session(session_id, agent_id)
                if new_events and new_queue:
                    logger.info(f"[{agent_id}] Successfully reconnected ADK session")
                    return new_events, new_queue
            
            # Notify client of error
            await coordinator.safe_send(websocket, {"error": f"Server error processing agent response: {e}"})
            return None
        except Exception as reconnect_err:
            logger.error(f"[{agent_id}] Failed to handle error: {reconnect_err}")
            return None
    finally:
        logger.debug(f"[{agent_id}] Exiting agent_to_client_messaging loop.")

async def client_to_agent_messaging(
    websocket: WebSocket,
    live_request_queue: LiveRequestQueue,
    session_id: str,
    agent_id: str,
    coordinator: WebSocketCoordinator
):
    """
    Receives messages from client, saves user message to DB,
    and sends them to the agent via LiveRequestQueue.
    History is managed by the shared ADK Session.
    """
    logger.debug(f"[{agent_id}] Starting client_to_agent_messaging loop.")
    
    try:
        while coordinator.active:
            try:
                # Check for cancellation
                if asyncio.current_task().cancelled():
                    logger.info(f"[{agent_id}] Task cancelled, cleaning up")
                    return None

                data = await coordinator.safe_receive(websocket)
                if data is None:
                    await asyncio.sleep(0.1)
                    continue

                message_type = data.get("type", "text")
                logger.info(f"[{agent_id}] Received {message_type} from client")

                # Handle heartbeat ping
                if message_type == "ping":
                    try:
                        await coordinator.safe_send(websocket, {"type": "pong"})
                        coordinator.update_heartbeat()  # Update heartbeat timestamp
                        logger.debug(f"[{agent_id}] Sent pong response and updated heartbeat")
                        continue
                    except Exception as e:
                        logger.error(f"[{agent_id}] Failed to send pong response: {e}")
                        # Let the error handling code below deal with connection issues
                        raise

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
                    if not text.strip():
                        continue
                    
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

                        logger.debug(f"[{agent_id}] User message saved, proceeding with direct message handling")
                        logger.info(f"[{agent_id}] Saved user message to DB: '{text[:50]}...'")
                    except Exception as db_err:
                        logger.error(f"[{agent_id}] Failed to save user message to DB: {db_err}", exc_info=True)

                    try:
                        new_content = Content(
                            parts=[Part(text=text)],
                            role="user"
                        )
                        live_request_queue.send_content(content=new_content)
                        logger.debug(f"[{agent_id}] Sent user message to agent's LiveRequestQueue.")

                        context_text = context_service.format_context_for_content(
                            target_agent_id=agent_id,
                            session_id=session_id
                        )
                        
                        if context_text:
                            logger.debug(f"[{agent_id}] Adding context: {context_text[:100]}...")
                            context_content = Content(
                                parts=[Part(text=context_text)],
                                role="system"
                            )
                            live_request_queue.send_content(content=context_content)
                            logger.debug(f"[{agent_id}] Sent context to agent's LiveRequestQueue.")
                    except Exception as e:
                        logger.error(f"[{agent_id}] Failed to send user message: {e}", exc_info=True)
                        try:
                            agent_session_id = f"{session_id}_{agent_id}"
                            chat_service.clear_adk_session(agent_session_id)
                            live_events, live_request_queue = await start_agent_session(session_id, agent_id)
                            logger.info(f"[{agent_id}] Successfully reconnected ADK session")
                        except Exception as reconnect_err:
                            logger.error(f"[{agent_id}] Failed to reconnect ADK session: {reconnect_err}")
                            raise

            except Exception as e:
                logger.error(f"[{agent_id}] Error in client_to_agent_messaging: {e}")
                
                # Check if this is a disconnect error
                if "Cannot call 'receive' once a disconnect message has been received" in str(e):
                    logger.info(f"[{agent_id}] WebSocket disconnected")
                    return "DISCONNECT"
                
                # For other errors, try to recover
                logger.error(f"[{agent_id}] Error in client_to_agent_messaging: {e}")
                
                # Handle other errors with backoff
                await coordinator.handle_error(e)
                coordinator.reset()
                continue

    except WebSocketDisconnect:
        logger.info(f"[{agent_id}] Client disconnected during client_to_agent messaging.")
        # Try to reconnect
        await asyncio.sleep(1.0)
        try:
            agent_session_id = f"{session_id}_{agent_id}"
            chat_service.clear_adk_session(agent_session_id)
            new_events, new_queue = await start_agent_session(session_id, agent_id)
            if new_events and new_queue:
                logger.info(f"[{agent_id}] Successfully reconnected ADK session")
                return new_events, new_queue
        except Exception as reconnect_err:
            logger.error(f"[{agent_id}] Failed to reconnect after disconnect: {reconnect_err}")
        return None

    except Exception as e:
        logger.exception(f"[{agent_id}] Unhandled error in client_to_agent_messaging: {e}")
        # Try to recover
        await coordinator.handle_error(e)
        coordinator.reset()
        return None
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
    Saves messages to the database.
    """
    if not ADK_AVAILABLE:
        await websocket.accept()
        await websocket.send_text(json.dumps({"error": "ADK library not available on the server."}))
        await websocket.close(code=1011)
        logger.error("Attempted WebSocket connection, but ADK is not available.")
        return

    await websocket.accept()
    logger.info(f"WebSocket client connected for session {session_id}, agent {agent_id}")

    shared_state.add_websocket(websocket)

    live_events = None
    live_request_queue = None
    coordinator = WebSocketCoordinator(agent_id)
    
    # Start connection checker
    await coordinator.start_connection_checker()

    try:
        while True:  # Outer loop for persistent connection
            try:
                session = chat_service.get_session(session_id)
                if not session:
                    logger.info(f"Creating new session for WebSocket connection: {session_id}")
                    session = chat_service.create_session(session_id=session_id)

                live_events, live_request_queue = await start_agent_session(session_id, agent_id)

                while coordinator.active:  # Inner loop for active session
                    try:
                        # Check for cancellation
                        if asyncio.current_task().cancelled():
                            logger.info(f"[{agent_id}] Task cancelled, cleaning up")
                            break

                        agent_to_client_task = asyncio.create_task(
                            agent_to_client_messaging(websocket, live_events, session_id, agent_id, coordinator)
                        )
                        client_to_agent_task = asyncio.create_task(
                            client_to_agent_messaging(websocket, live_request_queue, session_id, agent_id, coordinator)
                        )

                        done, pending = await asyncio.wait(
                            [agent_to_client_task, client_to_agent_task],
                            return_when=asyncio.FIRST_COMPLETED,
                            timeout=60
                        )

                        for task in done:
                            try:
                                if task == agent_to_client_task:
                                    result = await task
                                    if isinstance(result, tuple) and len(result) == 2:
                                        logger.info(f"[{agent_id}] Received new ADK session from reconnection")
                                        live_events, live_request_queue = result
                                        for p in pending:
                                            p.cancel()
                                            try:
                                                await p
                                            except asyncio.CancelledError:
                                                pass
                                        continue
                                elif task == client_to_agent_task:
                                    result = await task
                                    if result == "DISCONNECT":
                                        logger.info(f"[{agent_id}] Client disconnected, attempting reconnection")
                                        # Don't break, just continue and let reconnection handle it
                                        continue
                            except Exception as e:
                                logger.error(f"[{agent_id}] Error processing task result: {e}")
                                # Handle any error with backoff
                                await coordinator.handle_error(e)
                                coordinator.reset()
                                continue

                        # Handle task completion or timeout
                        if len(done) == 0 or any(t in done for t in [agent_to_client_task, client_to_agent_task]):
                            # Cancel pending tasks with proper cleanup
                            for task in pending:
                                if not task.done():
                                    task.cancel()
                                    try:
                                        await task
                                    except asyncio.CancelledError:
                                        pass
                                    except Exception as e:
                                        logger.error(f"[{agent_id}] Error cleaning up task: {e}")

                            # Add delay before recreating tasks
                            await asyncio.sleep(1.0)
                            
                            # Only recreate tasks if coordinator is still active
                            if coordinator.active:
                                # Create new tasks and continue
                                agent_to_client_task = asyncio.create_task(
                                    agent_to_client_messaging(websocket, live_events, session_id, agent_id, coordinator)
                                )
                                client_to_agent_task = asyncio.create_task(
                                    client_to_agent_messaging(websocket, live_request_queue, session_id, agent_id, coordinator)
                                )
                                coordinator.reset()
                                continue
                        else:
                            # Clean up any remaining pending tasks
                            for task in pending:
                                if not task.done():
                                    task.cancel()
                                    try:
                                        await task
                                    except asyncio.CancelledError:
                                        pass
                                    except Exception as e:
                                        logger.error(f"[{agent_id}] Error cleaning up pending task: {e}")

                    except asyncio.CancelledError:
                        logger.info(f"[{agent_id}] Tasks cancelled, exiting loop.")
                        break
                    except Exception as e:
                        logger.error(f"[{agent_id}] Error in communication loop: {e}")
                        if isinstance(e, WebSocketDisconnect):
                            # Don't break, let reconnection handle it
                            continue
                        await coordinator.handle_error(e)
                        coordinator.reset()
                        continue

            except ValueError as e:
                logger.error(f"Failed to start session {session_id} for agent {agent_id}: {e}")
                await websocket.send_text(json.dumps({"error": str(e)}))
                # Don't break, try to recover
                await asyncio.sleep(1.0)
                continue
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for session {session_id}, agent {agent_id}")
                # Don't break, try to recover
                await asyncio.sleep(1.0)
                continue
            except asyncio.CancelledError:
                logger.info(f"WebSocket tasks cancelled for session {session_id}, agent {agent_id}")
                # Don't break, try to recover
                await asyncio.sleep(1.0)
                continue
            except Exception as e:
                logger.exception(f"Unexpected error in WebSocket endpoint for session {session_id}, agent {agent_id}: {e}")
                # Don't break, try to recover
                await asyncio.sleep(1.0)
                continue

    finally:
        logger.info(f"WebSocket connection ended for session {session_id}, agent {agent_id}")
        try:
            # Stop the coordinator and wait for tasks to clean up
            await coordinator.stop()
            # Clean up WebSocket state
            shared_state.remove_websocket(websocket)
            # Clear ADK session
            agent_session_id = f"{session_id}_{agent_id}"
            chat_service.clear_adk_session(agent_session_id)
        except Exception as e:
            logger.error(f"Error during WebSocket cleanup: {e}")
