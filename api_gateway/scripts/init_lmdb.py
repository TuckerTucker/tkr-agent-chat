#!/usr/bin/env python

"""
LMDB Database Initialization Script

This script initializes the LMDB database for the API Gateway,
creating the necessary environment and testing basic operations.

Usage:
    python init_lmdb.py

Notes:
    - Initializes a new LMDB environment with all required databases
    - Creates default agents and a default chat session
    - Tests basic CRUD operations to verify the database is working
"""

import sys
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from pprint import pprint

# Add parent directory to sys.path to import db_lmdb
parent_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_dir / "src"))

import db_lmdb

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("init_lmdb")

def test_basic_operations():
    """Test basic CRUD operations to verify database is working."""
    logger.info("Testing basic database operations...")
    
    # Generate a unique session ID for testing
    test_session_id = str(uuid.uuid4())
    
    # 1. Create a session
    logger.info("1. Creating test session...")
    session = db_lmdb.create_session(title="Test Session", session_id=test_session_id)
    logger.info(f"Created session: {session['id']}")
    
    # 2. Verify session exists
    logger.info("2. Verifying session exists...")
    retrieved_session = db_lmdb.get_session(test_session_id)
    if retrieved_session and retrieved_session['id'] == test_session_id:
        logger.info("Session retrieval successful")
    else:
        logger.error("Failed to retrieve session")
        return False
    
    # 3. Create a message
    logger.info("3. Creating test message...")
    message_data = {
        "session_id": test_session_id,
        "type": "text",
        "role": "user",
        "parts": [{"text": "Hello, this is a test message"}],
        "message_metadata": {"test": True}
    }
    message = db_lmdb.create_message(message_data)
    logger.info(f"Created message: {message['message_uuid']}")
    
    # 4. Retrieve message
    logger.info("4. Verifying message exists...")
    retrieved_message = db_lmdb.get_message(message['message_uuid'])
    if retrieved_message and retrieved_message['message_uuid'] == message['message_uuid']:
        logger.info("Message retrieval successful")
    else:
        logger.error("Failed to retrieve message")
        return False
    
    # 5. Get session messages
    logger.info("5. Testing session messages retrieval...")
    session_messages = db_lmdb.get_session_messages(test_session_id)
    if len(session_messages) > 0:
        logger.info(f"Retrieved {len(session_messages)} messages for session")
    else:
        logger.error("Failed to retrieve session messages")
        return False
    
    # 6. Create shared context
    logger.info("6. Creating test context...")
    context_data = {
        "session_id": test_session_id,
        "source_agent_id": "phil_connors",
        "target_agent_id": "chloe",
        "context_type": "summary",
        "content": {"text": "This is a test context"},
        "context_metadata": {"test": True}
    }
    context = db_lmdb.create_shared_context(context_data)
    logger.info(f"Created context: {context['id']}")
    
    # 7. Retrieve context
    logger.info("7. Verifying context exists...")
    retrieved_context = db_lmdb.get_shared_context(context['id'])
    if retrieved_context and retrieved_context['id'] == context['id']:
        logger.info("Context retrieval successful")
    else:
        logger.error("Failed to retrieve context")
        return False
    
    # 8. Get session contexts
    logger.info("8. Testing session contexts retrieval...")
    session_contexts = db_lmdb.get_session_contexts(test_session_id)
    if len(session_contexts) > 0:
        logger.info(f"Retrieved {len(session_contexts)} contexts for session")
    else:
        logger.error("Failed to retrieve session contexts")
        return False
    
    # 9. Delete session (cleanup)
    logger.info("9. Cleaning up test session...")
    result = db_lmdb.delete_session(test_session_id)
    if result:
        logger.info("Session deleted successfully")
    else:
        logger.error("Failed to delete session")
        return False
    
    logger.info("All basic operations completed successfully!")
    return True

def main():
    """Initialize the LMDB database and test basic operations."""
    logger.info("Initializing LMDB database...")
    
    try:
        # Initialize database with a timeout
        import signal
        
        def timeout_handler(signum, frame):
            logger.warning("Database initialization is taking longer than expected, but continuing...")
        
        # Set a 30-second timeout
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(30)
        
        # Initialize database
        db_lmdb.init_database()
        
        # Cancel the timeout
        signal.alarm(0)
        
        # List agents to verify initialization
        agents = db_lmdb.list_agent_cards()
        logger.info(f"Initialized with {len(agents)} agents:")
        for agent in agents:
            logger.info(f"  - {agent['name']} ({agent['id']})")
        
        # Test basic operations
        if test_basic_operations():
            logger.info("Database initialization and testing completed successfully!")
        else:
            logger.error("Database testing failed!")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Database initialization failed: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()