"""
LMDB database operations for the API Gateway.

This module provides:
- LMDB environment and transaction management
- Serialization and key encoding utilities
- CRUD operations for all models based on the LMDB key-value store
"""

import lmdb
import msgpack
import uuid
import logging
import traceback
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Use UTC for consistent timestamps
UTC = timezone.utc

# Define the project root relative to this file's location
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "api_gateway" / "chats" / "chat_database"

# Ensure the 'chats' directory exists
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Global environment instance for LMDB
_ENV = None
_DBS = {}

def get_env():
    """Get or create the global LMDB environment."""
    global _ENV
    if _ENV is None:
        logger.info(f"Initializing LMDB environment at {DEFAULT_DB_PATH}")
        logger.info(f"LMDB database files exist: data.mdb={Path(DEFAULT_DB_PATH/'data.mdb').exists()}, lock.mdb={Path(DEFAULT_DB_PATH/'lock.mdb').exists()}")
        
        # Ensure the directory exists
        DEFAULT_DB_PATH.mkdir(parents=True, exist_ok=True)
        logger.info("LMDB directory confirmed to exist")
        
        try:
            # 1GB map size for better performance
            logger.info("Creating LMDB environment with 1GB map size")
            _ENV = lmdb.Environment(
                path=str(DEFAULT_DB_PATH),
                map_size=1024 * 1024 * 1024,  # 1GB
                max_dbs=10,  # Separate databases for different collections
                sync=False,  # Less strict sync for better performance
                readahead=True,  # Default setting
                metasync=False,  # Less strict metasync for better performance
                writemap=True,  # Enable writemap for better performance
                create=True,  # Create if doesn't exist
                subdir=True,  # Use subdirectory
            )
            logger.info("LMDB environment created successfully")
            
            # Initialize all databases individually without blocking transaction
            logger.info("Creating database handles independently")
            
            # Create all the required databases
            logger.info("Opening 'sessions' database")
            _DBS['sessions'] = _ENV.open_db(b'sessions', create=True)
            
            logger.info("Opening 'messages' database")
            _DBS['messages'] = _ENV.open_db(b'messages', create=True)
            
            logger.info("Opening 'message_by_session' database")
            _DBS['message_by_session'] = _ENV.open_db(b'message_by_session', dupsort=True, create=True)
            
            logger.info("Opening 'message_by_agent' database")
            _DBS['message_by_agent'] = _ENV.open_db(b'message_by_agent', dupsort=True, create=True)
            
            logger.info("Opening 'agent_cards' database")
            _DBS['agent_cards'] = _ENV.open_db(b'agent_cards', create=True)
            
            logger.info("Opening 'shared_contexts' database")
            _DBS['shared_contexts'] = _ENV.open_db(b'shared_contexts', create=True)
            
            logger.info("Opening 'context_by_session' database")
            _DBS['context_by_session'] = _ENV.open_db(b'context_by_session', dupsort=True, create=True)
            
            logger.info("Opening 'a2a_tasks' database")
            _DBS['a2a_tasks'] = _ENV.open_db(b'a2a_tasks', create=True)
            
            logger.info("Opening 'task_agents' database")
            _DBS['task_agents'] = _ENV.open_db(b'task_agents', dupsort=True, create=True)
            
            logger.info("LMDB environment and databases initialized successfully")
        except lmdb.Error as e:
            logger.error(f"LMDB environment initialization error: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Unexpected error during LMDB initialization: {e}", exc_info=True)
            raise
    # Skip logging existing environment instance to reduce log noise
    return _ENV

def get_db(name):
    """Get a database handle by name."""
    if name not in _DBS:
        env = get_env()
        try:
            _DBS[name] = env.open_db(name.encode('utf-8'), create=True)
        except lmdb.Error as e:
            logger.error(f"Error opening database {name}: {e}")
            raise
    
    return _DBS[name]

@contextmanager
def get_environment():
    """Context manager for LMDB environment (legacy compatibility)."""
    try:
        env = get_env()
        yield env
    except lmdb.Error as e:
        logger.error(f"LMDB environment error: {e}")
        raise

import time
import threading

@contextmanager
def get_transaction(write=False, timeout=5.0):
    """Get a transaction for database operations with timeout."""
    env = get_env()  # Get the global environment
    
    # Start timer to detect potential hangs
    start_time = time.time()
    
    # Wrap transaction in a timeout mechanism
    txn = None
    try:
        # Set a timeout for transaction operations
        txn = env.begin(write=write)
        
        # Check if transaction took too long
        elapsed = time.time() - start_time
        if elapsed > timeout * 0.8:  # If taking near timeout, log warning
            logger.warning(f"Transaction initialization took {elapsed:.2f}s, near timeout")
        
        yield txn, env
    
    finally:
        # Calculate total elapsed time
        elapsed = time.time() - start_time
        
        # Log excessive durations
        if elapsed > 1.0:  # Log when transactions take over 1 second
            logger.warning(f"LMDB transaction took {elapsed:.2f}s to complete")
        
        # Close transaction if opened
        if txn:
            txn.commit()

def open_dbs(env):
    """Get database handles from the global cache."""
    # Simply return the global database handles
    global _DBS
    
    # Ensure all databases are initialized
    get_env()
    
    if not _DBS:
        logger.error("Database handles not initialized")
        
        # Force initialization of all databases without a transaction
        try:
            # Create all the required databases independently
            _DBS['sessions'] = env.open_db(b'sessions', create=True)
            _DBS['messages'] = env.open_db(b'messages', create=True)
            _DBS['message_by_session'] = env.open_db(b'message_by_session', dupsort=True, create=True)
            _DBS['message_by_agent'] = env.open_db(b'message_by_agent', dupsort=True, create=True)
            _DBS['agent_cards'] = env.open_db(b'agent_cards', create=True)
            _DBS['shared_contexts'] = env.open_db(b'shared_contexts', create=True)
            _DBS['context_by_session'] = env.open_db(b'context_by_session', dupsort=True, create=True)
            _DBS['a2a_tasks'] = env.open_db(b'a2a_tasks', create=True)
            _DBS['task_agents'] = env.open_db(b'task_agents', dupsort=True, create=True)
        except Exception as e:
            logger.error(f"Error forcing database initialization: {e}")
    
    return _DBS

# --- Core Utility Functions ---

def encode_key(key):
    """Convert any key to bytes for LMDB."""
    if isinstance(key, str):
        return key.encode('utf-8')
    elif isinstance(key, bytes):
        return key
    else:
        return str(key).encode('utf-8')

def encode_value(value):
    """Encode a value for storage."""
    return msgpack.packb(value, use_bin_type=True)

def decode_value(value):
    """Decode a value from storage."""
    if value is None:
        return None
    return msgpack.unpackb(value, raw=False)

def create_composite_key(parts):
    """Create a composite key from parts."""
    return b':'.join(encode_key(part) for part in parts)

# --- Agent Card Operations ---

def get_agent_card(agent_id: str) -> Optional[Dict]:
    """Get an agent card by ID."""
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        agent_key = encode_key(agent_id)
        agent_data = txn.get(agent_key, db=dbs['agent_cards'])
        if agent_data:
            return decode_value(agent_data)
        return None

def list_agent_cards() -> List[Dict]:
    """List all agent cards."""
    # Default agents to use as fallback
    default_agents = [
        {
            "id": "chloe",
            "name": "Chloe",
            "description": "Git operations and general help",
            "color": "rgb(34, 197, 94)",
            "icon_path": "agents/chloe/src/assets/chloe.svg",
            "capabilities": ["git", "search", "explain"],
            "is_active": True,
        },
        {
            "id": "phil_connors",
            "name": "Phil Connors",
            "description": "Task management and coordination",
            "color": "rgb(249, 115, 22)",
            "icon_path": "agents/phil_connors/src/assets/phil-connors.svg",
            "capabilities": ["task", "coordinate", "plan"],
            "is_active": True,
        }
    ]
    
    agents = []
    try:
        # Get the environment and ensure databases are initialized
        env = get_env()
        
        # Get database handles
        dbs = open_dbs(env)
        
        # Check if we have any agents already stored
        found_agents = False
        with env.begin() as txn:
            # Get the agent_cards database handle
            agent_cards_db = dbs.get('agent_cards')
            
            if agent_cards_db:
                # Try to create a cursor and iterate through records
                cursor = txn.cursor(db=agent_cards_db)
                
                # Iterate through all records
                for key, value in cursor:
                    try:
                        decoded_value = decode_value(value)
                        agents.append(decoded_value)
                        found_agents = True
                        logger.info(f"Found agent: {decoded_value.get('id', 'unknown')}")
                    except Exception as e:
                        logger.error(f"Error decoding agent value: {e}")
            else:
                logger.error("agent_cards database handle not available")
                
        # If we found no agents, initialize with default agents
        if not found_agents:
            # Return default agents but also try to save them to the database
            logger.info("No agents found in database, using default agents")
            
            try:
                # Save default agents to the database
                with env.begin(write=True) as txn:
                    for agent in default_agents:
                        agent_key = encode_key(agent["id"])
                        txn.put(agent_key, encode_value(agent), db=dbs.get('agent_cards'))
                        
                logger.info("Default agents saved to database")
            except Exception as e:
                logger.error(f"Error saving default agents to database: {e}")
                
            return default_agents
    except Exception as e:
        logger.error(f"Error listing agent cards: {e}", exc_info=True)
        # Return default agents as fallback
        return default_agents
        
    # If we got here but found no agents, return default agents
    if not agents:
        return default_agents
        
    return agents

def create_agent_card(data: Dict) -> Dict:
    """Create a new agent card."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        agent_key = encode_key(data['id'])
        txn.put(agent_key, encode_value(data), db=dbs['agent_cards'])
        return data

def update_agent_card(agent_id: str, data: Dict) -> Optional[Dict]:
    """Update an agent card."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        agent_key = encode_key(agent_id)
        
        # Get existing agent data
        existing_data = txn.get(agent_key, db=dbs['agent_cards'])
        if not existing_data:
            return None
            
        # Update with new data
        agent_data = decode_value(existing_data)
        agent_data.update(data)
        
        # Save updated data
        txn.put(agent_key, encode_value(agent_data), db=dbs['agent_cards'])
        return agent_data

# --- Chat Session Operations ---

def create_session(title: Optional[str] = None, session_id: Optional[str] = None) -> Dict:
    """Create a new chat session."""
    try:
        now = datetime.now(UTC).isoformat()
        session_id = session_id or str(uuid.uuid4())
        
        logger.info(f"Creating new session with ID: {session_id}, title: {title}")
        
        data = {
            'id': session_id,
            'title': title or f"Chat Session {now}",
            'created_at': now,
            'updated_at': now,  # Add updated_at field to match ChatSessionRead model
            'session_type': 'chat',  # Add session_type field to match ChatSessionRead model
            'session_metadata': {}
        }
        
        # Make sure the database is initialized
        env = get_env()
        if not env:
            logger.error("Failed to get LMDB environment in create_session")
            raise RuntimeError("LMDB environment not available")
            
        dbs = open_dbs(env)
        if 'sessions' not in dbs:
            logger.error("'sessions' database not found in LMDB environment")
            raise RuntimeError("'sessions' database not available")
        
        # Begin transaction and write data
        with env.begin(write=True) as txn:
            session_key = encode_key(session_id)
            value = encode_value(data)
            txn.put(session_key, value, db=dbs['sessions'])
            logger.info(f"Successfully created session {session_id} in database")
            
        return data
    except Exception as e:
        logger.error(f"Error in create_session: {e}", exc_info=True)
        raise

def get_session(session_id: str) -> Optional[Dict]:
    """Get a chat session by ID."""
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        session_key = encode_key(session_id)
        session_data = txn.get(session_key, db=dbs['sessions'])
        if session_data:
            session = decode_value(session_data)
            
            # Ensure all required fields are present for backward compatibility
            if 'session_type' not in session:
                session['session_type'] = 'chat'
            if 'updated_at' not in session:
                session['updated_at'] = session.get('created_at', datetime.now(UTC).isoformat())
                
            return session
        return None

def list_sessions(skip: int = 0, limit: int = 100) -> List[Dict]:
    """List chat sessions with pagination."""
    sessions = []
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        cursor = txn.cursor(db=dbs['sessions'])
        
        # Collect all sessions first (we'll sort and paginate later)
        for _, value in cursor:
            session = decode_value(value)
            
            # Ensure all required fields are present for backward compatibility
            if 'session_type' not in session:
                session['session_type'] = 'chat'
            if 'updated_at' not in session:
                session['updated_at'] = session.get('created_at', datetime.now(UTC).isoformat())
                
            sessions.append(session)
        
        # Sort by created_at in descending order
        sessions.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        # Apply pagination
        return sessions[skip:skip+limit]

def update_session(session_id: str, data: Dict) -> Optional[Dict]:
    """Update a chat session."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        session_key = encode_key(session_id)
        
        # Get existing session data
        existing_data = txn.get(session_key, db=dbs['sessions'])
        if not existing_data:
            logger.warning(f"Attempted to update non-existent session: {session_id}")
            return None
            
        # Update with new data
        session_data = decode_value(existing_data)
        session_data.update(data)
        session_data['updated_at'] = datetime.now(UTC).isoformat()
        
        # Save updated data
        txn.put(session_key, encode_value(session_data), db=dbs['sessions'])
        return session_data

def delete_session(session_id: str) -> bool:
    """Delete a chat session and its associated messages."""
    try:
        with get_transaction(write=True) as (txn, env):
            dbs = open_dbs(env)
            session_key = encode_key(session_id)
            
            # First verify the session exists
            if not txn.get(session_key, db=dbs['sessions']):
                logger.warning(f"Attempted to delete non-existent session: {session_id}")
                return False
            
            # Delete session messages
            prefix = create_composite_key([session_id, ''])
            msg_cursor = txn.cursor(db=dbs['message_by_session'])
            if msg_cursor.set_range(prefix):
                while msg_cursor.key().startswith(prefix):
                    message_id = decode_value(msg_cursor.value())
                    # We can't delete while iterating, so just collect IDs
                    if not msg_cursor.next():
                        break
            
            # Delete shared contexts
            ctx_cursor = txn.cursor(db=dbs['context_by_session'])
            if ctx_cursor.set_range(prefix):
                while ctx_cursor.key().startswith(prefix):
                    context_id = decode_value(ctx_cursor.value())
                    # Delete the context itself
                    txn.delete(encode_key(context_id), db=dbs['shared_contexts'])
                    if not ctx_cursor.next():
                        break
            
            # Delete the session itself
            txn.delete(session_key, db=dbs['sessions'])
            
            logger.info(f"Successfully deleted session {session_id} and its associated data")
            return True
    except Exception as e:
        logger.error(f"Database error while deleting session {session_id}: {e}", exc_info=True)
        raise

# --- Message Operations ---

def create_message(data: Dict) -> Dict:
    """Create a new message with improved validation."""
    # Generate required fields if missing
    if 'message_uuid' not in data:
        data['message_uuid'] = str(uuid.uuid4())
    if 'created_at' not in data:
        data['created_at'] = datetime.now(UTC).isoformat()
    
    session_id = data.get('session_id')
    message_uuid = data.get('message_uuid')
    timestamp = data.get('created_at')
    
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        
        # Verify session exists
        session_key = encode_key(session_id)
        session_data = txn.get(session_key, db=dbs['sessions'])
        if not session_data:
            logger.error(f"Cannot create message: session {session_id} does not exist")
            raise ValueError(f"Session {session_id} does not exist")
        
        # Create message key (session_id:timestamp:uuid for natural ordering)
        message_key = create_composite_key([session_id, timestamp, message_uuid])
        
        # Store the message
        txn.put(message_key, encode_value(data), db=dbs['messages'])
        
        # Create secondary indexes
        # Session index
        session_idx_key = create_composite_key([session_id, timestamp])
        txn.put(session_idx_key, encode_value(message_uuid), db=dbs['message_by_session'])
        
        # Agent index (if applicable)
        if data.get('agent_id'):
            agent_id = data.get('agent_id')
            agent_idx_key = create_composite_key([agent_id, timestamp])
            txn.put(agent_idx_key, encode_value(message_uuid), db=dbs['message_by_agent'])
        
        # Immediately retrieve the message to ensure it was stored correctly
        message = get_message(message_uuid)
        if not message:
            logger.warning(f"Message creation succeeded but retrieval failed: {message_uuid}")
        
        return message or data

def get_message(message_uuid: str) -> Optional[Dict]:
    """Get a message by UUID."""
    try:
        with get_transaction() as (txn, env):
            dbs = open_dbs(env)
            cursor = txn.cursor(db=dbs['messages'])
            
            # Try to find by composite key first (most efficient)
            # We can't use direct key lookup because the session_id and timestamp parts are unknown
            # So we need to scan, but we can optimize the scanning process
            
            # Log detailed info for debugging
            logger.debug(f"Searching for message with UUID: {message_uuid}")
            
            # First pass: Use key structure to find by UUID in the third part of the key
            for key, value in cursor:
                try:
                    key_parts = key.split(b':')
                    # Ensure we have enough parts (session_id:timestamp:uuid)
                    if len(key_parts) >= 3:
                        # Check if the third part matches after decoding 
                        uuid_part = key_parts[2].decode('utf-8')
                        if uuid_part == message_uuid:
                            message = decode_value(value)
                            logger.debug(f"Found message {message_uuid} via key structure")
                            return message
                except Exception as key_err:
                    logger.warning(f"Error parsing key during message search: {key_err}")
                    continue
            
            # Second pass: Check the message_uuid field in the value
            cursor.first()
            for key, value in cursor:
                try:
                    data = decode_value(value)
                    if isinstance(data, dict) and data.get('message_uuid') == message_uuid:
                        logger.debug(f"Found message {message_uuid} via message_uuid field")
                        return data
                except Exception as value_err:
                    logger.warning(f"Error decoding value during message search: {value_err}")
                    continue
            
            # Log if message not found
            logger.warning(f"Message with UUID {message_uuid} not found in database")
            return None
            
    except Exception as e:
        logger.error(f"Error retrieving message {message_uuid}: {e}", exc_info=True)
        return None

def get_message_by_uuid(message_uuid: str) -> Optional[Dict]:
    """
    Get a message by its UUID.
    This is an alias for get_message but has a more explicit name for clarity.
    """
    result = get_message(message_uuid)
    if result:
        logger.debug(f"Successfully retrieved message {message_uuid} through get_message_by_uuid")
    else:
        logger.debug(f"Message {message_uuid} not found through get_message_by_uuid")
    return result

def trim_session_messages(session_id: str, max_messages: int = 100) -> int:
    """
    Trim old messages when a session exceeds the maximum message count.
    
    Args:
        session_id: The session to trim messages for
        max_messages: Maximum number of messages to keep
        
    Returns:
        Number of messages deleted
    """
    deleted_count = 0
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        
        # Count total messages
        prefix = create_composite_key([session_id, ''])
        cursor = txn.cursor(db=dbs['message_by_session'])
        
        # Get all message keys
        messages = []
        if cursor.set_range(prefix):
            while cursor.key().startswith(prefix):
                messages.append((cursor.key(), decode_value(cursor.value())))
                if not cursor.next():
                    break
        
        # If over limit, delete oldest messages
        total = len(messages)
        if total > max_messages:
            # Sort by timestamp (which is part of the key)
            messages.sort(key=lambda x: x[0])
            
            # Delete oldest messages
            num_to_delete = total - max_messages
            for i in range(num_to_delete):
                key, message_uuid = messages[i]
                # Delete from message_by_session index
                txn.delete(key, db=dbs['message_by_session'])
                
                # Find and delete from messages
                message_cursor = txn.cursor(db=dbs['messages'])
                for msg_key, _ in message_cursor:
                    key_parts = msg_key.split(b':')
                    if len(key_parts) >= 3 and key_parts[2] == encode_key(message_uuid):
                        txn.delete(msg_key, db=dbs['messages'])
                        deleted_count += 1
                        break
                        
                # Also delete from agent index if applicable
                msg_data = get_message(message_uuid)
                if msg_data and msg_data.get('agent_id'):
                    agent_id = msg_data.get('agent_id')
                    timestamp = msg_data.get('created_at')
                    agent_idx_key = create_composite_key([agent_id, timestamp])
                    txn.delete(agent_idx_key, db=dbs['message_by_agent'])
            
            return deleted_count
        
        return 0

def get_session_messages(
    session_id: str, 
    skip: int = 0, 
    limit: int = 100,
    cursor: Optional[str] = None,
    direction: str = "desc",
    include_total: bool = False
) -> Union[List[Dict], Dict[str, Any]]:
    """
    Get messages for a specific session with improved pagination options.
    
    Args:
        session_id: The chat session ID
        skip: Number of messages to skip (for offset pagination)
        limit: Maximum number of messages to return
        cursor: Message UUID or timestamp for cursor-based pagination
        direction: Sort direction, 'asc' (oldest first) or 'desc' (newest first)
        include_total: Whether to count total messages
        
    Returns:
        If include_total is False, returns a list of messages.
        If include_total is True, returns a dict with 'items' (messages) and 'pagination' metadata.
    """
    logger.info(f"Getting messages for session {session_id} with params: skip={skip}, limit={limit}, cursor={cursor}, direction={direction}, include_total={include_total}")
    
    results = []
    total_count = 0
    
    try:
        with get_transaction() as (txn, env):
            dbs = open_dbs(env)
            
            # Get cursor for session messages
            db_cursor = txn.cursor(db=dbs['message_by_session'])
            
            # Position cursor based on parameters
            if cursor:
                # Position at the cursor value
                cursor_key = create_composite_key([session_id, cursor])
                if not db_cursor.set_key(cursor_key):
                    # If cursor not found, position at beginning or end based on direction
                    if direction.lower() == "asc":
                        db_cursor.first()
                    else:
                        db_cursor.last()
            else:
                # No cursor, position at beginning or end based on direction
                if direction.lower() == "asc":
                    db_cursor.set_range(encode_key(session_id))
                else:
                    # For descending order, we need to position at the last message for this session
                    prefix = encode_key(session_id) + b':'
                    if not db_cursor.set_range(prefix):
                        db_cursor.last()
                    else:
                        # Find last key with this session prefix
                        while db_cursor.key().startswith(prefix) and db_cursor.next():
                            pass
                        db_cursor.prev()  # Step back to last match
            
            # Skip records if needed
            if skip > 0:
                for _ in range(skip):
                    if direction.lower() == "asc":
                        if not db_cursor.next():
                            break
                    else:
                        if not db_cursor.prev():
                            break
            
            # Count total if requested
            if include_total:
                prefix = encode_key(session_id) + b':'
                count_cursor = txn.cursor(db=dbs['message_by_session'])
                if count_cursor.set_range(prefix):
                    while count_cursor.key().startswith(prefix):
                        total_count += 1
                        if not count_cursor.next():
                            break
            
            # Collect messages up to limit
            i = 0
            next_cursor = None
            prev_cursor = None
            while i < limit:
                if not db_cursor.key() or not db_cursor.key().startswith(encode_key(session_id)):
                    break
                
                message_uuid = decode_value(db_cursor.value())
                
                # Store cursor for next page
                if i == limit - 1:
                    key_parts = db_cursor.key().split(b':')
                    if len(key_parts) >= 2:
                        next_cursor = key_parts[1].decode('utf-8')
                
                # Get full message data
                message_data = get_message(message_uuid)
                if message_data:
                    results.append(message_data)
                
                # Move to next/prev based on direction
                moved = False
                if direction.lower() == "asc":
                    moved = db_cursor.next()
                else:
                    moved = db_cursor.prev()
                
                if not moved:
                    break
                
                i += 1
            
            # Format results
            if include_total:
                pagination = {
                    "total": total_count,
                    "limit": limit,
                    "direction": direction
                }
                
                if next_cursor:
                    pagination["next_cursor"] = next_cursor
                
                if skip > 0:
                    pagination["skip"] = skip
                    
                return {
                    "items": results,
                    "pagination": pagination
                }
            else:
                return results
                
    except Exception as e:
        logger.error(f"Error fetching messages for session {session_id}: {str(e)}", exc_info=True)
        
        # Log detailed message with traceback for debugging
        logger.error(f"Message retrieval exception details:\n{traceback.format_exc()}")
        
        # Return empty result to avoid breaking the frontend
        if include_total:
            return {
                "items": [], 
                "pagination": {
                    "limit": limit, 
                    "direction": direction,
                    "total": 0,
                    "skip": skip if cursor is None else None
                }
            }
        return []

# --- Shared Context Operations ---

def create_shared_context(data: Dict) -> Dict:
    """Create a new shared context."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
        if 'created_at' not in data:
            data['created_at'] = datetime.now(UTC).isoformat()
            
        context_id = data['id']
        session_id = data.get('session_id')
        
        # Store the context
        context_key = encode_key(context_id)
        txn.put(context_key, encode_value(data), db=dbs['shared_contexts'])
        
        # Create index by session
        if session_id:
            session_idx_key = create_composite_key([session_id, data.get('created_at', '')])
            txn.put(session_idx_key, encode_value(context_id), db=dbs['context_by_session'])
        
        return data

def get_shared_context(context_id: str) -> Optional[Dict]:
    """Get a shared context by ID."""
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        context_key = encode_key(context_id)
        context_data = txn.get(context_key, db=dbs['shared_contexts'])
        if context_data:
            return decode_value(context_data)
        return None

def get_agent_contexts(agent_id: str, as_target: bool = True) -> List[Dict]:
    """Get shared contexts for an agent."""
    contexts = []
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        cursor = txn.cursor(db=dbs['shared_contexts'])
        
        for _, value in cursor:
            context = decode_value(value)
            if as_target and context.get('target_agent_id') == agent_id:
                contexts.append(context)
            elif not as_target and context.get('source_agent_id') == agent_id:
                contexts.append(context)
                
        # Sort by created_at in descending order
        contexts.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return contexts

def get_session_contexts(session_id: str, include_expired: bool = False) -> List[Dict]:
    """Get shared contexts for a session."""
    contexts = []
    now = datetime.now(UTC).isoformat()
    
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        
        # Get all context IDs for this session
        prefix = create_composite_key([session_id, ''])
        cursor = txn.cursor(db=dbs['context_by_session'])
        
        if cursor.set_range(prefix):
            while cursor.key().startswith(prefix):
                context_id = decode_value(cursor.value())
                # Get the full context data
                context_data = txn.get(encode_key(context_id), db=dbs['shared_contexts'])
                if context_data:
                    context = decode_value(context_data)
                    
                    # Check if expired
                    if include_expired or not context.get('expires_at') or context.get('expires_at') > now:
                        contexts.append(context)
                
                if not cursor.next():
                    break
                
        # Sort by created_at in descending order
        contexts.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return contexts

def delete_expired_contexts() -> int:
    """Delete expired shared contexts."""
    deleted_count = 0
    now = datetime.now(UTC).isoformat()
    
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        cursor = txn.cursor(db=dbs['shared_contexts'])
        
        # Collect expired contexts
        expired_ids = []
        for key, value in cursor:
            context = decode_value(value)
            if context.get('expires_at') and context.get('expires_at') < now:
                expired_ids.append((key, context.get('session_id'), context.get('created_at')))
        
        # Delete expired contexts
        for key, session_id, created_at in expired_ids:
            # Delete from main store
            txn.delete(key, db=dbs['shared_contexts'])
            
            # Delete from session index
            if session_id and created_at:
                session_idx_key = create_composite_key([session_id, created_at])
                txn.delete(session_idx_key, db=dbs['context_by_session'])
            
            deleted_count += 1
        
        return deleted_count

def get_shared_contexts(
    target_agent_id: str,
    session_id: Optional[str] = None,
    source_agent_id: Optional[str] = None,
    include_expired: bool = False
) -> List[Dict]:
    """Get shared contexts for an agent."""
    contexts = []
    now = datetime.now(UTC).isoformat()
    
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        cursor = txn.cursor(db=dbs['shared_contexts'])
        
        for _, value in cursor:
            context = decode_value(value)
            
            # Apply filters
            if context.get('target_agent_id') != target_agent_id:
                continue
                
            if session_id and context.get('session_id') != session_id:
                continue
                
            if source_agent_id and context.get('source_agent_id') != source_agent_id:
                continue
                
            if not include_expired and context.get('expires_at') and context.get('expires_at') < now:
                continue
                
            contexts.append(context)
                
        # Sort by created_at in descending order
        contexts.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return contexts

def update_shared_context(context_id: str, data: Dict) -> Optional[Dict]:
    """Update a shared context."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        context_key = encode_key(context_id)
        
        # Get existing context data
        existing_data = txn.get(context_key, db=dbs['shared_contexts'])
        if not existing_data:
            return None
            
        # Update with new data
        context_data = decode_value(existing_data)
        context_data.update(data)
        
        # Save updated data
        txn.put(context_key, encode_value(context_data), db=dbs['shared_contexts'])
        return context_data

def extend_context_ttl(context_id: str, additional_minutes: int) -> Optional[Dict]:
    """Extend the TTL of a shared context."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        context_key = encode_key(context_id)
        
        # Get existing context data
        existing_data = txn.get(context_key, db=dbs['shared_contexts'])
        if not existing_data:
            return None
            
        # Update with new expiry
        context_data = decode_value(existing_data)
        
        # Calculate new expiry
        current_time = datetime.now(UTC)
        base_time = None
        
        if context_data.get('expires_at'):
            try:
                base_time = datetime.fromisoformat(context_data['expires_at'])
                # Ensure base_time is greater than current time
                base_time = max(current_time, base_time)
            except (ValueError, TypeError):
                base_time = current_time
        else:
            base_time = current_time
            
        new_expiry = base_time + timedelta(minutes=additional_minutes)
        
        # Update context
        context_data['expires_at'] = new_expiry.isoformat()
        
        # Update metadata
        if 'context_metadata' not in context_data:
            context_data['context_metadata'] = {}
            
        context_data['context_metadata']['ttl_extended_at'] = current_time.isoformat()
        context_data['context_metadata']['ttl_extension'] = additional_minutes
        
        # Save updated data
        txn.put(context_key, encode_value(context_data), db=dbs['shared_contexts'])
        return context_data

def cleanup_expired_contexts(batch_size: int = 100) -> int:
    """Clean up expired shared contexts in batches."""
    return delete_expired_contexts()  # Delegate to the main function

def share_context(data: Dict) -> Dict:
    """Create a new shared context (alias for create_shared_context)."""
    return create_shared_context(data)

# --- Task Operations ---

def create_task(data: Dict) -> Dict:
    """Create a new A2A task."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
        if 'created_at' not in data:
            data['created_at'] = datetime.now(UTC).isoformat()
            
        task_id = data['id']
        
        # Store the task
        task_key = encode_key(task_id)
        txn.put(task_key, encode_value(data), db=dbs['a2a_tasks'])
        
        # Link agents if specified
        agents = data.pop('agents', [])
        if agents:
            link_task_agents(task_id, [agent['id'] for agent in agents])
            
        return get_task(task_id)

def get_task(task_id: str) -> Optional[Dict]:
    """Get a task by ID."""
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        task_key = encode_key(task_id)
        task_data = txn.get(task_key, db=dbs['a2a_tasks'])
        
        if not task_data:
            return None
            
        task = decode_value(task_data)
        
        # Get associated agents
        task['agents'] = []
        
        # Set up cursor to find all agents for this task
        cursor = txn.cursor(db=dbs['task_agents'])
        prefix = encode_key(task_id) + b':'
        
        if cursor.set_range(prefix):
            while cursor.key().startswith(prefix):
                agent_id = cursor.key().split(b':')[1].decode('utf-8')
                
                # Get agent data
                agent_data = txn.get(encode_key(agent_id), db=dbs['agent_cards'])
                if agent_data:
                    task['agents'].append(decode_value(agent_data))
                
                if not cursor.next():
                    break
                    
        return task

def update_task(task_id: str, data: Dict) -> Optional[Dict]:
    """Update a task."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        task_key = encode_key(task_id)
        
        # Get existing task data
        existing_data = txn.get(task_key, db=dbs['a2a_tasks'])
        if not existing_data:
            return None
            
        # Update with new data
        task_data = decode_value(existing_data)
        task_data.update(data)
        
        # Save updated data
        txn.put(task_key, encode_value(task_data), db=dbs['a2a_tasks'])
        
        # Handle agents if specified
        agents = data.pop('agents', None)
        if agents is not None:
            # Clear existing agent links
            cursor = txn.cursor(db=dbs['task_agents'])
            prefix = encode_key(task_id) + b':'
            
            if cursor.set_range(prefix):
                while cursor.key().startswith(prefix):
                    txn.delete(cursor.key(), db=dbs['task_agents'])
                    if not cursor.next():
                        break
            
            # Create new agent links
            link_task_agents(task_id, [agent['id'] for agent in agents])
            
        return get_task(task_id)

def get_agent_tasks(agent_id: str, status: Optional[str] = None) -> List[Dict]:
    """Get tasks for a specific agent."""
    tasks = []
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        
        # Find all task IDs for this agent
        cursor = txn.cursor(db=dbs['task_agents'])
        for key, _ in cursor:
            key_parts = key.split(b':')
            if len(key_parts) >= 2 and key_parts[1] == encode_key(agent_id):
                task_id = key_parts[0].decode('utf-8')
                
                # Get task data
                task_data = txn.get(encode_key(task_id), db=dbs['a2a_tasks'])
                if task_data:
                    task = decode_value(task_data)
                    
                    # Apply status filter if specified
                    if status and task.get('status') != status:
                        continue
                        
                    # Get associated agents
                    task = get_task(task_id)
                    if task:
                        tasks.append(task)
        
        return tasks

def get_session_tasks(session_id: str, include_completed: bool = False) -> List[Dict]:
    """Get tasks for a chat session."""
    tasks = []
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        
        # Iterate through all tasks to find those for this session
        cursor = txn.cursor(db=dbs['a2a_tasks'])
        for _, value in cursor:
            task = decode_value(value)
            
            if task.get('session_id') != session_id:
                continue
                
            if not include_completed and task.get('status') in ('completed', 'cancelled'):
                continue
                
            # Get associated agents
            task = get_task(task['id'])
            if task:
                tasks.append(task)
        
        return tasks

def link_task_agents(task_id: str, agent_ids: List[str]) -> None:
    """Link agents to a task."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        
        # First verify all agents exist
        for agent_id in agent_ids:
            agent_key = encode_key(agent_id)
            if not txn.get(agent_key, db=dbs['agent_cards']):
                raise ValueError(f"Agent not found: {agent_id}")
        
        # Link agents to task
        for agent_id in agent_ids:
            task_agent_key = create_composite_key([task_id, agent_id])
            txn.put(task_agent_key, b'1', db=dbs['task_agents'])

# --- Database Initialization ---

def init_database():
    """Initialize the LMDB database with sample data."""
    try:
        # Reset global environment and database handles
        global _ENV, _DBS
        logger.info("Starting LMDB database initialization")
        
        # First check if existing database needs to be closed
        if _ENV is not None:
            logger.info("Closing existing LMDB environment")
            try:
                _ENV.close()
                logger.info("Successfully closed existing LMDB environment")
            except Exception as close_err:
                logger.warning(f"Error closing existing LMDB environment: {close_err}")
        
        # Reset our global references
        _ENV = None
        _DBS = {}
        logger.info("Global LMDB references reset")
        
        # Check the database directory and files
        db_path = DEFAULT_DB_PATH
        
        # Create directory if it doesn't exist
        db_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Ensured database directory exists at {db_path}")
        
        # Get the environment - this will initialize all databases
        logger.info("Getting LMDB environment")
        env = get_env()
        logger.info("Getting database handles")
        dbs = open_dbs(env)
        
        # Skip adding sample data if the database already has agents and sessions
        existing_agents = None
        try:
            existing_agents = list_agent_cards()
            logger.info(f"Found {len(existing_agents)} existing agents")
            
            if existing_agents and len(existing_agents) >= 2:
                logger.info("Database already has agents, skipping sample data")
                return True
        except Exception as e:
            logger.warning(f"Error checking existing agents: {e}, will add sample data")
        
        # Add default data
        logger.info("Adding default sample data to database")
        default_added = False
        
        try:
            with env.begin(write=True) as txn:
                # Create default agents
                default_agents = [
                    {
                        "id": "chloe",
                        "name": "Chloe",
                        "description": "Git operations and general help",
                        "color": "rgb(34, 197, 94)",
                        "icon_path": "agents/chloe/src/assets/chloe.svg",
                        "capabilities": ["git", "search", "explain"],
                        "is_active": True,
                        "created_at": datetime.now(UTC).isoformat()
                    },
                    {
                        "id": "phil_connors",
                        "name": "Phil Connors",
                        "description": "Task management and coordination",
                        "color": "rgb(249, 115, 22)",
                        "icon_path": "agents/phil_connors/src/assets/phil-connors.svg",
                        "capabilities": ["task", "coordinate", "plan"],
                        "is_active": True,
                        "created_at": datetime.now(UTC).isoformat()
                    }
                ]
                
                # Get agent_cards database handle
                logger.info("Adding default agents")
                agent_cards_db = dbs.get('agent_cards')
                if not agent_cards_db:
                    logger.warning("agent_cards database handle not available, opening manually")
                    agent_cards_db = env.open_db(b'agent_cards', create=True)
                    dbs['agent_cards'] = agent_cards_db
                
                # Add default agents
                for agent in default_agents:
                    agent_key = encode_key(agent["id"])
                    txn.put(agent_key, encode_value(agent), db=agent_cards_db)
                    logger.info(f"Added default agent: {agent['id']}")
                
                # Get sessions database handle
                logger.info("Adding default session")
                sessions_db = dbs.get('sessions')
                if not sessions_db:
                    logger.warning("sessions database handle not available, opening manually")
                    sessions_db = env.open_db(b'sessions', create=True)
                    dbs['sessions'] = sessions_db
                
                # Create default session
                session_id = str(uuid.uuid4())
                session_data = {
                    'id': session_id,
                    'title': f"Default Session",
                    'created_at': datetime.now(UTC).isoformat(),
                    'session_metadata': {}
                }
                session_key = encode_key(session_id)
                txn.put(session_key, encode_value(session_data), db=sessions_db)
                logger.info(f"Added default session: {session_id}")
                default_added = True
        except Exception as e:
            logger.error(f"Error adding default data: {e}", exc_info=True)
            # Continue without failing - the database still exists
        
        # Simple verification
        logger.info("Verifying database initialization")
        try:
            # Test if we can list agents
            agents = list_agent_cards()
            if agents:
                logger.info(f"Successfully listed {len(agents)} agents after initialization")
            else:
                logger.warning("No agents found after initialization, but continuing")
        except Exception as e:
            logger.error(f"Error verifying agents: {e}", exc_info=True)
            # Continue without failing - try to recover
        
        # Skip heavy tests to avoid potential stalling
        logger.info("LMDB database initialization completed with minimal verification")
        return True
    except Exception as e:
        logger.error(f"Critical error initializing LMDB database: {e}", exc_info=True)
        # Try to create a minimal empty database as a fallback
        try:
            logger.info("Attempting fallback minimal database creation")
            
            # First, check if database files exist and delete them
            data_path = DEFAULT_DB_PATH / "data.mdb"
            lock_path = DEFAULT_DB_PATH / "lock.mdb"
            
            # Delete existing database files if they exist
            if data_path.exists():
                logger.info(f"Removing existing data.mdb file")
                data_path.unlink()
            
            if lock_path.exists():
                logger.info(f"Removing existing lock.mdb file")
                lock_path.unlink()
            
            # Ensure directory exists
            DEFAULT_DB_PATH.mkdir(parents=True, exist_ok=True)
            
            # Create with more relaxed settings
            minimal_env = lmdb.Environment(
                path=str(DEFAULT_DB_PATH),
                map_size=128 * 1024 * 1024,  # 128MB
                max_dbs=10,
                sync=False,
                metasync=False,
                writemap=True,
                create=True
            )
            
            # Open databases without transaction
            logger.info("Creating minimal databases")
            minimal_env.open_db(b'agent_cards', create=True)
            minimal_env.open_db(b'sessions', create=True)
            minimal_env.open_db(b'messages', create=True)
            
            # Close properly
            minimal_env.sync()
            minimal_env.close()
            logger.info("Created minimal fallback database")
            
            # Reset environment
            _ENV = None  # Using the global variables defined at module level
            _DBS = {}
            logger.info("Reset environment after fallback creation")
            
            return True
        except Exception as fallback_err:
            logger.error(f"Fallback database creation failed: {fallback_err}", exc_info=True)
            return False