"""
Chat Service (for ADK Streaming Model).

Handles:
- Basic session lifecycle (create, get) 
- Loading and providing access to agent instances.
- Registering/Unregistering WebSocket connections (used by ws.py for cleanup).

Note: Message routing and agent execution are now handled directly within the 
WebSocket route (`ws.py`) using the ADK library. This service primarily acts 
as a holder for agent instances and session data.
"""

import uuid
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from ..models.messages import ChatSession # Keep basic session model

logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self):
        self.sessions: Dict[str, ChatSession] = {}
        self.agent_instances: Dict[str, Any] = {}  # Populated at startup
        # Note: Agent status/metadata management is removed as it was tied to A2A
        self.websocket_connections: Dict[str, Any] = {}  # session_id -> websocket

    # Agent Management
    def set_agents(self, agents: Dict[str, Any]) -> None:
        """Load agent instances."""
        self.agent_instances = agents
        logger.info(f"Chat Service loaded {len(agents)} agents.")

    def get_agents(self) -> List[Any]:
        """Get all available agent instances."""
        # Note: Returning raw agent instances now, not AgentMetadata
        return list(self.agent_instances.values())

    def get_agent(self, agent_id: str) -> Optional[Any]:
        """Get a specific agent instance by ID."""
        return self.agent_instances.get(agent_id)

    # Session Management (Simplified)
    def create_session(self, title: Optional[str] = None) -> ChatSession:
        """Create a new chat session (minimal implementation)."""
        session_id = str(uuid.uuid4())
        session = ChatSession(
            id=session_id,
            title=title or f"Chat {len(self.sessions) + 1}",
            created_at=datetime.utcnow().isoformat(),
            active_agents=[], # No longer tracking active agents per session here
        )
        self.sessions[session_id] = session
        logger.info(f"Created session {session_id}")
        return session

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """Get an existing chat session."""
        return self.sessions.get(session_id)

    # WebSocket Management (Kept for potential future use)
    def register_websocket(self, session_id: str, websocket: Any) -> None:
        """Register a WebSocket connection."""
        self.websocket_connections[session_id] = websocket
        logger.debug(f"Registered WebSocket for session {session_id}")

    def unregister_websocket(self, session_id: str) -> None:
        """Unregister a WebSocket connection."""
        self.websocket_connections.pop(session_id, None)
        logger.debug(f"Unregistered WebSocket for session {session_id}")

# Global instance
chat_service = ChatService()
