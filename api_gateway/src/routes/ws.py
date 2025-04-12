"""
WebSocket route for the API Gateway using ADK Streaming.

Handles real-time, bidirectional communication between the frontend
and a selected agent using the google-adk library based on the quickstart.
"""

import os
import json
import asyncio
import logging
from typing import Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from dotenv import load_dotenv

# --- ADK Imports ---
# Note: Ensure 'google-adk' is installed (in requirements.txt)
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
from ..services.chat_service import chat_service # Use ChatService to get agent instances

# --- Configuration ---
router = APIRouter()
logger = logging.getLogger(__name__)

# Load Gemini API Key if needed by ADK components
# Ensure .env file is in the api_gateway directory or adjust path
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env') 
load_dotenv(dotenv_path=dotenv_path) 
# Check if the key is loaded (optional, ADK might handle errors internally)
# if ADK_AVAILABLE and not os.getenv("GOOGLE_API_KEY"):
#     logger.warning("GOOGLE_API_KEY not found in environment variables or .env file.")

APP_NAME = "TKR Multi-Agent Chat" # Or get from config

# --- ADK Setup (if available) ---
if ADK_AVAILABLE:
    session_service = InMemorySessionService()

    def start_agent_session(session_id: str, agent_id: str):
        """Starts an ADK agent session for streaming."""
        logger.info(f"Starting ADK session {session_id} for agent {agent_id}")
        
        # Get the specific agent instance from ChatService
        agent_instance = chat_service.get_agent(agent_id)
        if not agent_instance:
             logger.error(f"Agent instance '{agent_id}' not found in ChatService.")
             raise ValueError(f"Agent '{agent_id}' not found.")

        # Create ADK Session
        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=session_id, # Using WebSocket session ID as user ID for simplicity
            session_id=session_id,
        )

        # Create ADK Runner for the specific agent
        runner = Runner(
            app_name=APP_NAME,
            agent=agent_instance, # Use the loaded agent instance
            session_service=session_service,
        )

        # Configure response modality (TEXT only for now)
        run_config = RunConfig(response_modalities=["TEXT"])

        # Create LiveRequestQueue for this session
        live_request_queue = LiveRequestQueue()

        # Start agent session using run_live
        live_events = runner.run_live(
            session=session,
            live_request_queue=live_request_queue,
            run_config=run_config,
        )
        logger.info(f"ADK session {session_id} started successfully.")
        return live_events, live_request_queue
else:
    # Provide dummy function if ADK is not available
    def start_agent_session(session_id: str, agent_id: str):
        logger.error("ADK library not available. Cannot start agent session.")
        raise RuntimeError("ADK library not installed or available.")

# --- WebSocket Communication Handlers ---

async def agent_to_client_messaging(websocket: WebSocket, live_events):
    """Accumulates agent responses from live_events and sends the final message to the client."""
    logger.debug("Starting agent_to_client_messaging loop.")
    accumulated_text = ""
    final_event_processed = False
    try:
        async for event in live_events:
            logger.debug(f"Received ADK event: {event}")
            final_event_processed = False # Reset flag for each event

            # Extract text content from the event's Content object
            part: Optional[Part] = (
                event.content and event.content.parts and event.content.parts[0]
            )
            text_chunk = getattr(part, 'text', None) # Safely access text attribute

            if text_chunk:
                # --- Accumulate text instead of sending immediately ---
                # Note: This assumes the final event before turn_complete might contain the full message.
                # If chunks are guaranteed non-overlapping, simple concatenation is fine.
                # Avoid appending if the new chunk is identical to the end of the current text
                # (Handles cases where the full message is sent after chunks)
                if not accumulated_text.endswith(text_chunk):
                    accumulated_text += text_chunk 
                    logger.debug(f"Appended text chunk: '{text_chunk}'")
                else:
                    logger.debug(f"Skipped redundant text chunk: '{text_chunk}'")

            # Check for turn completion or interruption AFTER processing content (if any)
            if event.turn_complete or event.interrupted:
                response_packet: Dict[str, Any] = {}
                if accumulated_text:
                     response_packet["message"] = accumulated_text.strip() # Send accumulated text
                     logger.info(f"Sending final accumulated message: '{response_packet['message']}'")
                
                if event.turn_complete:
                    response_packet["turn_complete"] = True
                    logger.info("ADK event: Turn complete.")
                if event.interrupted:
                    response_packet["interrupted"] = True
                    logger.info("ADK event: Interrupted.")
                
                # Send the final packet for this turn
                if response_packet:
                     await websocket.send_text(json.dumps(response_packet))
                
                # Reset for the next potential turn in the same session
                accumulated_text = "" 
                final_event_processed = True # Mark that we sent the final packet
                
                if event.turn_complete:
                     break # Exit loop for this turn if complete signal received

        # Ensure final packet sent if loop finishes without turn_complete/interrupted flags
        # (Shouldn't happen with run_live typically, but as a safeguard)
        if not final_event_processed and accumulated_text:
             logger.warning("Sending accumulated text after event loop finished without completion signal.")
             await websocket.send_text(json.dumps({"message": accumulated_text.strip(), "turn_complete": True}))

    except WebSocketDisconnect:
        logger.info("Client disconnected during agent_to_client messaging.")
    except Exception as e:
        logger.exception(f"Error in agent_to_client_messaging: {e}")
        try:
            # Attempt to send error to client
            await websocket.send_text(json.dumps({"error": f"Server error: {e}"}))
        except Exception:
            pass # Ignore if sending error fails (connection likely closed)
    finally:
        logger.debug("Exiting agent_to_client_messaging loop.")


async def client_to_agent_messaging(websocket: WebSocket, live_request_queue: LiveRequestQueue):
    """Receives messages from the client WebSocket and sends them to the agent via LiveRequestQueue."""
    logger.debug("Starting client_to_agent_messaging loop.")
    try:
        while True:
            # Wait for a message from the client
            text = await websocket.receive_text()
            logger.info(f"Received text from client: {text}")
            
            # Construct ADK Content object
            # Assuming simple text input for now
            content = Content(role="user", parts=[Part.from_text(text=text)])
            
            # Send content to the agent's request queue
            live_request_queue.send_content(content=content)
            logger.debug("Sent content to agent's LiveRequestQueue.")
            
    except WebSocketDisconnect:
        logger.info("Client disconnected during client_to_agent messaging.")
    except Exception as e:
        logger.exception(f"Error in client_to_agent_messaging: {e}")
    finally:
        logger.debug("Exiting client_to_agent_messaging loop.")
        # Optionally signal the agent queue that the client disconnected
        # live_request_queue.close() # Or similar method if available

# --- WebSocket Endpoint ---

@router.websocket("/chat/{session_id}/{agent_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, agent_id: str):
    """
    WebSocket endpoint for streaming chat with a specific agent using ADK.

    Establishes a connection, starts an ADK Runner session for the specified agent,
    and facilitates bidirectional communication between the client and the agent
    via ADK's LiveRequestQueue and event stream.

    Expects plain text messages from the client.
    Sends JSON packets to the client with fields like 'message', 'turn_complete', 'error'.
    """
    if not ADK_AVAILABLE:
        await websocket.accept()
        await websocket.send_text(json.dumps({"error": "ADK library not available on the server."}))
        await websocket.close(code=1011) # Internal error
        logger.error("Attempted WebSocket connection, but ADK is not available.")
        return

    await websocket.accept()
    logger.info(f"WebSocket client connected for session {session_id}, agent {agent_id}")
    chat_service.register_websocket(session_id, websocket) # Register for potential broadcasts

    live_events = None
    live_request_queue = None
    
    try:
        # Start the specific agent session using ADK
        live_events, live_request_queue = start_agent_session(session_id, agent_id)

        # Run bidirectional communication concurrently
        agent_to_client_task = asyncio.create_task(
            agent_to_client_messaging(websocket, live_events)
        )
        client_to_agent_task = asyncio.create_task(
            client_to_agent_messaging(websocket, live_request_queue)
        )
        
        # Keep connection open until one task finishes (e.g., due to disconnect)
        done, pending = await asyncio.wait(
            [agent_to_client_task, client_to_agent_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        
        # Cancel any pending tasks to ensure clean exit
        for task in pending:
            task.cancel()
            
    except ValueError as e: # Catch agent not found error from start_agent_session
         logger.error(f"Failed to start session {session_id} for agent {agent_id}: {e}")
         await websocket.send_text(json.dumps({"error": str(e)}))
         await websocket.close(code=1011)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}, agent {agent_id}")
    except Exception as e:
        logger.exception(f"Unexpected error in WebSocket endpoint for session {session_id}, agent {agent_id}: {e}")
        # Attempt to close gracefully if possible
        try:
            await websocket.close(code=1011) # Internal error
        except Exception:
            pass # Ignore errors during close
    finally:
        logger.info(f"Closing WebSocket connection for session {session_id}, agent {agent_id}")
        chat_service.unregister_websocket(session_id) # Unregister
        # TODO: Add cleanup for ADK session/runner if necessary
        # session_service.delete_session(session_id) # Example cleanup
        # live_request_queue.close() # Example cleanup
