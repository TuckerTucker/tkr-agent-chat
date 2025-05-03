"""
Tests for the context service.
"""

import pytest
from datetime import datetime, timedelta, UTC
from typing import Dict, Any

from ...services.context_service import context_service, calculate_relevance_score
from .fixtures_context import setup_test_database, setup_context_service, mock_agents

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

def test_share_context(setup_context_service):
    """Test sharing context between agents."""
    source_agent = "agent1"
    target_agent = "agent2"
    context_data = {"key": "value"}
    session_id = "test-session-1234"
    
    context = setup_context_service.share_context(
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

def test_get_shared_context(setup_context_service):
    """Test retrieving shared context."""
    source_agent = "agent1"
    target_agent = "agent2"
    session_id = "test-session-1234"
    
    # Create some test contexts
    setup_context_service.share_context(
        source_agent_id=source_agent,
        target_agent_id=target_agent,
        context_data={"key1": "value1"},
        session_id=session_id
    )
    
    setup_context_service.share_context(
        source_agent_id=source_agent,
        target_agent_id=target_agent,
        context_data={"key2": "value2"},
        session_id=session_id
    )
    
    # Test retrieval
    contexts = setup_context_service.get_shared_context(
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

def test_update_context(setup_context_service):
    """Test updating context."""
    # Create initial context
    context = setup_context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "old_value"},
        session_id="test-session-1234"
    )
    
    # Update context
    updated = setup_context_service.update_context(
        context_id=context["id"],
        updates={
            "content": {"key": "new_value"},
            "context_type": "summary"
        }
    )
    
    assert updated["content"]["key"] == "new_value"
    assert updated["context_type"] == "summary"
    assert "updated_at" in updated["context_metadata"]

def test_extend_context_ttl(setup_context_service, monkeypatch):
    """Test extending context TTL."""
    # Mock datetime functions to avoid timezone issues
    class MockDatetime:
        @classmethod
        def now(cls, tz=None):
            return datetime(2025, 5, 1, 12, 0, 0, tzinfo=tz)
        
        @classmethod
        def utcnow(cls):
            return datetime(2025, 5, 1, 12, 0, 0)
        
        @classmethod
        def fromisoformat(cls, date_string):
            # Ensure we return naive datetime for testing
            dt = datetime.fromisoformat(date_string)
            if dt.tzinfo is not None:
                return dt.replace(tzinfo=None)
            return dt
            
    # Apply the monkeypatch for datetime
    monkeypatch.setattr("src.db.datetime", MockDatetime)
    
    # Create context with TTL
    context = setup_context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "value"},
        session_id="test-session-1234",
        ttl_minutes=60
    )
    
    # Extend TTL
    extended = setup_context_service.extend_context_ttl(
        context_id=context["id"],
        additional_minutes=30
    )
    
    assert extended is not None
    assert "ttl_extended_at" in extended["context_metadata"]
    assert extended["context_metadata"]["ttl_extension"] == 30

def test_batch_cleanup_contexts(setup_context_service, monkeypatch):
    """Test cleaning up expired contexts."""
    # Create a mock datetime for consistent testing
    class MockDatetime:
        @classmethod
        def now(cls, tz=None):
            return datetime(2025, 5, 1, 12, 0, 0, tzinfo=tz)
        
        @classmethod
        def utcnow(cls):
            return datetime(2025, 5, 1, 12, 0, 0)
            
        @classmethod
        def fromisoformat(cls, date_string):
            # Ensure we return naive datetime for testing
            dt = datetime.fromisoformat(date_string)
            if dt.tzinfo is not None:
                return dt.replace(tzinfo=None)
            return dt
            
    # Apply the monkeypatch
    monkeypatch.setattr("src.db.datetime", MockDatetime)
    
    # Create test contexts
    context1 = setup_context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "value1"},
        session_id="test-session-1234",
        ttl_minutes=60
    )
    
    context2 = setup_context_service.share_context(
        source_agent_id="agent1",
        target_agent_id="agent2",
        context_data={"key": "value2"},
        session_id="test-session-1234",
        ttl_minutes=60
    )
    
    # Manually modify the context expiry in the database
    from src.db import get_connection
    with get_connection() as conn:
        past_time = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
        conn.execute(
            "UPDATE shared_contexts SET expires_at = ? WHERE id = ?",
            (past_time, context1["id"])
        )
        conn.execute(
            "UPDATE shared_contexts SET expires_at = ? WHERE id = ?",
            (past_time, context2["id"])
        )
        conn.commit()
    
    # Run cleanup
    removed_count = setup_context_service.batch_cleanup_contexts(batch_size=10)
    
    # Assert contexts were cleaned up
    assert removed_count >= 2
