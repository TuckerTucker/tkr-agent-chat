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
from typing import Dict, Any, Optional, List
from datetime import datetime

# FastAPI Imports
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

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
    class Content: pass
    class Part:
        @staticmethod
        def from_text(text: str): return {"text": text} # Dummy implementation

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
        """
        logger.info(f"Starting or reusing ADK session {session_id} for agent {agent_id}")

        # Get the shared ADK session object from ChatService
        # Use session_id as user_id for simplicity here
        adk_session = chat_service.get_or_create_adk_session(session_id=session_id, user_id=session_id)
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
        run_config = RunConfig(response_modalities=["TEXT"])
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
    agent_id: str
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
            logger.debug(f"[{agent_id}] Received ADK event: {event}")
            final_event_processed = False

            part: Optional[Part] = (
                event.content and event.content.parts and event.content.parts[0]
            )
            text_chunk = getattr(part, 'text', None)
            is_partial_content = getattr(event, 'partial', True)

            response_packet: Dict[str, Any] = {}
            is_final_turn = event.turn_complete or event.interrupted

            if not is_partial_content and text_chunk:
                 logger.debug(f"[{agent_id}] Received full message event. Resetting accumulator.")
                 accumulated_text = ""

            if text_chunk:
                chunk_packet = {"message": text_chunk, "turn_complete": False}
                await websocket.send_text(json.dumps(chunk_packet))
                logger.debug(f"[{agent_id}] Sent text chunk: '{text_chunk}'")
                accumulated_text += text_chunk

            if is_final_turn:
                saved_message_uuid = None
                if accumulated_text.strip():
                    try:
                        message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                        msg_metadata = {"timestamp": datetime.utcnow().isoformat(), "streaming": False}
                        # Save the message
                        saved_message = chat_service.save_message(
                            session_id=session_id,
                            msg_type=MessageType.AGENT,
                            agent_id=agent_id,
                            parts=message_parts,
                            message_metadata=msg_metadata
                        )

                        # Share context with other agents in the session
                        other_agents = [a for a in chat_service.get_agents() if a.id != agent_id]
                        for other_agent in other_agents:
                            await context_service.share_context(
                                source_agent_id=agent_id,
                                target_agent_id=other_agent.id,
                                context_data={
                                    "message_uuid": saved_message["message_uuid"],
                                    "content": accumulated_text.strip(),
                                    "type": "message"
                                },
                                session_id=session_id,
                                context_type="relevant",
                                ttl_minutes=60
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
                            await websocket.send_text(json.dumps(confirmation_packet))
                            logger.debug(f"[{agent_id}] Sent message_saved confirmation for {saved_message_uuid}")
                        except Exception as send_err:
                             logger.error(f"[{agent_id}] Failed to send message_saved confirmation: {send_err}")

                    except Exception as db_err:
                        logger.error(f"[{agent_id}] Failed to save agent message to DB: {db_err}", exc_info=True)

                response_packet = {
                    "turn_complete": True,
                    "interrupted": event.interrupted if event.interrupted else False
                }
                await websocket.send_text(json.dumps(response_packet))
                final_event_processed = True

                if event.interrupted:
                    logger.info(f"[{agent_id}] ADK event: Interrupted.")
                else:
                    logger.info(f"[{agent_id}] ADK event: Turn complete.")

                accumulated_text = ""
                if event.turn_complete:
                    break

        if not message_saved_in_loop and accumulated_text.strip():
             logger.warning(f"[{agent_id}] Safeguard: Saving accumulated text because loop finished unexpectedly before final save.")
             try:
                 message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                 msg_metadata = {"timestamp": datetime.utcnow().isoformat(), "streaming": False}
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
                         await websocket.send_text(json.dumps(confirmation_packet))
                         logger.debug(f"[{agent_id}] Safeguard: Sent message_saved confirmation for {saved_message['message_uuid']}")
                     except Exception as send_err:
                         logger.error(f"[{agent_id}] Safeguard: Failed to send message_saved confirmation: {send_err}")

             except Exception as db_err:
                 logger.error(f"[{agent_id}] Safeguard: Failed to save final agent message to DB: {db_err}", exc_info=True)

    except WebSocketDisconnect:
        logger.info(f"[{agent_id}] Client disconnected during agent_to_client messaging.")
    except Exception as e:
        logger.exception(f"[{agent_id}] Error in agent_to_client_messaging: {e}")
        try:
            await websocket.send_text(json.dumps({"error": f"Server error processing agent response: {e}"}))
        except Exception:
            pass
    finally:
        logger.debug(f"[{agent_id}] Exiting agent_to_client_messaging loop.")

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
    """
    logger.debug(f"[{agent_id}] Starting client_to_agent_messaging loop.")
    try:
        while True:
            data = await websocket.receive_json()
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
                        role="user",
                        parts=[Part.from_text(text=f"Task created: {task.title}")]
                    )
                    live_request_queue.send_content(content=new_user_content)

                elif task_action == "update":
                    task = await a2a_service.update_task_status(
                        task_id=task_id,
                        status=data.get("status"),
                        result=data.get("result")
                    )
                    new_user_content = Content(
                        role="user",
                        parts=[Part.from_text(text=f"Task {task_id} updated: {task.status}")]
                    )
                    live_request_queue.send_content(content=new_user_content)

            else:
                text = data.get("text", "")
                logger.info(f"[{agent_id}] Received text from client: '{text[:50]}...'")

                try:
                    message_parts = [{"type": "text", "content": text.strip()}]
                    msg_metadata = {"timestamp": datetime.utcnow().isoformat()}
                    chat_service.save_message(
                        session_id=session_id,
                        msg_type=MessageType.USER,
                        parts=message_parts,
                        message_metadata=msg_metadata
                    )
                    logger.info(f"[{agent_id}] Saved user message to DB: '{text[:50]}...'")
                except Exception as db_err:
                    logger.error(f"[{agent_id}] Failed to save user message to DB: {db_err}", exc_info=True)

                new_user_content = Content(role="user", parts=[Part.from_text(text=text)])
                live_request_queue.send_content(content=new_user_content)
                logger.debug(f"[{agent_id}] Sent new user content to agent's LiveRequestQueue.")

    except WebSocketDisconnect:
        logger.info(f"[{agent_id}] Client disconnected during client_to_agent messaging.")
    except Exception as e:
        logger.exception(f"[{agent_id}] Error in client_to_agent_messaging: {e}")
    finally:
        logger.debug(f"[{agent_id}] Exiting client_to_agent_messaging loop.")

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

    live_events = None
    live_request_queue = None

    try:
        # Get or create session in DB before starting ADK
        session = chat_service.get_session(session_id)
        if not session:
            logger.info(f"Creating new session for WebSocket connection: {session_id}")
            session = chat_service.create_session(session_id=session_id)

        # Start the specific agent session using the shared ADK session
        live_events, live_request_queue = await start_agent_session(session_id, agent_id)

        # --- Main communication loop ---
        while True:
            # Run agent->client and client->agent tasks concurrently
            agent_to_client_task = asyncio.create_task(
                agent_to_client_messaging(websocket, live_events, session_id, agent_id)
            )
            client_to_agent_task = asyncio.create_task(
                client_to_agent_messaging(websocket, live_request_queue, session_id, agent_id)
            )

            done, pending = await asyncio.wait(
                    [agent_to_client_task, client_to_agent_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

            if client_to_agent_task in done:
                logger.info(f"[{agent_id}] Client task finished (likely disconnect). Cancelling agent task.")
                for task in pending:
                    task.cancel()
                break

            if agent_to_client_task in done:
                 logger.info(f"[{agent_id}] Agent task finished (likely turn complete). Cancelling client task.")
                 for task in pending:
                     task.cancel()

    except ValueError as e:
         logger.error(f"Failed to start session {session_id} for agent {agent_id}: {e}")
         await websocket.send_text(json.dumps({"error": str(e)}))
         await websocket.close(code=1011)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}, agent {agent_id}")
    except asyncio.CancelledError:
         logger.info(f"WebSocket tasks cancelled for session {session_id}, agent {agent_id}")
    except Exception as e:
        logger.exception(f"Unexpected error in WebSocket endpoint for session {session_id}, agent {agent_id}: {e}")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        logger.info(f"Closing WebSocket connection for session {session_id}, agent {agent_id}")
        chat_service.clear_adk_session(session_id)
