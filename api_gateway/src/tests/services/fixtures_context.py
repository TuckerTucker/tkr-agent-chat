"""
Fixtures for context service tests.

Provides shared fixtures for test_context_service.py and test_context_sharing.py 
that properly set up the database for tests.
"""

import pytest
import uuid
from datetime import datetime, UTC
from src.db import get_connection
from src.services.chat_service import chat_service

@pytest.fixture
def setup_test_database():
    """Set up test database with required agent and session records."""
    # Create a unique connection for this test
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Delete existing test data to start fresh
        # First check if we have messages that depend on the sessions
        cursor.execute("DELETE FROM messages WHERE session_id LIKE 'test-%'")
        # Then delete shared contexts
        cursor.execute("DELETE FROM shared_contexts WHERE session_id LIKE 'test-%'")
        # Now safe to delete sessions  
        cursor.execute("DELETE FROM chat_sessions WHERE id LIKE 'test-%'")
        # And finally delete test agents
        cursor.execute("DELETE FROM agent_cards WHERE id IN ('agent1', 'agent2', 'agent3')")
        
        # Create test agents
        agents = [
            {
                "id": "agent1",
                "name": "Test Agent 1",
                "description": "Agent for testing",
                "color": "rgb(34, 197, 94)",
                "capabilities": '["test"]',
                "is_active": True,
                "created_at": datetime.now(UTC).isoformat()
            },
            {
                "id": "agent2",
                "name": "Test Agent 2",
                "description": "Agent for testing",
                "color": "rgb(249, 115, 22)",
                "capabilities": '["test"]',
                "is_active": True,
                "created_at": datetime.now(UTC).isoformat()
            },
            {
                "id": "agent3",
                "name": "Test Agent 3",
                "description": "Agent for testing",
                "color": "rgb(59, 130, 246)",
                "capabilities": '["test"]',
                "is_active": True,
                "created_at": datetime.now(UTC).isoformat()
            }
        ]
        
        for agent in agents:
            cursor.execute("""
                INSERT OR REPLACE INTO agent_cards (
                    id, name, description, color, capabilities, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                agent["id"],
                agent["name"],
                agent["description"],
                agent["color"],
                agent["capabilities"],
                agent["is_active"],
                agent["created_at"]
            ))
        
        # Create test sessions
        sessions = [
            {"id": "test-session-1234", "created_at": datetime.now(UTC).isoformat()},
            {"id": "test-session-5678", "created_at": datetime.now(UTC).isoformat()}
        ]
        
        for session in sessions:
            cursor.execute("""
                INSERT OR REPLACE INTO chat_sessions (id, created_at)
                VALUES (?, ?)
            """, (session["id"], session["created_at"]))
        
        # Commit the changes
        conn.commit()
        
        yield
        
        # Clean up test data
        # First check if we have messages that depend on the sessions
        cursor.execute("DELETE FROM messages WHERE session_id LIKE 'test-%'")
        # Then delete shared contexts  
        cursor.execute("DELETE FROM shared_contexts WHERE session_id LIKE 'test-%'")
        # Now safe to delete sessions
        cursor.execute("DELETE FROM chat_sessions WHERE id LIKE 'test-%'")
        # And finally delete test agents
        cursor.execute("DELETE FROM agent_cards WHERE id IN ('agent1', 'agent2', 'agent3')")
        conn.commit()

@pytest.fixture
def setup_context_service(setup_test_database):
    """Set up the context service with mock agents."""
    # Return context service
    from src.services.context_service import context_service
    return context_service

@pytest.fixture
def mock_agents():
    """Create mock agents for testing."""
    class MockAgent:
        def __init__(self, agent_id):
            self.id = agent_id
            self.name = f"Test Agent {agent_id}"
            self.description = "A test agent for unit tests"
            self.color = "#ff5733"
            self.capabilities = ["testing", "mocking"]
            self._health_status = "healthy"
            self._last_error = None
            self._last_activity = None
            
        def get_health_status(self):
            return {
                "id": self.id,
                "name": self.name,
                "status": self._health_status,
                "last_error": self._last_error,
                "last_activity": self._last_activity,
                "tools_available": 5,
                "capabilities": self.capabilities
            }
            
        def reset_state(self):
            self._health_status = "healthy"
            self._last_error = None
    
    return {
        "agent1": MockAgent("agent1"),
        "agent2": MockAgent("agent2"),
        "agent3": MockAgent("agent3")
    }