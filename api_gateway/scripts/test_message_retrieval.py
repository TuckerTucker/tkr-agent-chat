#!/usr/bin/env python3
"""
Test script for message retrieval functionality.
This tests the fixes to the message retrieval functions.
"""

import sys
import os
import logging
import uuid
from datetime import datetime, UTC
from pathlib import Path

# Add the parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import database functions
try:
    from src.db_factory import (
        init_database,
        create_session,
        create_message,
        get_message,
        get_message_by_uuid
    )
    logger.info("Successfully imported database modules")
except ImportError as e:
    logger.error(f"Error importing database modules: {e}")
    sys.exit(1)

def test_message_retrieval():
    """Test message saving and retrieval with the improved functions."""
    logger.info("Starting message retrieval test")
    
    try:
        # Initialize the database if needed
        logger.info("Initializing database")
        init_database()
        
        # Create a test session
        session_id = str(uuid.uuid4())
        logger.info(f"Creating test session with ID: {session_id}")
        session = create_session(title="Test Session", session_id=session_id)
        logger.info(f"Created session: {session}")
        
        # Create a test message
        message_uuid = str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        
        message_data = {
            'session_id': session_id,
            'message_uuid': message_uuid,
            'type': 'user',
            'content': 'This is a test message',
            'created_at': now,
            'parts': [{'type': 'text', 'content': 'This is a test message'}]
        }
        
        logger.info(f"Creating test message with UUID: {message_uuid}")
        saved_message = create_message(message_data)
        logger.info(f"Created message: {saved_message}")
        
        # Test retrieving the message with get_message
        logger.info(f"Testing message retrieval with get_message({message_uuid})")
        retrieved_message = get_message(message_uuid)
        
        if retrieved_message:
            logger.info(f"Successfully retrieved message with get_message: {retrieved_message.get('message_uuid')}")
        else:
            logger.error(f"Failed to retrieve message with get_message!")
            
        # Test retrieving the message with get_message_by_uuid
        logger.info(f"Testing message retrieval with get_message_by_uuid({message_uuid})")
        retrieved_message2 = get_message_by_uuid(message_uuid)
        
        if retrieved_message2:
            logger.info(f"Successfully retrieved message with get_message_by_uuid: {retrieved_message2.get('message_uuid')}")
        else:
            logger.error(f"Failed to retrieve message with get_message_by_uuid!")
            
        # Compare retrieved messages
        if retrieved_message and retrieved_message2:
            if retrieved_message.get('message_uuid') == retrieved_message2.get('message_uuid'):
                logger.info("Both retrieval methods returned the same message!")
            else:
                logger.warning("Retrieval methods returned different messages!")
        
        return retrieved_message is not None and retrieved_message2 is not None
        
    except Exception as e:
        logger.error(f"Error during message retrieval test: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    success = test_message_retrieval()
    if success:
        logger.info("Message retrieval test succeeded!")
        print("SUCCESS: Message retrieval test passed!")
        sys.exit(0)
    else:
        logger.error("Message retrieval test failed!")
        print("FAILED: Message retrieval test failed!")
        sys.exit(1)