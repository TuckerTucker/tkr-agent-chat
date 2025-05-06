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
    from unittest.mock import MagicMock, AsyncMock
    
    # Create base agent mock
    def create_agent_mock(agent_id, name):
        agent_mock = MagicMock()
        agent_mock.id = agent_id
        agent_mock.name = name
        agent_mock.description = f"Mock agent {name} for testing"
        agent_mock.color = "#ff5733"
        agent_mock.capabilities = ["testing", "context_aware"]
        agent_mock._health_status = "healthy"
        agent_mock._last_error = None
        agent_mock._last_activity = datetime.now(UTC).isoformat()
        
        # Mock generate_response method
        async def mock_generate_response(session, message, system_prompt=None):
            return f"Response from {name} to message: {message[:30]}..."
        
        agent_mock.generate_response = AsyncMock(side_effect=mock_generate_response)
        
        # Mock get_system_prompt method
        def mock_get_system_prompt(**kwargs):
            template_vars = kwargs.copy()
            
            # Create a basic prompt with template vars
            prompt = f"You are {name}, an AI assistant.\n\n"
            
            # Add formatted context if available
            if 'formatted_context' in template_vars:
                prompt += template_vars['formatted_context']
                
            return prompt
        
        agent_mock.get_system_prompt = mock_get_system_prompt
        
        # Add health status method
        def get_health_status():
            return {
                "id": agent_id,
                "name": name,
                "status": agent_mock._health_status,
                "last_error": agent_mock._last_error,
                "last_activity": agent_mock._last_activity,
                "tools_available": 5,
                "capabilities": agent_mock.capabilities
            }
            
        agent_mock.get_health_status = get_health_status
        
        # Add reset state method
        def reset_state():
            agent_mock._health_status = "healthy"
            agent_mock._last_error = None
            
        agent_mock.reset_state = reset_state
        
        return agent_mock
    
    # Create test agents
    agents = {
        'agent1': create_agent_mock('agent1', 'Mock Agent One'),
        'agent2': create_agent_mock('agent2', 'Mock Agent Two'),
        'agent3': create_agent_mock('agent3', 'Mock Agent Three'),
        'chloe': create_agent_mock('chloe', 'Chloe'),
        'phil_connors': create_agent_mock('phil_connors', 'Phil Connors')
    }
    
    return agents