#!/usr/bin/env python3
"""
Test script for Socket.IO connection.
This tests the fixes to the Socket.IO connection logic.
"""

import sys
import os
import logging
import asyncio
import socket
import socketio
from pathlib import Path

# Add the parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Socket.IO client
sio = socketio.AsyncClient(logger=True, engineio_logger=True)

# Connection URL
URL = "http://localhost:8000"
SESSION_ID = "test_session"
AGENT_ID = "chloe"  # Use a known agent ID

# Register event handlers
@sio.event
async def connect():
    logger.info("Connected to server!")

@sio.event
async def connect_error(data):
    logger.error(f"Connection error: {data}")

@sio.event
async def disconnect():
    logger.info("Disconnected from server")

@sio.event
async def message(data):
    logger.info(f"Received message: {data}")

# Test Socket.IO connection
async def test_connection():
    """Test Socket.IO connection."""
    try:
        logger.info(f"Connecting to {URL} with session_id={SESSION_ID}, agent_id={AGENT_ID}...")
        
        # Connect with session and agent info in query params
        await sio.connect(
            f"{URL}?session_id={SESSION_ID}&agent_id={AGENT_ID}",
            headers={"X-Client-ID": "test_client"},
            transports=["websocket", "polling"]
        )
        
        # Wait for connection
        await asyncio.sleep(1)
        
        if sio.connected:
            logger.info("Successfully connected to server")
            
            # Try to join the session room
            logger.info("Joining session room...")
            await sio.emit("join", {
                "type": "session",
                "id": SESSION_ID
            })
            await asyncio.sleep(1)
            
            # Try to send a message
            logger.info("Sending test message...")
            message_data = {
                "id": "test_message_1",
                "type": "text",
                "session_id": SESSION_ID,
                "from_user": "test_user",
                "to_agent": AGENT_ID,
                "content": "This is a test message",
                "timestamp": "2023-11-08T12:00:00Z"
            }
            
            await sio.emit("message", message_data)
            await asyncio.sleep(2)
            
            # Check if server responds with acknowledgment
            logger.info("Sending ping...")
            response = await sio.call("ping", {"timestamp": "2023-11-08T12:00:00Z"})
            logger.info(f"Ping response: {response}")
            
            # Stay connected for a bit to receive any responses
            logger.info("Waiting for responses...")
            await asyncio.sleep(5)
            
            # Disconnect
            logger.info("Test complete, disconnecting...")
            await sio.disconnect()
            return True
            
        else:
            logger.error("Failed to connect")
            return False
            
    except Exception as e:
        logger.error(f"Error during test: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    try:
        # Check if server is running at URL
        host = URL.split("//")[1].split(":")[0]
        port = int(URL.split(":")[-1])
        
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.connect((host, port))
            s.close()
            logger.info(f"Server is running at {host}:{port}")
        except Exception as e:
            logger.error(f"Server is not running at {host}:{port}: {e}")
            logger.error("Make sure the API gateway server is running before running this test")
            sys.exit(1)
        
        # Run the test
        asyncio.run(test_connection())
        
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
        sys.exit(0)