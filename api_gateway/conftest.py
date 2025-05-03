"""
Global pytest configuration and fixtures for API Gateway tests.
"""

import os
import sys
import pytest
import asyncio
from typing import List, Dict, Any
from fastapi import FastAPI
from fastapi.testclient import TestClient
from contextlib import asynccontextmanager

# Add the src directory to the path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "src")))

# Import required modules
from src.main import app as fastapi_app
from src.services.chat_service import chat_service
from src.services.state import shared_state
from src.services.error_service import error_service
from src.models.chat_sessions import ChatSession
from src.models.messages import MessageType

# Mock ADK session fixtures
class MockSession:
    """Mocks an ADK session."""
    def __init__(self, session_id: str, app_name: str, user_id: str):
        self.session_id = session_id
        self.app_name = app_name
        self.user_id = user_id
        self.metadata = {}
        self.last_activity = None

class MockSessionService:
    """Mocks the ADK InMemorySessionService."""
    def __init__(self):
        self.sessions = {}
        
    def create_session(self, app_name: str, user_id: str, session_id: str):
        """Creates a mock ADK session."""
        session = MockSession(session_id=session_id, app_name=app_name, user_id=user_id)
        self.sessions[session_id] = session
        return session
        
    def delete_session(self, app_name: str, user_id: str, session_id: str):
        """Deletes a mock ADK session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            
    def list_sessions(self):
        """Lists all mock ADK sessions."""
        return list(self.sessions.values())

class MockLiveEvents:
    """Mocks ADK streaming events."""
    def __init__(self, messages: List[Dict[str, Any]] = None):
        self.messages = messages or []
        self.index = 0
        
    def __aiter__(self):
        return self
        
    async def __anext__(self):
        if self.index >= len(self.messages):
            raise StopAsyncIteration
            
        message = self.messages[self.index]
        self.index += 1
        
        # Create mock event object
        class MockEvent:
            def __init__(self, **kwargs):
                for key, value in kwargs.items():
                    setattr(self, key, value)
                # Mock content properties
                if 'content' in kwargs and kwargs['content']:
                    self.content = MockContent(**kwargs['content'])
                else:
                    self.content = None
        
        # Mock content class for events
        class MockContent:
            def __init__(self, text=None, parts=None, role=None):
                self.role = role or "model"
                if parts:
                    self.parts = [MockPart(**p) for p in parts]
                elif text:
                    self.parts = [MockPart(text=text)]
                else:
                    self.parts = []
        
        # Mock part class for content
        class MockPart:
            def __init__(self, text=None, **kwargs):
                self.text = text
                for key, value in kwargs.items():
                    setattr(self, key, value)
        
        return MockEvent(**message)

class MockLiveRequestQueue:
    """Mocks ADK LiveRequestQueue."""
    def __init__(self):
        self.messages = []
        
    def send_content(self, content):
        """Records sent content."""
        self.messages.append(content)
        

# Test client fixture
@pytest.fixture
def client():
    """Create a FastAPI TestClient."""
    return TestClient(fastapi_app)

# Mock ADK Session Service
@pytest.fixture
def mock_adk_session_service():
    """Provide a mock ADK session service."""
    return MockSessionService()

# Mock WebSocket connection
@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket connection."""
    class MockWebSocket:
        def __init__(self):
            self.sent_messages = []
            self.accepted = False
            self.closed = False
            self.close_code = None
            
        async def accept(self):
            self.accepted = True
            
        async def close(self, code=1000):
            self.closed = True
            self.close_code = code
            
        async def send_text(self, data):
            self.sent_messages.append(data)
            
        async def send_json(self, data):
            self.sent_messages.append(data)
            
        async def receive_text(self):
            # Mock implementation to return predefined messages if needed
            return "{}"
            
        async def receive_json(self):
            # Mock implementation to return predefined messages if needed
            return {}
    
    return MockWebSocket()

# Mock test database
@pytest.fixture
def mock_db(monkeypatch):
    """Set up a mock in-memory database for testing."""
    # This would be a simple in-memory mock of your database operations
    db = {
        'sessions': {},
        'messages': [],
        'contexts': []
    }
    
    # Mock database functions as needed
    def mock_create_session(title=None, session_id=None):
        session_id = session_id or str(uuid.uuid4())
        session = {
            'id': session_id,
            'title': title or f"Test Session {session_id[:8]}",
            'created_at': datetime.utcnow().isoformat()
        }
        db['sessions'][session_id] = session
        return session
        
    def mock_get_session(session_id):
        return db['sessions'].get(session_id)
        
    def mock_list_sessions(skip=0, limit=100):
        sessions = list(db['sessions'].values())
        return sessions[skip:skip+limit]
        
    def mock_create_message(message_data):
        db['messages'].append(message_data)
        return message_data
        
    def mock_get_session_messages(session_id, **kwargs):
        return [m for m in db['messages'] if m['session_id'] == session_id]
        
    # Apply monkeypatches
    import src.db as db_module
    monkeypatch.setattr(db_module, 'create_session', mock_create_session)
    monkeypatch.setattr(db_module, 'get_session', mock_get_session)
    monkeypatch.setattr(db_module, 'list_sessions', mock_list_sessions)
    monkeypatch.setattr(db_module, 'create_message', mock_create_message)
    monkeypatch.setattr(db_module, 'get_session_messages', mock_get_session_messages)
    
    return db

# Test session fixture
@pytest.fixture
def test_session():
    """Create a test session."""
    return {
        'id': 'test-session-1234',
        'title': 'Test Session',
        'created_at': '2025-05-01T12:00:00'
    }

# Mock agent fixture
@pytest.fixture
def mock_agent():
    """Create a mock agent for testing."""
    class MockAgent:
        def __init__(self, agent_id='test-agent'):
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
    
    return MockAgent()

@pytest.fixture
def setup_chat_service(mock_adk_session_service, mock_agent):
    """Set up the chat service with mock agents."""
    # Setup chat service with mock ADK session service
    chat_service.adk_session_service = mock_adk_session_service
    
    # Add mock agent
    chat_service.set_agents({
        mock_agent.id: mock_agent
    })
    
    # Return chat service
    return chat_service

# Cleanup fixture
@pytest.fixture(autouse=True)
def cleanup():
    """Clean up after each test."""
    yield
    # Reset services
    shared_state.clear_websockets()
    chat_service.clear_all_sessions()
    chat_service.agent_instances = {}

# For testing async code - Use the pytest_asyncio built-in event_loop fixture
# Removing custom event_loop fixture to avoid the DeprecationWarning
# The loop scope is now controlled by asyncio_default_fixture_loop_scope in pytest.ini