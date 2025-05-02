"""
Tests for the WebSocket routes implementation in ws.py.
"""

import json
import pytest
import asyncio
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi import WebSocketDisconnect
from fastapi.websockets import WebSocketState

from routes.ws import (
    websocket_endpoint,
    start_agent_session,
    agent_to_client_messaging,
    client_to_agent_messaging
)
from models.messages import MessageType
from models.error_responses import ErrorCodes, ErrorCategory
from services.state import shared_state
from services.error_service import error_service


# Helper function to setup mock ADK components
async def setup_mock_adk(monkeypatch, mock_agent, mock_messages=None):
    """Setup mock ADK components for testing."""
    # Default messages if none provided
    if mock_messages is None:
        mock_messages = [
            {"partial": True, "turn_complete": False, "content": {"text": "Hello, "}},
            {"partial": True, "turn_complete": False, "content": {"text": "world!"}},
            {"partial": False, "turn_complete": True, "content": {"text": ""}}
        ]
        
    # Create mock live events and request queue
    live_events = MockLiveEvents(messages=mock_messages)
    live_request_queue = MockLiveRequestQueue()
    
    # Mock start_agent_session to return our mock objects
    async def mock_start_session(session_id, agent_id):
        return live_events, live_request_queue
        
    monkeypatch.setattr("routes.ws.start_agent_session", mock_start_session)
    
    # Return the mock objects for test assertions
    return live_events, live_request_queue


@pytest.mark.asyncio
async def test_start_agent_session(setup_chat_service, mock_agent):
    """Test starting an agent session."""
    # Mock required components
    chat_service = setup_chat_service
    session_id = "test-session-1234"
    agent_id = mock_agent.id
    
    # Create a real session in the chat service
    adk_session = chat_service.get_or_create_adk_session(session_id, session_id)
    
    # Setup complete, now run the actual test
    try:
        with patch('routes.ws.Runner', autospec=True) as mock_runner:
            # Mock the run_live method to return mock live events and queue
            mock_runner_instance = mock_runner.return_value
            live_events = MockLiveEvents()
            live_request_queue = MockLiveRequestQueue()
            mock_runner_instance.run_live.return_value = live_events
            
            # Call the function under test
            result_events, result_queue = await start_agent_session(session_id, agent_id)
            
            # Assertions
            assert result_events == live_events
            assert isinstance(result_queue, MockLiveRequestQueue)
            mock_runner.assert_called_once()
            mock_runner_instance.run_live.assert_called_once()
    except Exception as e:
        pytest.fail(f"start_agent_session raised an exception: {e}")


@pytest.mark.asyncio
async def test_agent_to_client_messaging_success(setup_chat_service, mock_websocket, mock_agent, monkeypatch):
    """Test successful agent-to-client messaging."""
    # Setup
    session_id = "test-session-1234"
    agent_id = mock_agent.id
    chat_service = setup_chat_service
    
    # Mock save_message since we don't want to depend on the database
    monkeypatch.setattr("routes.ws.chat_service.save_message", 
                    lambda **kwargs: {"message_uuid": str(uuid.uuid4())})

    # Mock share_context to avoid dependency
    monkeypatch.setattr("routes.ws.context_service.share_context", 
                    lambda **kwargs: None)
    
    # Create mock live events with simple message sequence
    mock_messages = [
        {
            "partial": True, 
            "turn_complete": False,
            "interrupted": False,
            "content": {
                "role": "assistant",
                "parts": [{"text": "Hello, "}]
            }
        },
        {
            "partial": True, 
            "turn_complete": False,
            "interrupted": False,
            "content": {
                "role": "assistant",
                "parts": [{"text": "world!"}]
            }
        },
        {
            "partial": False, 
            "turn_complete": True,
            "interrupted": False,
            "content": {
                "role": "assistant",
                "parts": [{"text": ""}]
            }
        }
    ]
    
    live_events = MockLiveEvents(messages=mock_messages)
    
    # Run the function under test
    try:
        result = await agent_to_client_messaging(mock_websocket, live_events, session_id, agent_id)
        # Should return None for normal completion
        assert result is None
        
        # Check that the WebSocket received the correct messages
        assert len(mock_websocket.sent_messages) == 3  # 2 text chunks + 1 turn_complete
        
        # Parse the messages
        parsed_messages = [json.loads(msg) for msg in mock_websocket.sent_messages]
        
        # First two should be text chunks
        assert "message" in parsed_messages[0]
        assert parsed_messages[0]["message"] == "Hello, "
        
        assert "message" in parsed_messages[1]
        assert parsed_messages[1]["message"] == "world!"
        
        # Last should be turn_complete
        assert "turn_complete" in parsed_messages[2]
        assert parsed_messages[2]["turn_complete"] is True
        
    except Exception as e:
        pytest.fail(f"agent_to_client_messaging raised an exception: {e}")


@pytest.mark.asyncio
async def test_agent_to_client_messaging_error_handling(setup_chat_service, mock_websocket, mock_agent, monkeypatch):
    """Test error handling in agent-to-client messaging."""
    # Setup
    session_id = "test-session-1234"
    agent_id = mock_agent.id
    chat_service = setup_chat_service
    
    # Mock live events that will generate an error
    mock_messages = [
        {
            "partial": True, 
            "turn_complete": False,
            "error": "Test error message",
            "content": None  # This will cause an error in the code
        }
    ]
    
    live_events = MockLiveEvents(messages=mock_messages)
    
    # Run the function under test
    try:
        # This should raise a WebSocketErrorResponse
        with pytest.raises(Exception) as exc_info:
            await agent_to_client_messaging(mock_websocket, live_events, session_id, agent_id)
        
        # Check the error type and properties
        error = exc_info.value
        assert hasattr(error, 'error_code')
        assert error.error_code == ErrorCodes.ADK_RUNNER_ERROR
        assert error.category == ErrorCategory.ADK
        
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")


@pytest.mark.asyncio
async def test_client_to_agent_messaging(setup_chat_service, mock_websocket, mock_agent, monkeypatch):
    """Test client-to-agent messaging."""
    # Setup
    session_id = "test-session-1234"
    agent_id = mock_agent.id
    chat_service = setup_chat_service
    
    # Create a mock LiveRequestQueue to capture sent messages
    live_request_queue = MockLiveRequestQueue()
    
    # Mock receive_json to return a test message
    mock_websocket.receive_json = AsyncMock(return_value={
        "type": "text",
        "text": "Hello from the client!"
    })
    
    # Mock save_message to avoid DB dependency
    monkeypatch.setattr("routes.ws.chat_service.save_message", 
                     lambda **kwargs: {"message_uuid": str(uuid.uuid4())})
    
    # Mock format_context_for_content to return some context
    monkeypatch.setattr("routes.ws.context_service.format_context_for_content", 
                     lambda **kwargs: "Context from other agent: Some context.")
    
    # Use a flag to control when to raise WebSocketDisconnect
    call_count = 0
    
    async def mock_receive_json():
        nonlocal call_count
        call_count += 1
        
        if call_count == 1:
            return {"type": "text", "text": "Hello from the client!"}
        else:
            # On second call, simulate disconnect
            raise WebSocketDisconnect(code=1000)
    
    mock_websocket.receive_json = mock_receive_json
    
    # Run the function under test
    result = await client_to_agent_messaging(mock_websocket, live_request_queue, session_id, agent_id)
    
    # Should return DISCONNECT when client disconnects
    assert result == "DISCONNECT"
    
    # Check that the message was sent to the LiveRequestQueue
    assert len(live_request_queue.messages) == 1
    
    # Check the content of the sent message
    content = live_request_queue.messages[0]
    combined_text = content.parts[0].text if hasattr(content, 'parts') and content.parts else None
    
    assert combined_text is not None
    assert "Hello from the client!" in combined_text
    assert "Context from other agent" in combined_text


@pytest.mark.asyncio
async def test_websocket_endpoint_normal_flow(setup_chat_service, mock_websocket, mock_agent, monkeypatch):
    """Test the main WebSocket endpoint under normal conditions."""
    # Setup
    session_id = "test-session-1234"
    agent_id = mock_agent.id
    chat_service = setup_chat_service
    
    # Mock the shared_state
    monkeypatch.setattr("routes.ws.shared_state.add_websocket", lambda ws: None)
    monkeypatch.setattr("routes.ws.shared_state.remove_websocket", lambda ws: None)
    
    # Mock the chat_service.get_session and create_session
    monkeypatch.setattr("routes.ws.chat_service.get_session", lambda sid: {"id": sid, "title": "Test Session"})
    
    # Setup mock ADK components
    live_events, live_request_queue = await setup_mock_adk(monkeypatch, mock_agent)
    
    # Mock asyncio.create_task to track tasks
    tasks = []
    
    def mock_create_task(coro):
        task = MagicMock()
        tasks.append(task)
        
        # Make the task behave like client_to_agent_messaging returning DISCONNECT
        async def mock_await():
            # Simulate a WebSocketDisconnect on second task
            if len(tasks) > 1:
                return "DISCONNECT"
            return None
            
        task.__await__ = lambda: mock_await().__await__()
        return task
    
    monkeypatch.setattr("asyncio.create_task", mock_create_task)
    
    # Mock asyncio.wait to return our mocked tasks
    async def mock_wait(aws, **kwargs):
        done = {tasks[1]}  # Return the second task as done
        pending = {tasks[0]}
        return done, pending
        
    monkeypatch.setattr("asyncio.wait", mock_wait)
    
    # Run the function under test
    try:
        await websocket_endpoint(mock_websocket, session_id, agent_id)
        
        # Check that the WebSocket was accepted
        assert mock_websocket.accepted is True
        
        # No WebSocket error should have been sent
        assert not any("error" in msg for msg in mock_websocket.sent_messages if isinstance(msg, str))
        
    except Exception as e:
        pytest.fail(f"websocket_endpoint raised an exception: {e}")


@pytest.mark.asyncio
async def test_websocket_endpoint_error_handling(setup_chat_service, mock_websocket, mock_agent, monkeypatch):
    """Test the WebSocket endpoint handles errors properly."""
    # Setup
    session_id = "test-session-1234"
    agent_id = "nonexistent-agent"  # Cause an error by using an invalid agent ID
    chat_service = setup_chat_service
    
    # Mock the shared_state
    monkeypatch.setattr("routes.ws.shared_state.add_websocket", lambda ws: None)
    monkeypatch.setattr("routes.ws.shared_state.remove_websocket", lambda ws: None)
    
    # Mock the chat_service.get_session
    monkeypatch.setattr("routes.ws.chat_service.get_session", lambda sid: {"id": sid, "title": "Test Session"})
    
    # Mock error_service.send_websocket_error to capture errors
    sent_errors = []
    
    async def mock_send_error(websocket, error, close_connection=False):
        sent_errors.append((error, close_connection))
        
    monkeypatch.setattr("routes.ws.error_service.send_websocket_error", mock_send_error)
    
    # Run the function under test
    await websocket_endpoint(mock_websocket, session_id, agent_id)
    
    # Check that an error was sent
    assert len(sent_errors) > 0
    
    # The error should be related to agent not found
    error, _ = sent_errors[0]
    assert hasattr(error, 'error_code')
    assert error.error_code == ErrorCodes.ADK_AGENT_NOT_FOUND