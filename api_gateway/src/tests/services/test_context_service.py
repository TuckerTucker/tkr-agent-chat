"""
Tests for the context service.
"""

import pytest
from datetime import datetime, timedelta, UTC
from typing import Dict, Any

from ...services.context_service import context_service, calculate_relevance_score

def test_calculate_relevance_score():
    """Test the relevance score calculation."""
    content = {
        "key1": "test value",
        "key2": "another value",
        "nested": {
            "key3": "nested value"
        }
    }
    
    # Test exact match
    assert calculate_relevance_score(content, "test value") > 0.5
    
    # Test partial match
    assert calculate_relevance_score(content, "test") > 0.3
    
    # Test no match
    assert calculate_relevance_score(content, "nonexistent") < 0.3
    
    # Test empty query
    assert calculate_relevance_score(content, "") == 0.0

def test_share_context():
    """Test sharing context between agents."""
    source_agent = "agent1"
    target_agent = "agent2"
    context_data = {"key": "value"}
    session_id = "test_session"
    
    context = context_service.share_context(
        source_agent_id=source_agent,
        target_agent_id=target_agent,
        context_data=context_data,
        session_id=session_id,
        context_type="relevant",
        ttl_minutes=60
    )
    
    assert context["source_agent_id"] == source_agent
    assert context["target_agent_id"] == target_agent
    assert context["content"] == context_data
    assert context["session_id"] == session_id
    assert context["context_type"] == "relevant"
    assert "expires_at" in context

def test_get_shared_context():
    """Test retrieving shared context."""
    source_agent = "agent1"
    target_agent = "agent2"
    session_id = "test_session"
    
    # Create some test contexts
    context_service.share_context(
        source_agent_id=source_agent,
        target_agent_id=target_agent,
        context_data={"key1": "value1"},
        session_id=session_id
    )
    
    context_service.share_context(
        source_agent_id=source_agent,
        target_agent_id=target_agent,
        context_data={"key2": "value2"},
        session_id=session_id
    )
    
    # Test retrieval
    contexts = context_service.get_shared_context(
        target_agent_id=target_agent,
        session_id=session_id,
        source_agent_id=source_agent
    )
    
    assert len(contexts) == 2
    assert all(c["source_agent_id"] == source_agent for c in contexts)
    assert all(c["target_agent_id"] == target_agent for c in contexts)
    assert all(c["session_id"] == session_id for c in contexts)

def test_filter_relevant_context():
    """Test filtering contexts by relevance."""
    contexts = [
        {
            "id": "1",
            "content": {"text": "This is a test message about cats"},
            "context_metadata": {}
        },
        {
            "id": "2",
            "content": {"text": "This is about dogs"},
            "context_metadata": {}
        }
    ]
    
    # Test filtering with query about cats
    filtered = context_service.filter_relevant_context(
        contexts=contexts,
        query="cats",
        min_score=0.3
    )
    
    assert len(filtered) == 1
    assert filtered[0]["context"]["id"] == "1"
    assert filtered[0]["score"] > 0.3

def test_update_context():
    """Test updating context."""
    # Create initial context
    context = context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "old_value"}
    )
    
    # Update context
    updated = context_service.update_context(
        context_id=context["id"],
        updates={
            "content": {"key": "new_value"},
            "context_type": "summary"
        }
    )
    
    assert updated["content"]["key"] == "new_value"
    assert updated["context_type"] == "summary"
    assert "updated_at" in updated["context_metadata"]

def test_extend_context_ttl():
    """Test extending context TTL."""
    # Create context with TTL
    context = context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "value"},
        ttl_minutes=60
    )
    
    # Extend TTL
    extended = context_service.extend_context_ttl(
        context_id=context["id"],
        additional_minutes=30
    )
    
    assert extended is not None
    assert "ttl_extended_at" in extended["context_metadata"]
    assert extended["context_metadata"]["ttl_extension"] == 30

def test_batch_cleanup_contexts():
    """Test cleaning up expired contexts."""
    # Create some expired contexts
    context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "value1"},
        ttl_minutes=0  # Immediate expiry
    )
    
    context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "value2"},
        ttl_minutes=0  # Immediate expiry
    )
    
    # Run cleanup
    removed_count = context_service.batch_cleanup_contexts(batch_size=10)
    assert removed_count == 2
