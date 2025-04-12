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
try:
    from google.genai.types import Part, Content
    from google.adk.runners import Runner
    from google.adk.agents import LiveRequestQueue
    from google.adk.agents.run_config import RunConfig
    from google.adk.sessions.in_memory_session_service import InMemorySessionService
    ADK_AVAILABLE = True
except ImportError:
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
from ..models.messages import MessageType # Enum for message types

# --- Configuration ---
router = APIRouter()
logger = logging.getLogger(__name__)

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

APP_NAME = "TKR Multi-Agent Chat"

# --- ADK Setup (if available) ---
if ADK_AVAILABLE:
    session_service = InMemorySessionService()

    def start_agent_session(session_id: str, agent_id: str): # Removed chat_service_instance param
        """Starts an ADK agent session for streaming."""
        logger.info(f"Starting ADK session {session_id} for agent {agent_id}")

        # Get the specific agent instance from the global ChatService instance
        agent_instance = chat_service.get_agent(agent_id) # Use imported global instance
        if not agent_instance:
             logger.error(f"Agent instance '{agent_id}' not found in global ChatService.")
             raise ValueError(f"Agent '{agent_id}' not found.")

        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=session_id,
            session_id=session_id,
        )
        runner = Runner(
            app_name=APP_NAME,
            agent=agent_instance,
            session_service=session_service,
        )
        run_config = RunConfig(response_modalities=["TEXT"])
        live_request_queue = LiveRequestQueue()
        live_events = runner.run_live(
            session=session,
            live_request_queue=live_request_queue,
            run_config=run_config,
        )
        logger.info(f"ADK session {session_id} started successfully.")
        return live_events, live_request_queue
else:
    def start_agent_session(session_id: str, agent_id: str, chat_service_instance: ChatService):
        logger.error("ADK library not available. Cannot start agent session.")
        raise RuntimeError("ADK library not installed or available.") # Corrected indentation

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
    try:
        async for event in live_events:
            logger.debug(f"[{agent_id}] Received ADK event: {event}")
            final_event_processed = False

            part: Optional[Part] = (
                event.content and event.content.parts and event.content.parts[0]
            )
            text_chunk = getattr(part, 'text', None)

            response_packet: Dict[str, Any] = {}
            is_final_turn = event.turn_complete or event.interrupted

            if text_chunk:
                # Send chunk immediately for streaming effect
                chunk_packet = {"message": text_chunk, "turn_complete": False}
                await websocket.send_text(json.dumps(chunk_packet))
                logger.debug(f"[{agent_id}] Sent text chunk: '{text_chunk}'")
                # Accumulate text for saving later
                accumulated_text += text_chunk

            if is_final_turn:
                response_packet["turn_complete"] = True
                if event.interrupted:
                    response_packet["interrupted"] = True
                    logger.info(f"[{agent_id}] ADK event: Interrupted.")
                else:
                    logger.info(f"[{agent_id}] ADK event: Turn complete.")

                # Send final completion packet (even if no text was accumulated this turn)
                await websocket.send_text(json.dumps(response_packet))
                final_event_processed = True

                # --- Save accumulated agent message to DB ---
                if accumulated_text.strip():
                    try:
                        message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                        msg_metadata = {"timestamp": datetime.utcnow().isoformat(), "streaming": False} # Renamed variable
                        # Use global chat_service instance to save
                        await chat_service.save_message(
                            db=db,
                            session_id=session_id,
                            msg_type=MessageType.AGENT,
                            agent_id=agent_id,
                            parts=message_parts,
                            message_metadata=msg_metadata # Pass renamed argument
                        )
                        logger.info(f"[{agent_id}] Saved agent message to DB: '{accumulated_text[:50]}...'")
                    except Exception as db_err:
                        logger.error(f"[{agent_id}] Failed to save agent message to DB: {db_err}", exc_info=True)
                        # Optionally inform client of DB save error?
                # --- End DB Save ---

                # Reset for the next potential turn
                accumulated_text = ""
                if event.turn_complete:
                     break # Exit loop for this turn

        # Safeguard: Save if loop finishes unexpectedly with content
        if not final_event_processed and accumulated_text.strip():
             logger.warning(f"[{agent_id}] Saving accumulated text after event loop finished unexpectedly.")
             try:
                 message_parts = [{"type": "text", "content": accumulated_text.strip()}]
                 msg_metadata = {"timestamp": datetime.utcnow().isoformat(), "streaming": False} # Renamed variable
                 # Use global chat_service instance to save
                 await chat_service.save_message(
                     db=db, session_id=session_id, msg_type=MessageType.AGENT,
                     agent_id=agent_id, parts=message_parts, message_metadata=msg_metadata # Pass renamed argument
                 )
             except Exception as db_err:
                 logger.error(f"[{agent_id}] Failed to save final agent message to DB: {db_err}", exc_info=True)

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
    agent_id: str, # Added agent_id for logging
    db: AsyncSession # Removed chat_service_instance param
):
    """
    Receives messages from client, saves user message to DB,
    and sends them to the agent via LiveRequestQueue.
    """
    logger.debug(f"[{agent_id}] Starting client_to_agent_messaging loop.")
    try:
        while True:
            text = await websocket.receive_text()
            logger.info(f"[{agent_id}] Received text from client: {text}")

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

            # Construct ADK Content object
            content = Content(role="user", parts=[Part.from_text(text=text)])

            # Send content to the agent's request queue
            live_request_queue.send_content(content=content)
            logger.debug(f"[{agent_id}] Sent content to agent's LiveRequestQueue.")

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

    try:
        # Validate session exists in DB before starting ADK (using global chat_service)
        session = await chat_service.get_session(db, session_id)
        if not session:
            logger.error(f"WebSocket connection attempt for non-existent session: {session_id}")
            await websocket.send_text(json.dumps({"error": "Session not found"}))
            await websocket.close(code=1008) # Policy Violation
            return

        # Start the specific agent session using ADK (uses global chat_service implicitly)
        live_events, live_request_queue = start_agent_session(session_id, agent_id)

        while True:
            agent_to_client_task = asyncio.create_task(
                agent_to_client_messaging(websocket, live_events, session_id, agent_id, db) # Removed chat_service_instance
            )
            client_to_agent_task = asyncio.create_task(
                client_to_agent_messaging(websocket, live_request_queue, session_id, agent_id, db) # Removed chat_service_instance
            )

            done, pending = await asyncio.wait(
                [agent_to_client_task, client_to_agent_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            if client_to_agent_task in done:
                logger.info(f"[{agent_id}] Client task finished (likely disconnect). Cancelling agent task.")
                for task in pending:
                    task.cancel()
                break # Exit the while loop on client disconnect

            # If agent task finished (turn complete), cancel client task and loop
            if agent_to_client_task in done:
                 logger.info(f"[{agent_id}] Agent task finished (likely turn complete). Cancelling client task.")
                 for task in pending:
                     task.cancel()
                 # Continue the loop to wait for next client input

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
        # if live_request_queue: live_request_queue.close() # Example
        # session_service.delete_session(session_id) # Example
