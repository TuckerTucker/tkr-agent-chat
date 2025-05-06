"""
Test script to verify message schema validation fix.

This script tests the message retrieval through the API endpoint to ensure
that the message schema validation is working correctly.

Usage:
    python test_message_schema.py
"""

import requests
import json
import uuid
import time
import sys
import os
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# API Base URL
API_BASE_URL = "http://localhost:8000"

def create_test_session():
    """Create a test session for message validation."""
    url = f"{API_BASE_URL}/api/v1/sessions"
    try:
        response = requests.post(url, json={"title": f"Test Session {datetime.now().isoformat()}"})
        response.raise_for_status()
        session_data = response.json()
        logger.info(f"Created test session: {session_data['id']}")
        return session_data['id']
    except Exception as e:
        logger.error(f"Failed to create test session: {e}")
        sys.exit(1)

def send_test_message(session_id, agent_id=None):
    """Send a test message directly to the database."""
    # Use Socket.IO to send a message since it will be saved to the database
    import socketio
    
    # Create Socket.IO client
    sio = socketio.Client()
    
    # Connect to the server
    try:
        sio.connect(f"{API_BASE_URL}?session_id={session_id}", namespaces=['/'])
        logger.info("Connected to Socket.IO server")
    except Exception as e:
        logger.error(f"Failed to connect to Socket.IO server: {e}")
        return None
    
    # Generate a unique message ID
    message_uuid = str(uuid.uuid4())
    
    # Create a message to send
    message = {
        "id": message_uuid,
        "type": "text",
        "session_id": session_id,
        "content": f"Test message {datetime.now().isoformat()}",
        "from_user": agent_id is None,
        "from_agent": agent_id,
        "timestamp": datetime.now().isoformat()
    }
    
    # Send the message
    try:
        sio.emit('message', json.dumps(message))
        logger.info(f"Sent test message: {message_uuid}")
        
        # Wait for message to be saved
        time.sleep(1)
        
        # Disconnect
        sio.disconnect()
        return message_uuid
    except Exception as e:
        logger.error(f"Failed to send test message: {e}")
        sio.disconnect()
        return None

def fetch_messages(session_id, include_pagination=True):
    """Fetch messages from the API with pagination."""
    url = f"{API_BASE_URL}/api/v1/sessions/{session_id}/messages"
    params = {
        "include_pagination": include_pagination,
        "limit": 10
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        messages = response.json()
        logger.info(f"Retrieved {len(messages['items'] if include_pagination else messages)} messages")
        return messages
    except Exception as e:
        logger.error(f"Failed to fetch messages: {e}")
        return None

def validate_message_schema(message):
    """Validate that a message has all required fields."""
    required_fields = [
        "id", "message_uuid", "session_id", "type", "role", 
        "agent_id", "parts", "message_metadata", "created_at", 
        "updated_at", "in_reply_to", "context_refs", "capabilities_used"
    ]
    
    missing_fields = []
    for field in required_fields:
        if field not in message:
            missing_fields.append(field)
    
    if missing_fields:
        logger.error(f"Message is missing required fields: {missing_fields}")
        return False
    
    logger.info("Message has all required fields")
    return True

def main():
    """Main test function."""
    try:
        # Step 1: Create a test session
        session_id = create_test_session()
        
        # Step 2: Send a test message from a user
        user_message_uuid = send_test_message(session_id)
        
        # Step 3: Send a test message from an agent
        agent_message_uuid = send_test_message(session_id, agent_id="chloe")
        
        # Step 4: Wait for messages to be saved
        logger.info("Waiting for messages to be saved...")
        time.sleep(2)
        
        # Step 5: Fetch messages through the API
        messages = fetch_messages(session_id)
        
        # Step 6: Validate message schema
        if messages and 'items' in messages:
            for message in messages['items']:
                logger.info(f"Validating message: {message.get('message_uuid', 'unknown')}")
                is_valid = validate_message_schema(message)
                if not is_valid:
                    logger.error("Message schema validation failed")
                    sys.exit(1)
            
            logger.info("Message schema validation successful!")
            return True
        else:
            logger.error("No messages retrieved")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Test failed with exception: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()