"""
Test message persistence in the TKR Multi-Agent Chat API Gateway.

These tests specifically focus on the message saving and retrieval flow 
to diagnose issues with messages not persisting to the database.
"""

import os
import sys
import uuid
import json
import asyncio
import pytest
from datetime import datetime, UTC
from typing import Dict, List, Any

# Import necessary modules
from api_gateway.src.services.chat_service import chat_service
from api_gateway.src.services.socket_message_handler import store_message, handle_text_message
from api_gateway.src.models.messages import MessageType
from api_gateway.src.db import (
    create_session as db_create_session,
    get_session as db_get_session,
    get_message as db_get_message,
    get_session_messages as db_get_session_messages
)

# Import fixtures
from api_gateway.src.tests.services.fixtures_socket import setup_test_database, mock_sio, mock_sid

# Test session ID
TEST_SESSION_ID = str(uuid.uuid4())

# Test setup
@pytest.fixture
def test_session():
    """Create a test session."""
    session = db_create_session(
        title=f"Test Session {datetime.now(UTC).isoformat()}",
        session_id=TEST_SESSION_ID
    )
    return session

@pytest.mark.asyncio
async def test_message_save_direct():
    """Test direct message saving to the database."""
    session_id = TEST_SESSION_ID
    
    # Create a session first if needed
    if not db_get_session(session_id):
        db_create_session(title="Message Test Session", session_id=session_id)
    
    # Verify no existing messages
    initial_messages = db_get_session_messages(session_id)
    if isinstance(initial_messages, dict) and "items" in initial_messages:
        initial_messages = initial_messages["items"]
    initial_count = len(initial_messages)
    
    # Create message data
    message_uuid = str(uuid.uuid4())
    message_data = {
        'session_id': session_id,
        'type': MessageType.USER.value,  # 'user'
        'agent_id': None,
        'parts': [{"type": "text", "content": "Direct test message"}],
        'message_metadata': {
            'timestamp': datetime.now(UTC).isoformat(),
            'message_id': message_uuid,
            'test': True
        },
        'message_uuid': message_uuid,
        'created_at': datetime.now(UTC).isoformat()
    }
    
    # Insert message directly to DB
    from api_gateway.src.db import create_message as db_create_message
    saved_message = db_create_message(message_data)
    
    # Verify the message was saved
    assert saved_message is not None, "Message was not saved"
    assert saved_message["message_uuid"] == message_uuid, "Message UUID mismatch"
    
    # Get all messages for the session
    updated_messages = db_get_session_messages(session_id)
    if isinstance(updated_messages, dict) and "items" in updated_messages:
        updated_messages = updated_messages["items"]
    
    # Verify message count increased
    assert len(updated_messages) == initial_count + 1, "Message count did not increase"
    
    # Verify the specific message is retrievable
    retrieved_message = db_get_message(message_uuid)
    assert retrieved_message is not None, "Could not retrieve saved message"
    assert retrieved_message["message_uuid"] == message_uuid, "Retrieved message UUID mismatch"
    assert retrieved_message["parts"][0]["content"] == "Direct test message", "Message content mismatch"

@pytest.mark.asyncio
async def test_chat_service_save_message():
    """Test saving messages through chat_service."""
    session_id = TEST_SESSION_ID
    
    # Create a session first if needed
    if not db_get_session(session_id):
        db_create_session(title="Message Test Session", session_id=session_id)
    
    # Get initial message count
    initial_messages = db_get_session_messages(session_id)
    if isinstance(initial_messages, dict) and "items" in initial_messages:
        initial_messages = initial_messages["items"]
    initial_count = len(initial_messages)
    
    # Message details
    message_uuid = str(uuid.uuid4())
    message_content = "Test message via chat_service"
    message_parts = [{"type": "text", "content": message_content}]
    message_metadata = {
        'timestamp': datetime.now(UTC).isoformat(),
        'message_id': message_uuid,
        'test': True
    }
    
    # Save using chat_service
    saved_message = chat_service.save_message(
        session_id=session_id,
        msg_type=MessageType.USER,
        parts=message_parts,
        message_metadata=message_metadata
    )
    
    # Verify the message was saved
    assert saved_message is not None, "Message was not saved through chat_service"
    message_uuid = saved_message["message_uuid"]
    
    # Get all messages for the session
    updated_messages = db_get_session_messages(session_id)
    if isinstance(updated_messages, dict) and "items" in updated_messages:
        updated_messages = updated_messages["items"]
    
    # Verify message count increased
    assert len(updated_messages) == initial_count + 1, "Message count did not increase"
    
    # Verify the specific message is retrievable
    retrieved_message = db_get_message(message_uuid)
    assert retrieved_message is not None, "Could not retrieve saved message"
    assert retrieved_message["parts"][0]["content"] == message_content, "Message content mismatch"

@pytest.mark.asyncio
async def test_store_message_handler(mock_sio, mock_sid):
    """Test the store_message handler function."""
    session_id = TEST_SESSION_ID
    
    # Create a session first if needed
    if not db_get_session(session_id):
        db_create_session(title="Message Test Session", session_id=session_id)
    
    # Get initial message count
    initial_messages = db_get_session_messages(session_id)
    if isinstance(initial_messages, dict) and "items" in initial_messages:
        initial_messages = initial_messages["items"]
    initial_count = len(initial_messages)
    
    # Standardized message format
    message_id = str(uuid.uuid4())
    test_message = {
        "id": message_id,
        "type": "text",
        "session_id": session_id,
        "from_user": "test_user",
        "to_agent": "chloe",
        "content": "Test message via socket handler",
        "timestamp": datetime.now(UTC).isoformat()
    }
    
    # Store message using handler
    success, error, saved_id = await store_message(test_message)
    
    # Verify message was stored
    assert success, f"Failed to store message: {error}"
    assert saved_id is not None, "No message ID returned"
    
    # Get updated message count
    updated_messages = db_get_session_messages(session_id)
    if isinstance(updated_messages, dict) and "items" in updated_messages:
        updated_messages = updated_messages["items"]
    
    # Verify message count increased
    assert len(updated_messages) == initial_count + 1, "Message count did not increase"
    
    # Verify the message is retrievable
    retrieved_message = db_get_message(saved_id)
    assert retrieved_message is not None, "Could not retrieve saved message"

@pytest.mark.asyncio
async def test_handle_text_message(mock_sio, mock_sid):
    """Test the complete text message handler."""
    session_id = TEST_SESSION_ID
    
    # Create a session first if needed
    if not db_get_session(session_id):
        db_create_session(title="Message Test Session", session_id=session_id)
    
    # Get initial message count  
    initial_messages = db_get_session_messages(session_id)
    if isinstance(initial_messages, dict) and "items" in initial_messages:
        initial_messages = initial_messages["items"]
    initial_count = len(initial_messages)
    
    # Create test message in standard format
    message_id = str(uuid.uuid4())
    test_message = {
        "id": message_id,
        "type": "text",
        "session_id": session_id,
        "from_user": "test_user",
        "to_agent": "chloe",
        "content": "End-to-end test message via handle_text_message",
        "timestamp": datetime.now(UTC).isoformat(),
        
        # Legacy fields for backward compatibility
        "sessionId": session_id,
        "toAgent": "chloe",
        "text": "End-to-end test message via handle_text_message"
    }
    
    # Process message with handler
    result = await handle_text_message(mock_sio, mock_sid, test_message, "/agents")
    
    # Check result
    assert result is not None, "No result from message handler"
    assert result.get("status") == "delivered", f"Message not delivered: {result}"
    assert result.get("id") == message_id, "Message ID mismatch"
    assert result.get("persistedId") is not None, "No persisted ID returned"
    
    persisted_id = result.get("persistedId")
    
    # Get updated message count
    updated_messages = db_get_session_messages(session_id)
    if isinstance(updated_messages, dict) and "items" in updated_messages:
        updated_messages = updated_messages["items"]
    
    # Verify message count increased
    assert len(updated_messages) == initial_count + 1, "Message count did not increase"
    
    # Verify the message is retrievable
    retrieved_message = db_get_message(persisted_id)
    assert retrieved_message is not None, "Could not retrieve saved message"
    
    # Check that the message type was saved correctly
    if test_message.get("from_user") or test_message.get("fromUser"):
        assert retrieved_message["type"] == "user", f"Message type should be 'user', but was {retrieved_message['type']}"
    elif test_message.get("from_agent") or test_message.get("fromAgent"):
        assert retrieved_message["type"] == "agent", f"Message type should be 'agent', but was {retrieved_message['type']}"
    
    # Check that the message content was saved correctly
    assert any(part.get("content") == test_message.get("content") for part in retrieved_message["parts"]), "Message content not saved correctly"
    
    # Check that the message was emitted to the correct room
    assert len(mock_sio.emissions) > 0, "No messages emitted"
    
    # The message should be emitted to the agent's room
    agent_emission = next((e for e in mock_sio.emissions 
                         if e["event"] == "message" and 
                            e["room"] == f"agent_chloe"), None)
    
    assert agent_emission is not None, "Message not emitted to agent room"

@pytest.mark.asyncio
async def test_retrieve_messages_api():
    """Test retrieving messages through the chat_service API."""
    session_id = TEST_SESSION_ID
    
    # Create a session first if needed
    if not db_get_session(session_id):
        db_create_session(title="Message Test Session", session_id=session_id)
    
    # Create some test messages if none exist
    messages = db_get_session_messages(session_id)
    if isinstance(messages, dict) and "items" in messages:
        messages = messages["items"]
    
    if len(messages) == 0:
        # Create a few test messages
        for i in range(3):
            message_data = {
                'session_id': session_id,
                'type': MessageType.USER.value,
                'agent_id': None,
                'parts': [{"type": "text", "content": f"Test message #{i+1}"}],
                'message_metadata': {
                    'timestamp': datetime.now(UTC).isoformat(),
                    'message_id': str(uuid.uuid4()),
                    'test': True
                },
                'message_uuid': str(uuid.uuid4()),
                'created_at': datetime.now(UTC).isoformat()
            }
            from api_gateway.src.db import create_message as db_create_message
            db_create_message(message_data)
    
    # Test different retrieval methods
    
    # 1. Basic retrieval
    messages = chat_service.get_messages(session_id)
    if isinstance(messages, dict) and "items" in messages:
        messages = messages["items"]
    
    assert len(messages) > 0, "No messages retrieved"
    
    # 2. Paged retrieval
    paged_messages = chat_service.get_messages(session_id, limit=2)
    if isinstance(paged_messages, dict) and "items" in paged_messages:
        paged_messages = paged_messages["items"]
    
    assert len(paged_messages) <= 2, "Pagination not working"
    
    # 3. With pagination metadata
    paginated_response = chat_service.get_messages(
        session_id, 
        include_total=True
    )
    
    assert isinstance(paginated_response, dict), "Expected dict response with pagination"
    assert "items" in paginated_response, "Missing items in paginated response"
    assert "pagination" in paginated_response, "Missing pagination metadata"
    assert "total" in paginated_response["pagination"], "Missing total count"

if __name__ == "__main__":
    # Run the test manually
    import asyncio
    
    print("\n==== Running Message Persistence Tests ====\n")
    
    # Test direct message saving
    print("Testing direct message saving...")
    asyncio.run(test_message_save_direct())
    
    # Test chat_service saving
    print("\nTesting chat_service message saving...")
    asyncio.run(test_chat_service_save_message())
    
    # Create mock objects for Socket.IO tests
    mock_socket = type('MockSocketIO', (), {
        'emit': lambda *args, **kwargs: None,
        'connected': True,
        'namespace': {'name': '/agents'}
    })
    mock_socket.emissions = []
    mock_socket.emit = lambda event, data, **kwargs: mock_socket.emissions.append({
        'event': event, 'data': data, **kwargs
    })
    
    mock_session = 'test-sid-123'
    
    # Test store_message handler
    print("\nTesting store_message handler...")
    asyncio.run(test_store_message_handler(mock_socket, mock_session))
    
    # Test handle_text_message handler
    print("\nTesting handle_text_message handler...")
    asyncio.run(test_handle_text_message(mock_socket, mock_session))
    
    # Test message retrieval
    print("\nTesting message retrieval...")
    asyncio.run(test_retrieve_messages_api())
    
    print("\n==== Tests Completed ====\n")