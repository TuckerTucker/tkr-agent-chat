"""
Integration tests for the context sharing mechanism between agents.
"""

import json
import pytest
import asyncio
import uuid
from datetime import datetime
from unittest.mock import patch, AsyncMock, MagicMock

from services.context_service import context_service
from services.chat_service import chat_service
from models.shared_context import SharedContext


@pytest.fixture
def setup_context_service(setup_chat_service):
    """Set up the context service with initial data."""
    # Clear any existing context data
    context_service.contexts = {}
    return context_service


@pytest.fixture
def mock_agents():
    """Create multiple mock agents for testing context sharing."""
    class MockAgent:
        def __init__(self, agent_id):
            self.id = agent_id
            self.name = f"Test Agent {agent_id}"
            self.description = "A test agent for unit tests"
            self.color = "#ff5733"
            self.capabilities = ["testing", "mocking"]
            self.config = {
                "id": agent_id,
                "name": f"Test Agent {agent_id}",
                "description": "A test agent for unit tests",
                "color": "#ff5733",
                "capabilities": ["testing", "mocking"]
            }
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


@pytest.mark.asyncio
async def test_share_context_between_agents(setup_context_service, mock_agents):
    """Test that context can be shared between agents."""
    # Setup
    context_service = setup_context_service
    session_id = "test-session-1234"
    
    # Register the test agents with the chat service
    chat_service.set_agents({
        agent_id: agent for agent_id, agent in mock_agents.items()
    })
    
    # Share context from agent1 to agent2
    context_data = {"content": "This is important information from agent1"}
    shared = context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        session_id=session_id,
        context_data=context_data
    )
    
    # Verify context was shared
    assert shared is True
    
    # Get contexts for agent2
    contexts = context_service.get_shared_context(
        target_agent_id="agent2",
        session_id=session_id
    )
    
    # Verify context properties
    assert len(contexts) == 1
    assert contexts[0]["source_agent_id"] == "agent1"
    assert contexts[0]["target_agent_id"] == "agent2"
    assert contexts[0]["session_id"] == session_id
    assert contexts[0]["content"] == context_data


@pytest.mark.asyncio
async def test_context_relevance_scoring(setup_context_service, mock_agents):
    """Test that context relevance scoring works correctly."""
    # Setup
    context_service = setup_context_service
    session_id = "test-session-1234"
    
    # Register the test agents
    chat_service.set_agents({
        agent_id: agent for agent_id, agent in mock_agents.items()
    })
    
    # Share multiple contexts with different relevance characteristics
    # Context 1: Standard context (medium relevance)
    context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent3",
        session_id=session_id,
        context_data={"content": "Standard relevance context"}
    )
    
    # Context 2: Important context (high relevance)
    context_service.share_context(
        source_agent_id="agent2",
        target_agent_id="agent3",
        session_id=session_id,
        context_data={"content": "High relevance context", "importance": "high"}
    )
    
    # Context 3: Old context (lower relevance due to age)
    old_context = context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent3",
        session_id=session_id,
        context_data={"content": "Old context that should be less relevant"}
    )
    
    # Manually set created_at to an older time to simulate age
    # This requires implementation-specific code
    for ctx_id, ctx in context_service.contexts.items():
        if ctx["content"].get("content") == "Old context that should be less relevant":
            # Make this context older by setting created_at to 10 days ago
            old_time = datetime.utcnow()
            old_time = old_time.replace(day=old_time.day - 10)
            context_service.contexts[ctx_id]["created_at"] = old_time.isoformat()
    
    # Format context with relevance ordering
    formatted_context = context_service.format_context_for_content(
        target_agent_id="agent3",
        session_id=session_id
    )
    
    # Verify the formatted context
    assert formatted_context is not None
    
    # The high relevance context should appear first in the formatted string
    assert "High relevance context" in formatted_context
    assert formatted_context.index("High relevance context") < formatted_context.index("Standard relevance context")
    
    # The old context should be last
    assert "Old context" in formatted_context
    assert formatted_context.index("Old context") > formatted_context.index("Standard relevance context")


@pytest.mark.asyncio
async def test_context_expiration(setup_context_service, mock_agents):
    """Test that contexts expire based on configured TTL."""
    # Setup
    context_service = setup_context_service
    # Set a very short TTL for testing expiration
    context_service.context_ttl_minutes = 0.001  # 60ms
    session_id = "test-session-1234"
    
    # Register the test agents
    chat_service.set_agents({
        agent_id: agent for agent_id, agent in mock_agents.items()
    })
    
    # Share context
    context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        session_id=session_id,
        context_data={"content": "This context should expire quickly"}
    )
    
    # Verify context exists initially
    contexts_before = context_service.get_shared_context(
        target_agent_id="agent2",
        session_id=session_id
    )
    assert len(contexts_before) == 1
    
    # Wait for context to expire
    await asyncio.sleep(0.1)  # 100ms should be enough for the 60ms TTL
    
    # Try to clean up expired contexts
    removed = context_service.cleanup_expired_contexts()
    
    # Verify context was removed
    contexts_after = context_service.get_shared_context(
        target_agent_id="agent2",
        session_id=session_id
    )
    assert len(contexts_after) == 0
    assert removed >= 1


@pytest.mark.asyncio
async def test_multi_agent_context_routing(setup_context_service, mock_agents):
    """Test context sharing in a multi-agent environment."""
    # Setup
    context_service = setup_context_service
    session_id = "test-session-1234"
    
    # Register the test agents
    chat_service.set_agents({
        agent_id: agent for agent_id, agent in mock_agents.items()
    })
    
    # Agent1 shares context with both Agent2 and Agent3
    context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        session_id=session_id,
        context_data={"content": "Context for Agent2 only"}
    )
    
    context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent3",
        session_id=session_id,
        context_data={"content": "Context for Agent3 only"}
    )
    
    context_service.share_context(
        source_agent_id="agent1",
        target_agent_id=None,  # Broadcast to all agents
        session_id=session_id,
        context_data={"content": "Broadcast context for all agents"}
    )
    
    # Verify agent2 receives its contexts
    agent2_contexts = context_service.get_shared_context(
        target_agent_id="agent2",
        session_id=session_id
    )
    
    # Should have its direct context and the broadcast
    assert len(agent2_contexts) == 2
    context_contents = [ctx["content"]["content"] for ctx in agent2_contexts]
    assert "Context for Agent2 only" in context_contents
    assert "Broadcast context for all agents" in context_contents
    assert "Context for Agent3 only" not in context_contents
    
    # Verify agent3 receives its contexts
    agent3_contexts = context_service.get_shared_context(
        target_agent_id="agent3",
        session_id=session_id
    )
    
    # Should have its direct context and the broadcast
    assert len(agent3_contexts) == 2
    context_contents = [ctx["content"]["content"] for ctx in agent3_contexts]
    assert "Context for Agent3 only" in context_contents
    assert "Broadcast context for all agents" in context_contents
    assert "Context for Agent2 only" not in context_contents