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

# FastAPI & SQLAlchemy Imports
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

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
from ..services.chat_service import chat_service # Import global instance
from ..database import get_db # Database dependency injector
from ..models.messages import Message, MessageType # Import Message model for type hinting

# --- Configuration ---
router = APIRouter()
logger = logging.getLogger(__name__)

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

APP_NAME = "TKR Multi-Agent Chat"

# --- ADK Setup (if available) ---
if ADK_AVAILABLE:
    # session_service instance is now managed by ChatService

    async def start_agent_session(session_id: str, agent_id: str): # Removed db param
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
            session_service=chat_service.adk_session_service, # Use service from ChatService
        )
        run_config = RunConfig(response_modalities=["TEXT"])
        live_request_queue = LiveRequestQueue()
        live_events = runner.run_live(
            session=adk_session, # Use the shared ADK session
            live_request_queue=live_request_queue,
            run_config=run_config,
        )
        logger.info(f"ADK runner started for session {session_id}, agent {agent_id}")
        return live_events, live_request_queue # Return only runner components
else:
    async def start_agent_session(session_id: str, agent_id: str): # Match signature
        logger.error("ADK library not available. Cannot start agent session.")
        raise RuntimeError("ADK library not installed or available.")

# --- WebSocket Communication Handlers ---
# Note: These handlers now use the global chat_service instance implicitly via start_agent_session
# and explicitly for saving messages.

async def agent_to_client_messaging(
    websocket: WebSocket,
    live_events,
    session_id: str,
    agent_id: str,
    db: AsyncSession # Removed chat_service_instance param
):
    """
    Listens to agent events, sends packets to client,
    and saves the final agent message to the database.
    """
    logger.debug(f"[{agent_id}] Starting agent_to_client_messaging loop.")
    accumulated_text = ""
    final_event_processed = False
    message_saved_in_loop = False # Flag to track if save happened in the loop
    try:
        async for event in live_events:
            logger.debug(f"[{agent_id}] Received ADK event: {event}")
            final_event_processed = False # Reset on each event iteration

            part: Optional[Part] = (
                event.content and event.content.parts and event.content.parts[0]
            )
            text_chunk = getattr(part, 'text', None)
            # Check if the event contains partial content (default to True if attribute missing)
            is_partial_content = getattr(event, 'partial', True)

            response_packet: Dict[str, Any] = {}
            is_final_turn = event.turn_complete or event.interrupted

            # If this event contains the full message (not partial), reset accumulator first
            # to avoid duplicating content already sent in chunks.
            if not is_partial_content and text_chunk:
                 logger.debug(f"[{agent_id}] Received full message event. Resetting accumulator.")
                 accumulated_text = ""

            if text_chunk:
                # Send chunk immediately (still useful for potential future streaming re-enablement)
                chunk_packet = {"message": text_chunk, "turn_complete": False}
                await websocket.send_text(json.dumps(chunk_packet))
                logger.debug(f"[{agent_id}] Sent text chunk: '{text_chunk}'")
                # Accumulate text for saving later
                accumulated_text += text_chunk

            if is_final_turn:
                # --- Save accumulated agent message to DB FIRST ---
                saved_message_uuid = None
                if accumulated_text.strip():
                    try:
                        message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                        msg_metadata = {"timestamp": datetime.utcnow().isoformat(), "streaming": False}
                        # Save message and get the result
                        saved_message = await chat_service.save_message(
                            db=db,
                            session_id=session_id,
                            msg_type=MessageType.AGENT,
                            agent_id=agent_id,
                            parts=message_parts,
                            message_metadata=msg_metadata
                        )
                        saved_message_uuid = saved_message.message_uuid # Get the UUID
                        logger.info(f"[{agent_id}] Saved agent message to DB (UUID: {saved_message_uuid}): '{accumulated_text[:50]}...'")
                        message_saved_in_loop = True # Set flag
                        # Send confirmation packet AFTER successful save
                        try:
                            confirmation_packet = {
                                "type": "message_saved", # New packet type
                                "agent_id": agent_id,
                                "message_uuid": saved_message_uuid
                            }
                            await websocket.send_text(json.dumps(confirmation_packet))
                            logger.debug(f"[{agent_id}] Sent message_saved confirmation for {saved_message_uuid}")
                        except Exception as send_err:
                             logger.error(f"[{agent_id}] Failed to send message_saved confirmation: {send_err}")

                    except Exception as db_err:
                        logger.error(f"[{agent_id}] Failed to save agent message to DB: {db_err}", exc_info=True)
                # --- End DB Save ---

                # Send final turn_complete packet (mainly for stream end signal now)
                response_packet = {
                    "turn_complete": True,
                    "interrupted": event.interrupted if event.interrupted else False
                }
                await websocket.send_text(json.dumps(response_packet))
                final_event_processed = True # Mark that the final turn logic was processed

                if event.interrupted:
                    logger.info(f"[{agent_id}] ADK event: Interrupted.")
                else:
                    logger.info(f"[{agent_id}] ADK event: Turn complete.")

                # Reset for the next potential turn
                accumulated_text = ""
                if event.turn_complete:
                    break # Exit loop for this turn

        # Safeguard: Save ONLY if the loop finished with content AND it wasn't saved inside the loop
        if not message_saved_in_loop and accumulated_text.strip():
             logger.warning(f"[{agent_id}] Safeguard: Saving accumulated text because loop finished unexpectedly before final save.")
             try:
                 message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                 msg_metadata = {"timestamp": datetime.utcnow().isoformat(), "streaming": False}
                 # Use global chat_service instance to save
                 saved_message = await chat_service.save_message(
                     db=db, session_id=session_id, msg_type=MessageType.AGENT,
                     agent_id=agent_id, parts=message_parts, message_metadata=msg_metadata
                 )
                 # Also send confirmation for safeguard save
                 if saved_message:
                     try:
                         confirmation_packet = {
                             "type": "message_saved", # New packet type
                             "agent_id": agent_id,
                             "message_uuid": saved_message.message_uuid
                         }
                         await websocket.send_text(json.dumps(confirmation_packet))
                         logger.debug(f"[{agent_id}] Safeguard: Sent message_saved confirmation for {saved_message.message_uuid}")
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
    agent_id: str,
    db: AsyncSession # Removed history_content parameter
):
    """
    Receives messages from client, saves user message to DB,
    and sends them to the agent via LiveRequestQueue.
    History is managed by the shared ADK Session.
    """
    logger.debug(f"[{agent_id}] Starting client_to_agent_messaging loop.")
    # Removed is_first_message flag
    try:
        while True:
            text = await websocket.receive_text()
            logger.info(f"[{agent_id}] Received text from client: '{text[:50]}...'")

            # --- Save user message to DB ---
            try:
                message_parts = [{"type": "text", "content": text.strip()}]
                msg_metadata = {"timestamp": datetime.utcnow().isoformat()} # Renamed variable
                 # Use global chat_service instance to save
                await chat_service.save_message(
                    db=db,
                    session_id=session_id,
                    msg_type=MessageType.USER,
                    parts=message_parts,
                    message_metadata=msg_metadata # Pass renamed argument
                    # agent_id is None for user messages
                )
                logger.info(f"[{agent_id}] Saved user message to DB: '{text[:50]}...'")
            except Exception as db_err:
                 logger.error(f"[{agent_id}] Failed to save user message to DB: {db_err}", exc_info=True)
                 # Decide if we should proceed to send to agent if DB save fails
                 # For now, we'll proceed but log the error.
            # --- End DB Save ---

            # Construct ADK Content object for the new message
            new_user_content = Content(role="user", parts=[Part.from_text(text=text)])

            # Send only the new user content to the queue
            live_request_queue.send_content(content=new_user_content)
            logger.debug(f"[{agent_id}] Sent new user content to agent's LiveRequestQueue.")

    except WebSocketDisconnect:
        logger.info(f"[{agent_id}] Client disconnected during client_to_agent messaging.")
    except Exception as e:
        logger.exception(f"[{agent_id}] Error in client_to_agent_messaging: {e}")
    finally:
        logger.debug(f"[{agent_id}] Exiting client_to_agent_messaging loop.")


# --- WebSocket Endpoint ---

@router.websocket("/chat/{session_id}/{agent_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db) # Inject DB session
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

    # Removed instantiation of ChatService - using global instance now.

    live_events = None
    live_request_queue = None
    # Removed history_content initialization

    try:
        # Validate session exists in DB before starting ADK (using global chat_service)
        db_session_check = await chat_service.get_session(db, session_id) # Renamed variable
        if not db_session_check:
            logger.error(f"WebSocket connection attempt for non-existent session: {session_id}")
            await websocket.send_text(json.dumps({"error": "Session not found"}))
            await websocket.close(code=1008) # Policy Violation
            return

        # Start the specific agent session using the shared ADK session
        live_events, live_request_queue = await start_agent_session(session_id, agent_id) # Removed db, history return

        # --- Main communication loop ---
        while True:
            # Run agent->client and client->agent tasks concurrently
            agent_to_client_task = asyncio.create_task(
                agent_to_client_messaging(websocket, live_events, session_id, agent_id, db)
            )
            client_to_agent_task = asyncio.create_task(
                # History is no longer passed here
                client_to_agent_messaging(websocket, live_request_queue, session_id, agent_id, db)
            )

            done, pending = await asyncio.wait(
                    [agent_to_client_task, client_to_agent_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

            if client_to_agent_task in done: # Correct indentation
                logger.info(f"[{agent_id}] Client task finished (likely disconnect). Cancelling agent task.")
                for task in pending:
                    task.cancel()
                break # Exit the while loop on client disconnect

            # If agent task finished (turn complete), cancel client task and loop
            if agent_to_client_task in done: # Correct indentation
                 logger.info(f"[{agent_id}] Agent task finished (likely turn complete). Cancelling client task.")
                 for task in pending:
                     task.cancel()
                 # Continue the while loop to wait for next client input

    except ValueError as e: # Catch agent not found or session not found
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
        # ADK cleanup might be needed here depending on library behavior
        # if live_request_queue: live_request_queue.close() # Example?
        # Clear the shared ADK session from our management if this was the last connection?
        # For simplicity, let's clear it on any disconnect for now.
        # A more robust solution might involve tracking connection counts per session_id.
        chat_service.clear_adk_session(session_id)
