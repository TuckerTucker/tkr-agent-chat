"""
End-to-end test for context sharing between agents.
"""

import os
import asyncio
import uuid
import json
import pytest
from datetime import datetime, UTC
from typing import Dict, List, Any

# Set path to ensure all modules are available
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

# Import necessary modules
from api_gateway.src.services.chat_service import chat_service
from api_gateway.src.services.context_service import context_service
from api_gateway.src.db import get_shared_contexts, get_session_contexts, share_context
from api_gateway.src.services.socket_message_handler import share_response_context

# Import fixtures
from api_gateway.src.tests.services.fixtures_context import setup_test_database, mock_agents

# Test session ID
TEST_SESSION_ID = str(uuid.uuid4())

class MockSocketIO:
    """Mock SocketIO server for testing."""
    def __init__(self):
        self.events = {}
        self.rooms = {}
        self.emissions = []
        
    async def emit(self, event, data, room=None, namespace=None, skip_sid=None):
        self.emissions.append({
            "event": event,
            "data": data,
            "room": room,
            "namespace": namespace,
            "skip_sid": skip_sid
        })
        return True

@pytest.mark.asyncio
async def test_context_creation_direct():
    """Test context creation directly with the database."""
    # Get agent IDs (assuming 'chloe' and 'phil_connors' exist)
    agent1 = "chloe"
    agent2 = "phil_connors"
    
    # Create context data
    context_data = {
        "content": f"Test context from {agent1} at {datetime.now(UTC).isoformat()}",
        "timestamp": datetime.now(UTC).isoformat()
    }
    
    # Share context directly
    context = share_context({
        'session_id': TEST_SESSION_ID,
        'source_agent_id': agent1,
        'target_agent_id': agent2,
        'context_type': 'test',
        'content': context_data,
        'context_metadata': {"test": True},
        'expires_at': (datetime.now(UTC)).isoformat()
    })
    
    # Verify context was created
    assert context is not None, "Failed to create context"
    assert context["id"] is not None, "Context ID is missing"
    assert context["source_agent_id"] == agent1, "Source agent ID mismatch"
    assert context["target_agent_id"] == agent2, "Target agent ID mismatch"
    
    # Get contexts for target agent
    target_contexts = get_shared_contexts(
        target_agent_id=agent2,
        session_id=TEST_SESSION_ID
    )
    
    # Verify we can retrieve the context
    assert len(target_contexts) > 0, "No contexts found for target agent"
    assert any(ctx["id"] == context["id"] for ctx in target_contexts), "Created context not found"
    
    # Test get_session_contexts function
    session_contexts = get_session_contexts(TEST_SESSION_ID)
    assert len(session_contexts) > 0, "No contexts found for session"
    assert any(ctx["id"] == context["id"] for ctx in session_contexts), "Created context not found in session"

@pytest.mark.asyncio
async def test_context_service_format(mock_agents):
    """Test the format_context_for_content method."""
    # Get agent IDs
    agent1 = "chloe"
    agent2 = "phil_connors"
    
    # Create some test contexts
    for i in range(3):
        # Create context data
        context_data = {
            "content": f"Test context {i+1} from {agent1}",
            "timestamp": datetime.now(UTC).isoformat()
        }
        
        # Share context directly using context_service
        context_service.share_context(
            source_agent_id=agent1,
            target_agent_id=agent2,
            context_data=context_data,
            session_id=TEST_SESSION_ID
        )
    
    # Format context for the target agent
    formatted_context = context_service.format_context_for_content(
        target_agent_id=agent2,
        session_id=TEST_SESSION_ID
    )
    
    # Verify formatting
    assert formatted_context is not None, "Formatted context is None"
    assert "CONTEXT FROM OTHER PARTICIPANTS" in formatted_context, "Missing context header"
    assert f"From {agent1}" in formatted_context, "Missing source agent reference"
    
    # Print formatted context for debugging
    print(f"\nFormatted context example:\n{formatted_context}\n")
    
    # Now check if share_response_context correctly handles these contexts
    mock_sio = MockSocketIO()
    
    # Create a response text
    response_text = "This is a test response from agent1"
    
    # Make mocks of agents available to chat_service
    chat_service.set_agents(mock_agents)
    
    # Share response context
    await share_response_context(
        sio=mock_sio,
        session_id=TEST_SESSION_ID,
        source_agent_id=agent1,
        response_text=response_text,
        namespace="/agents"
    )
    
    # Check if the context was shared via emissions
    context_emissions = [e for e in mock_sio.emissions if e["event"] == "context:update"]
    assert len(context_emissions) > 0, "No context update emissions"
    
    # Verify that the context was shared to the other agent
    shared_contexts = context_service.get_shared_context(
        target_agent_id=agent2,
        session_id=TEST_SESSION_ID
    )
    
    # There should be at least 3 (from the earlier creates) + 1 from share_response_context
    assert len(shared_contexts) >= 4, "Missing expected contexts"
    
    # The newest context should contain our response text
    newest_context = shared_contexts[0]  # Contexts are sorted by created_at DESC
    assert response_text in json.dumps(newest_context["content"]), "Response text not found in latest context"

if __name__ == "__main__":
    # Run the test manually
    import asyncio
    
    print("\n==== Running Context Sharing Tests ====\n")
    
    # Create mock agents
    mock_agent_fixtures = {'chloe': object(), 'phil_connors': object()}
    chat_service.set_agents(mock_agent_fixtures)
    
    print("Testing DB-level context creation...")
    asyncio.run(test_context_creation_direct())
    
    print("\nTesting context service formatting...")
    asyncio.run(test_context_service_format(mock_agent_fixtures))
    
    print("\n==== Tests Completed ====\n")