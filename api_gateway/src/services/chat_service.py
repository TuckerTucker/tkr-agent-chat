"""
Chat Service (for ADK Streaming Model with DB Persistence).

Handles:
- Session lifecycle using the database (create, get, list).
- Message retrieval from the database.
- Loading and providing access to agent instances.

Note: Message saving and real-time handling occur within the WebSocket route (`ws.py`).
"""

import uuid
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

# SQLAlchemy Imports
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload # For eager loading messages if needed

# Local Imports
from ..database import get_db # Assuming get_db provides AsyncSession
from ..models.messages import ChatSession, Message, MessageType # Import DB models

logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self):
        # Agent instances are still loaded at startup and kept in memory
        self.agent_instances: Dict[str, Any] = {}
        # Removed in-memory sessions dictionary
        # Removed websocket_connections dictionary

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
    async def create_session(self, db: AsyncSession, title: Optional[str] = None) -> ChatSession:
        """Create a new chat session in the database."""
        session_id = str(uuid.uuid4())
        session = ChatSession(
            id=session_id,
            title=title or f"Chat Session {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            # created_at is handled by server_default
        )
        db.add(session)
        await db.commit()
        await db.refresh(session) # Load default values like created_at
        logger.info(f"Created session {session_id} in database.")
        return session

    async def get_session(self, db: AsyncSession, session_id: str) -> Optional[ChatSession]:
        """Get an existing chat session from the database."""
        result = await db.execute(
            select(ChatSession).filter(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        # logger.debug(f"Retrieved session {session_id}: {'Found' if session else 'Not Found'}")
        return session

    async def get_sessions(self, db: AsyncSession, skip: int = 0, limit: int = 100) -> List[ChatSession]:
        """Get a list of chat sessions from the database."""
        result = await db.execute(
            select(ChatSession).order_by(ChatSession.created_at.desc()).offset(skip).limit(limit)
        )
        sessions = result.scalars().all()
        logger.debug(f"Retrieved {len(sessions)} sessions.")
        return sessions

    # --- Message Management (Database - Read Only Here) ---
    # Note: Message creation happens in ws.py
    async def get_messages(self, db: AsyncSession, session_id: str, skip: int = 0, limit: int = 1000) -> List[Message]:
        """Get messages for a specific session from the database."""
        # Ensure session exists first (optional, depends on desired behavior)
        session = await self.get_session(db, session_id)
        if not session:
            logger.warning(f"Attempted to get messages for non-existent session: {session_id}")
            return []

        result = await db.execute(
            select(Message)
            .filter(Message.session_id == session_id)
            .order_by(Message.created_at.asc()) # Show oldest first
            .offset(skip)
            .limit(limit)
            # .options(selectinload(Message.session)) # Eager load session if needed elsewhere
        )
        messages = result.scalars().all()
        logger.debug(f"Retrieved {len(messages)} messages for session {session_id}.")
        return messages

    # --- Message Saving (Helper for ws.py) ---
    async def save_message(self, db: AsyncSession, session_id: str, msg_type: MessageType, parts: List[Dict[str, Any]], agent_id: Optional[str] = None, message_metadata: Optional[Dict[str, Any]] = None) -> Message: # Renamed metadata param
        """Saves a message to the database. Called from WebSocket handler."""
        # Basic validation (could be more robust)
        if not await self.get_session(db, session_id):
             raise ValueError(f"Session not found: {session_id}")

        message = Message(
            session_id=session_id,
            type=msg_type,
            agent_id=agent_id,
            parts=parts, # Store the list of dicts directly as JSON
            message_metadata=message_metadata or {}, # Use renamed field
            # created_at handled by server_default
            # message_uuid handled by default
        )
        db.add(message)
        await db.commit()
        await db.refresh(message)
        logger.debug(f"Saved message {message.id} to session {session_id}")
        return message


# Global instance (used by main.py for agent loading and ws.py for access)
chat_service = ChatService()
