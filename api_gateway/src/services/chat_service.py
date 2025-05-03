"""
Chat Service (for ADK Streaming Model with DB Persistence).

Handles:
- Session lifecycle using the database (create, get, list).
- Message retrieval from the database.
- Loading and providing access to agent instances.

Note: Message saving and real-time handling occur within the WebSocket route (`ws.py`).
"""

import uuid
import os
import logging
import random
from datetime import datetime
from typing import Dict, List, Optional, Any, Union

# --- ADK Imports ---
print("DEBUG: Starting ADK imports in chat_service.py...")
try:
    from google.adk.sessions import Session
    from google.adk.sessions.in_memory_session_service import InMemorySessionService
    print("DEBUG: Successfully imported ADK components in chat_service.py")
    ADK_AVAILABLE = True
except ImportError as e:
    print(f"DEBUG: Failed to import ADK components in chat_service.py: {str(e)}")
    logging.warning("google-adk library not found. ADK Session management will be disabled.")
    ADK_AVAILABLE = False
    # Define dummy classes if ADK is not available
    class Session: pass
    class InMemorySessionService: pass

# Local Imports
from ..db import (
    create_session as db_create_session,
    get_session as db_get_session,
    list_sessions as db_list_sessions,
    create_message as db_create_message,
    get_session_messages as db_get_session_messages,
    delete_session as db_delete_session,
    update_session as db_update_session
)
from ..models.messages import MessageType

logger = logging.getLogger(__name__)

# Constant for App Name (used in ADK session creation)
APP_NAME = "TKR Multi-Agent Chat"

class ChatService:
    def __init__(self):
        # Agent instances are still loaded at startup and kept in memory
        self.agent_instances: Dict[str, Any] = {}
        # ADK Session Management
        self.adk_session_service = InMemorySessionService() if ADK_AVAILABLE else None
        self.active_adk_sessions: Dict[str, Session] = {}  # Maps app session_id to ADK Session

    # --- Agent Management (Remains the same) ---
    def set_agents(self, agents: Dict[str, Any]) -> None:
        """Load agent instances."""
        self.agent_instances = agents
        logger.info(f"Chat Service loaded {len(agents)} agents.")

    def get_agents(self) -> List[Any]:
        """Get all available agent instances."""
        return list(self.agent_instances.values())

    def get_agent(self, agent_id: str) -> Optional[Any]:
        """Get a specific agent instance by ID."""
        return self.agent_instances.get(agent_id)

    # --- Session Management (Database) ---
    def create_session(self, title: Optional[str] = None, session_id: Optional[str] = None) -> Dict:
        """Create a new chat session in the database."""
        session = db_create_session(title, session_id)
        logger.info(f"Created session {session['id']} in database.")
        return session

    def get_session(self, session_id: str) -> Optional[Dict]:
        """Get an existing chat session from the database."""
        session = db_get_session(session_id)
        return session

    def get_sessions(self, skip: int = 0, limit: int = 100) -> List[Dict]:
        """Get a list of chat sessions from the database."""
        sessions = db_list_sessions(skip, limit)
        logger.debug(f"Retrieved {len(sessions)} sessions.")
        return sessions

    def update_session(self, session_id: str, title: str) -> Optional[Dict]:
        """Update a chat session's title."""
        try:
            session = db_update_session(session_id, {'title': title})
            if session:
                logger.info(f"Updated session {session_id} title to: {title}")
            else:
                logger.warning(f"Session not found for update: {session_id}")
            return session
        except Exception as e:
            logger.error(f"Error updating session {session_id}: {e}", exc_info=True)
            raise

    def delete_session(self, session_id: str) -> bool:
        """Delete a chat session and its associated data."""
        try:
            # Clear ADK session if it exists
            self.clear_adk_session(session_id)
            
            # Delete from database
            success = db_delete_session(session_id)
            if success:
                logger.info(f"Deleted session {session_id} from database.")
            else:
                logger.warning(f"Failed to delete session {session_id} - not found.")
            return success
        except Exception as e:
            logger.error(f"Error deleting session {session_id}: {e}", exc_info=True)
            raise

    # --- ADK Session Management ---
    def get_or_create_adk_session(self, session_id: str, user_id: Optional[str] = None) -> Optional[Session]:
        """
        Creates a new ADK Session for each connection to prevent context persistence.
        """
        if not self.adk_session_service:
            logger.error("ADK Session Service not available.")
            return None

        # Always clear any existing session first
        self.clear_adk_session(session_id)

        # Create a new session
        logger.info(f"Creating new ADK session for app session {session_id}")
        adk_session = self.adk_session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id or session_id,  # Default user_id to session_id if not provided
            session_id=session_id
        )
        self.active_adk_sessions[session_id] = adk_session
        return adk_session

    def clear_adk_session(self, session_id: str):
        """Removes an ADK session from active management (e.g., on disconnect)."""
        if session_id in self.active_adk_sessions:
            logger.info(f"Clearing ADK session for app session {session_id}")
            if self.adk_session_service:
                try:
                    self.adk_session_service.delete_session(
                        app_name=APP_NAME,
                        user_id=session_id,
                        session_id=session_id
                    )
                except Exception as e:
                    logger.error(f"Error deleting ADK session {session_id}: {e}")
            del self.active_adk_sessions[session_id]

    def clear_all_sessions(self):
        """Clear all active ADK sessions."""
        logger.info(f"Clearing all ADK sessions (total: {len(self.active_adk_sessions)})")
        for session_id in list(self.active_adk_sessions.keys()):
            try:
                self.clear_adk_session(session_id)
            except Exception as e:
                logger.error(f"Error clearing ADK session {session_id}: {e}")
        self.active_adk_sessions.clear()
        
    def get_active_session_count(self) -> int:
        """Returns the number of active ADK sessions."""
        return len(self.active_adk_sessions)

    # --- Message Management (Database - Read Only Here) ---
    def get_messages(
        self, 
        session_id: str, 
        skip: int = 0, 
        limit: int = 100,
        cursor: Optional[str] = None,
        direction: str = "desc",
        include_total: bool = False
    ) -> Union[List[Dict], Dict[str, Any]]:
        """
        Get messages for a specific session from the database with pagination support.
        
        Args:
            session_id: The chat session ID
            skip: Number of messages to skip (for offset pagination)
            limit: Maximum number of messages to return
            cursor: Message UUID or timestamp for cursor-based pagination
            direction: Sort direction, 'asc' (oldest first) or 'desc' (newest first)
            include_total: Whether to count total messages
            
        Returns:
            Either a list of messages or a dict with items and pagination metadata.
        """
        # Ensure session exists first
        session = self.get_session(session_id)
        if not session:
            logger.warning(f"Attempted to get messages for non-existent session: {session_id}")
            return [] if not include_total else {"items": [], "pagination": {}}

        result = db_get_session_messages(
            session_id=session_id, 
            skip=skip, 
            limit=limit,
            cursor=cursor,
            direction=direction,
            include_total=include_total
        )
        
        # Log appropriately based on return type
        if isinstance(result, dict):
            message_count = len(result.get("items", []))
            logger.debug(f"Retrieved {message_count} messages for session {session_id} with pagination metadata.")
        else:
            logger.debug(f"Retrieved {len(result)} messages for session {session_id}.")
            
        return result

    # --- Message Saving (Helper for ws.py) ---
    def save_message(self, session_id: str, msg_type: MessageType, parts: List[Dict[str, Any]], agent_id: Optional[str] = None, message_metadata: Optional[Dict[str, Any]] = None) -> Dict:
        """Saves a message to the database. Called from WebSocket handler."""
        log_prefix = f"[SaveMessage Session: {session_id} Type: {msg_type.name} Agent: {agent_id or 'N/A'}]"
        logger.info(f"{log_prefix} Attempting to save. Content snippet: '{str(parts)[:100]}...'")

        # Basic validation
        session = self.get_session(session_id)
        if not session:
             logger.error(f"{log_prefix} Error: Session not found.")
             raise ValueError(f"Session not found: {session_id}")

        # For agent messages, verify the agent exists
        if msg_type == MessageType.AGENT and agent_id:
            agent_exists = agent_id in self.agent_instances
            if not agent_exists:
                logger.error(f"{log_prefix} Agent {agent_id} not found in agent_instances")
                raise ValueError(f"Agent not found: {agent_id}")
        
        # Limit message content size (prevent excessively large messages)
        max_content_size = 32768  # 32KB max content size
        for part in parts:
            if 'content' in part and isinstance(part['content'], str) and len(part['content']) > max_content_size:
                # Truncate long content and add indicator
                part['content'] = part['content'][:max_content_size] + "\n\n[Message truncated due to size limits]"
                logger.warning(f"{log_prefix} Message content truncated to {max_content_size} characters")

        message_data = {
            'session_id': session_id,
            'type': msg_type.value,
            'agent_id': agent_id,
            'parts': parts,
            'message_metadata': message_metadata or {},
            'message_uuid': str(uuid.uuid4()),
            'created_at': datetime.utcnow().isoformat()
        }

        try:
            message = db_create_message(message_data)
            logger.info(f"{log_prefix} Successfully saved message UUID: {message['message_uuid']}")
            
            # Occasionally check if we need to trim messages
            # Use random chance to avoid checking on every message
            if random.random() < 0.1:  # 10% chance to check and trim
                from ..db import trim_session_messages
                # Get message count limit from environment or use default
                max_messages = int(os.environ.get("MAX_SESSION_MESSAGES", "500"))
                deleted_count = trim_session_messages(session_id, max_messages)
                if deleted_count > 0:
                    logger.info(f"{log_prefix} Trimmed {deleted_count} old messages from session {session_id}")
            
            return message
        except Exception as e:
            logger.error(f"{log_prefix} Database error: {e}", exc_info=True)
            raise

# Global instance (used by main.py for agent loading and ws.py for access)
chat_service = ChatService()
