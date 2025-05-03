"""
Fixtures for Socket.IO testing in TKR Multi-Agent Chat.

This module provides test fixtures for Socket.IO connection, message,
and integration testing.
"""

import pytest
import asyncio
import socketio
import time
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timedelta

from ...db import get_connection
from ...models.messages import MessageType
from ...services.socket_service import sio, initialize, get_socketio_app, active_connections
from ...services.socket_error_handler import socket_error_handler
from ...services.socket_connection_manager import get_connection_manager


@pytest.fixture
def setup_test_database():
    """Set up test database with required agent and session records."""
    # Create a unique connection for this test
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Delete existing test data to start fresh
        cursor.execute("DELETE FROM messages WHERE session_id LIKE 'test-%'")
        cursor.execute("DELETE FROM shared_contexts WHERE session_id LIKE 'test-%'")
        cursor.execute("DELETE FROM chat_sessions WHERE id LIKE 'test-%'")
        cursor.execute("DELETE FROM agent_cards WHERE id LIKE 'test-%'")
        
        # Create test agents
        cursor.execute(
            "INSERT OR IGNORE INTO agent_cards (id, name, description, color, icon_path, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            ("test-agent-1", "Test Agent 1", "A test agent", "#FF5733", "agent_icon.svg", 1)
        )
        cursor.execute(
            "INSERT OR IGNORE INTO agent_cards (id, name, description, color, icon_path, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            ("test-agent-2", "Test Agent 2", "Another test agent", "#33FF57", "agent2_icon.svg", 1)
        )
        
        # Create test session
        cursor.execute(
            "INSERT OR IGNORE INTO chat_sessions (id, title, created_at, session_type) VALUES (?, ?, ?, ?)",
            ("test-session-123", "Test Socket Session", datetime.utcnow().isoformat(), "test")
        )
        
        # Commit the changes
        conn.commit()
    
    yield
    
    # Clean up
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM messages WHERE session_id LIKE 'test-%'")
        cursor.execute("DELETE FROM shared_contexts WHERE session_id LIKE 'test-%'")
        conn.commit()


@pytest.fixture
def mock_socketio_server():
    """Provide a mocked Socket.IO server for testing."""
    mock_sio = MagicMock(spec=socketio.AsyncServer)
    mock_sio.emit = AsyncMock()
    mock_sio.disconnect = AsyncMock()
    mock_sio.enter_room = AsyncMock()
    mock_sio.leave_room = AsyncMock()
    
    return mock_sio


@pytest.fixture
async def test_socket_clients():
    """Create Socket.IO test clients."""
    clients = []
    
    # Mock the actual connection to the server
    with patch('socketio.AsyncClient.connect', new_callable=AsyncMock) as mock_connect:
        mock_connect.return_value = None
        
        # Create test clients
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        
        # Add event handlers and collect messages
        client1.received_messages = []
        client2.received_messages = []
        
        @client1.event
        async def message(data):
            client1.received_messages.append(data)
            
        @client2.event
        async def message(data):
            client2.received_messages.append(data)
        
        # Simulate connections
        await client1.connect(
            "http://localhost:8000",
            auth={"token": "test-token"},
            query={"agent_id": "test-agent-1", "session_id": "test-session-123"}
        )
        
        await client2.connect(
            "http://localhost:8000",
            auth={"token": "test-token"},
            query={"agent_id": "test-agent-2", "session_id": "test-session-123"}
        )
        
        # Add to list
        clients.append(client1)
        clients.append(client2)
        
        # Provide clients to test
        yield clients
        
        # Clean up
        for client in clients:
            if client.connected:
                await client.disconnect()


@pytest.fixture
def mock_socket_environment():
    """Set up a mocked Socket.IO environment."""
    # Clear any active connections from previous tests
    active_connections.clear()
    
    # Mock environment data
    mock_environ = {
        'QUERY_STRING': 'agent_id=test-agent-1&session_id=test-session-123',
        'HTTP_USER_AGENT': 'Test Browser',
        'REMOTE_ADDR': '127.0.0.1',
        'HTTP_AUTHORIZATION': 'Bearer test-token'
    }
    
    # Mock sid
    mock_sid = "test-sid-123"
    
    # Add to active connections
    active_connections[mock_sid] = {
        'sid': mock_sid,
        'agent_id': 'test-agent-1',
        'session_id': 'test-session-123',
        'client_type': 'agent',
        'client_ip': '127.0.0.1',
        'user_agent': 'Test Browser',
        'auth_token': 'test-token',
        'connected_at': datetime.utcnow().isoformat(),
        'last_activity': datetime.utcnow().isoformat(),
        'is_connected': True
    }
    
    return {"environ": mock_environ, "sid": mock_sid}


@pytest.fixture
def mock_message_data():
    """Create test message data."""
    return {
        "id": "test-msg-123",
        "type": "text",
        "sessionId": "test-session-123",
        "fromAgent": "test-agent-1",
        "toAgent": "test-agent-2",
        "content": "Test message from agent 1 to agent 2",
        "timestamp": datetime.utcnow().isoformat()
    }


@pytest.fixture
def patch_store_message():
    """Patch the store_message function for testing."""
    with patch('api_gateway.src.services.socket_message_handler.store_message', new_callable=AsyncMock) as mock_store:
        mock_store.return_value = (True, None, "stored-msg-uuid-123")
        yield mock_store


@pytest.fixture
def mock_connection_manager(mock_socketio_server):
    """Provide a mock connection manager."""
    # Reset the singleton
    from ...services.socket_connection_manager import _connection_manager
    if _connection_manager is not None:
        # Reset the singleton for testing
        from ...services.socket_connection_manager import _connection_manager
        import importlib
        importlib.reload(_connection_manager)
    
    # Create a fresh connection manager with the mock server
    manager = get_connection_manager(mock_socketio_server)
    return manager


@pytest.fixture
def mock_jwt_decode():
    """Mock JWT decode for testing."""
    with patch('jwt.decode') as mock_decode:
        mock_decode.return_value = {
            "agent_id": "test-agent-1",
            "session_id": "test-session-123",
            "exp": int(time.time()) + 3600
        }
        yield mock_decode

# Initialize socket error handler for tests
socket_error_handler.initialize(sio)