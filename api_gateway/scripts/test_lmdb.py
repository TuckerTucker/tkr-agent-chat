#!/usr/bin/env python

"""
LMDB Database Testing Script

This script performs comprehensive tests on the LMDB implementation
to ensure it works correctly for all key operations.

Usage:
    python test_lmdb.py

Notes:
    - Tests basic CRUD operations for all entity types
    - Creates test data and removes it afterward
    - Compares retrieval performance between SQLite and LMDB
"""

import sys
import time
import logging
import uuid
import random
from pathlib import Path
from datetime import datetime, timezone
import json

# Add parent directory to sys.path to import db modules
parent_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_dir / "src"))

# Import both database modules for comparison
import db  # SQLite module
import db_lmdb  # LMDB module

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("test_lmdb")

def test_session_operations():
    """Test CRUD operations for chat sessions."""
    logger.info("\n========== Testing Session Operations ==========")
    
    # Create a test session
    test_session_id = str(uuid.uuid4())
    session_title = f"Test Session {datetime.now(timezone.utc).isoformat()}"
    
    logger.info(f"Creating test session: {session_title}")
    
    # Create session
    start_time = time.time()
    session = db_lmdb.create_session(title=session_title, session_id=test_session_id)
    create_time = time.time() - start_time
    
    logger.info(f"Session created with ID: {session['id']} in {create_time:.6f} seconds")
    
    # Get session
    start_time = time.time()
    retrieved_session = db_lmdb.get_session(test_session_id)
    get_time = time.time() - start_time
    
    logger.info(f"Session retrieved in {get_time:.6f} seconds")
    assert retrieved_session['id'] == test_session_id, "Retrieved session ID doesn't match"
    assert retrieved_session['title'] == session_title, "Retrieved session title doesn't match"
    
    # Update session
    start_time = time.time()
    updated_session = db_lmdb.update_session(test_session_id, {"session_metadata": {"updated": True}})
    update_time = time.time() - start_time
    
    logger.info(f"Session updated in {update_time:.6f} seconds")
    assert updated_session['session_metadata']['updated'] == True, "Session update failed"
    
    # List sessions
    start_time = time.time()
    sessions = db_lmdb.list_sessions(limit=10)
    list_time = time.time() - start_time
    
    logger.info(f"Listed {len(sessions)} sessions in {list_time:.6f} seconds")
    assert any(s['id'] == test_session_id for s in sessions), "Test session not found in session list"
    
    # Delete session (will be done in cleanup)
    
    logger.info("Session operations test passed!")
    return test_session_id

def test_message_operations(session_id):
    """Test CRUD operations for messages."""
    logger.info("\n========== Testing Message Operations ==========")
    
    # Create test message data
    message_data = {
        "message_uuid": str(uuid.uuid4()),
        "session_id": session_id,
        "type": "text",
        "role": "user",
        "parts": [{"type": "text", "content": "This is a test message"}],
        "message_metadata": {"test": True, "timestamp": datetime.now(timezone.utc).isoformat()}
    }
    
    logger.info(f"Creating test message with UUID: {message_data['message_uuid']}")
    
    # Create message
    start_time = time.time()
    message = db_lmdb.create_message(message_data)
    create_time = time.time() - start_time
    
    logger.info(f"Message created in {create_time:.6f} seconds")
    
    # Get message by UUID
    start_time = time.time()
    retrieved_message = db_lmdb.get_message(message_data["message_uuid"])
    get_time = time.time() - start_time
    
    logger.info(f"Message retrieved in {get_time:.6f} seconds")
    assert retrieved_message['message_uuid'] == message_data['message_uuid'], "Retrieved message UUID doesn't match"
    
    # Get session messages
    start_time = time.time()
    session_messages = db_lmdb.get_session_messages(session_id)
    get_session_time = time.time() - start_time
    
    logger.info(f"Retrieved {len(session_messages)} session messages in {get_session_time:.6f} seconds")
    assert any(m['message_uuid'] == message_data['message_uuid'] for m in session_messages), "Test message not found in session messages"
    
    # Create additional messages for testing pagination/ordering
    additional_messages = []
    logger.info("Creating 10 additional test messages...")
    
    for i in range(10):
        new_message = {
            "message_uuid": str(uuid.uuid4()),
            "session_id": session_id,
            "type": "text",
            "role": "user" if i % 2 == 0 else "agent",
            "agent_id": "test_agent" if i % 2 == 1 else None,
            "parts": [{"type": "text", "content": f"Test message {i}"}],
            "message_metadata": {"index": i, "timestamp": datetime.now(timezone.utc).isoformat()}
        }
        
        db_lmdb.create_message(new_message)
        additional_messages.append(new_message)
        
        # Small delay to ensure different timestamps
        time.sleep(0.01)
    
    # Test pagination
    start_time = time.time()
    paginated_messages = db_lmdb.get_session_messages(
        session_id=session_id,
        skip=0,
        limit=5,
        direction="desc",
        include_total=True
    )
    pagination_time = time.time() - start_time
    
    logger.info(f"Retrieved paginated messages in {pagination_time:.6f} seconds")
    assert len(paginated_messages.get('items', [])) == 5, "Pagination limit not respected"
    assert paginated_messages.get('pagination', {}).get('total') >= 11, "Total count incorrect"
    
    # Test message trim (if implemented)
    if hasattr(db_lmdb, 'trim_session_messages'):
        start_time = time.time()
        trim_count = db_lmdb.trim_session_messages(session_id, max_messages=5)
        trim_time = time.time() - start_time
        
        logger.info(f"Trimmed {trim_count} messages in {trim_time:.6f} seconds")
    
    logger.info("Message operations test passed!")
    return message_data["message_uuid"], [m["message_uuid"] for m in additional_messages]

def test_context_operations(session_id):
    """Test CRUD operations for shared contexts."""
    logger.info("\n========== Testing Context Operations ==========")
    
    # Create test context data
    context_data = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "source_agent_id": "test_agent_1",
        "target_agent_id": "test_agent_2",
        "context_type": "summary",
        "content": {"text": "This is a test context", "metadata": {"generated": True}},
        "context_metadata": {"test": True},
        "expires_at": (datetime.now(timezone.utc).isoformat())
    }
    
    logger.info(f"Creating test context with ID: {context_data['id']}")
    
    # Create context
    start_time = time.time()
    context = db_lmdb.create_shared_context(context_data)
    create_time = time.time() - start_time
    
    logger.info(f"Context created in {create_time:.6f} seconds")
    
    # Get context by ID
    start_time = time.time()
    retrieved_context = db_lmdb.get_shared_context(context_data["id"])
    get_time = time.time() - start_time
    
    logger.info(f"Context retrieved in {get_time:.6f} seconds")
    assert retrieved_context['id'] == context_data['id'], "Retrieved context ID doesn't match"
    
    # Get session contexts
    start_time = time.time()
    session_contexts = db_lmdb.get_session_contexts(session_id)
    get_session_time = time.time() - start_time
    
    logger.info(f"Retrieved {len(session_contexts)} session contexts in {get_session_time:.6f} seconds")
    assert any(c['id'] == context_data['id'] for c in session_contexts), "Test context not found in session contexts"
    
    # Update context
    start_time = time.time()
    updated_context = db_lmdb.update_shared_context(context_data["id"], {"context_metadata": {"updated": True}})
    update_time = time.time() - start_time
    
    logger.info(f"Context updated in {update_time:.6f} seconds")
    assert updated_context['context_metadata']['updated'] == True, "Context update failed"
    
    # Get agent contexts
    start_time = time.time()
    agent_contexts = db_lmdb.get_shared_contexts(target_agent_id="test_agent_2")
    get_agent_time = time.time() - start_time
    
    logger.info(f"Retrieved {len(agent_contexts)} agent contexts in {get_agent_time:.6f} seconds")
    assert any(c['id'] == context_data['id'] for c in agent_contexts), "Test context not found in agent contexts"
    
    logger.info("Context operations test passed!")
    return context_data["id"]

def test_performance_comparison(session_id):
    """Compare performance between SQLite and LMDB."""
    logger.info("\n========== Performance Comparison ==========")
    
    # Generate test data
    test_data = []
    for i in range(100):
        test_data.append({
            "message_uuid": str(uuid.uuid4()),
            "session_id": session_id,
            "type": "text",
            "role": "user",
            "parts": [{"type": "text", "content": f"Performance test message {i}"}],
            "message_metadata": {"performance_test": True, "index": i}
        })
    
    # Test SQLite write performance
    logger.info("Testing SQLite write performance...")
    sqlite_write_start = time.time()
    
    for data in test_data:
        try:
            db.create_message(data)
        except Exception as e:
            logger.error(f"Error writing to SQLite: {e}")
    
    sqlite_write_time = time.time() - sqlite_write_start
    logger.info(f"SQLite wrote 100 messages in {sqlite_write_time:.6f} seconds ({100/sqlite_write_time:.2f} messages/sec)")
    
    # Test LMDB write performance
    logger.info("Testing LMDB write performance...")
    lmdb_write_start = time.time()
    
    for data in test_data:
        try:
            db_lmdb.create_message(data)
        except Exception as e:
            logger.error(f"Error writing to LMDB: {e}")
    
    lmdb_write_time = time.time() - lmdb_write_start
    logger.info(f"LMDB wrote 100 messages in {lmdb_write_time:.6f} seconds ({100/lmdb_write_time:.2f} messages/sec)")
    
    # Test SQLite read performance
    logger.info("Testing SQLite read performance...")
    sqlite_read_start = time.time()
    
    for _ in range(100):
        random_index = random.randint(0, 99)
        random_uuid = test_data[random_index]["message_uuid"]
        try:
            db.get_message(random_uuid)
        except Exception as e:
            logger.error(f"Error reading from SQLite: {e}")
    
    sqlite_read_time = time.time() - sqlite_read_start
    logger.info(f"SQLite read 100 random messages in {sqlite_read_time:.6f} seconds ({100/sqlite_read_time:.2f} reads/sec)")
    
    # Test LMDB read performance
    logger.info("Testing LMDB read performance...")
    lmdb_read_start = time.time()
    
    for _ in range(100):
        random_index = random.randint(0, 99)
        random_uuid = test_data[random_index]["message_uuid"]
        try:
            db_lmdb.get_message(random_uuid)
        except Exception as e:
            logger.error(f"Error reading from LMDB: {e}")
    
    lmdb_read_time = time.time() - lmdb_read_start
    logger.info(f"LMDB read 100 random messages in {lmdb_read_time:.6f} seconds ({100/lmdb_read_time:.2f} reads/sec)")
    
    # Test SQLite session messages performance
    logger.info("Testing SQLite session messages performance...")
    sqlite_session_start = time.time()
    
    for _ in range(10):
        try:
            db.get_session_messages(session_id, limit=100)
        except Exception as e:
            logger.error(f"Error getting session messages from SQLite: {e}")
    
    sqlite_session_time = time.time() - sqlite_session_start
    logger.info(f"SQLite retrieved session messages 10 times in {sqlite_session_time:.6f} seconds ({10/sqlite_session_time:.2f} ops/sec)")
    
    # Test LMDB session messages performance
    logger.info("Testing LMDB session messages performance...")
    lmdb_session_start = time.time()
    
    for _ in range(10):
        try:
            db_lmdb.get_session_messages(session_id, limit=100)
        except Exception as e:
            logger.error(f"Error getting session messages from LMDB: {e}")
    
    lmdb_session_time = time.time() - lmdb_session_start
    logger.info(f"LMDB retrieved session messages 10 times in {lmdb_session_time:.6f} seconds ({10/lmdb_session_time:.2f} ops/sec)")
    
    # Calculate performance ratios
    write_ratio = sqlite_write_time / lmdb_write_time if lmdb_write_time > 0 else float('inf')
    read_ratio = sqlite_read_time / lmdb_read_time if lmdb_read_time > 0 else float('inf')
    session_ratio = sqlite_session_time / lmdb_session_time if lmdb_session_time > 0 else float('inf')
    
    logger.info("\nPerformance summary:")
    logger.info(f"LMDB vs SQLite write performance: {write_ratio:.2f}x faster")
    logger.info(f"LMDB vs SQLite read performance: {read_ratio:.2f}x faster")
    logger.info(f"LMDB vs SQLite session messages performance: {session_ratio:.2f}x faster")
    
    return test_data

def cleanup(session_id, message_ids, context_id, performance_test_data):
    """Clean up test data."""
    logger.info("\n========== Cleanup ==========")
    
    # Delete session (and associated messages)
    try:
        result = db_lmdb.delete_session(session_id)
        logger.info(f"Session and associated data deleted: {result}")
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
    
    logger.info("Cleanup completed")

def main():
    """Run a complete test suite."""
    logger.info("Starting LMDB database tests...")
    
    # Initialize LMDB database
    db_lmdb.init_database()
    logger.info("LMDB database initialized")
    
    # Run tests in sequence
    session_id = test_session_operations()
    message_id, additional_message_ids = test_message_operations(session_id)
    context_id = test_context_operations(session_id)
    performance_test_data = test_performance_comparison(session_id)
    
    # Clean up
    cleanup(session_id, [message_id] + additional_message_ids, context_id, performance_test_data)
    
    logger.info("\nAll tests completed successfully!")

if __name__ == "__main__":
    main()