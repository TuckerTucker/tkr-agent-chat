#!/usr/bin/env python

"""
Simplified LMDB Database Initialization Script

This script provides a more direct approach to database initialization
without using abstractions that might hide errors.
"""

import sys
import os
import logging
import lmdb
import msgpack
import uuid
import shutil
from datetime import datetime, timezone
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("simplified_init_lmdb")

# Add parent directory to sys.path to import db modules
parent_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_dir))

# Define common paths and settings
DB_PATH = parent_dir / "chats" / "chat_database"

def encode_value(value):
    """Encode a value for storage."""
    return msgpack.packb(value, use_bin_type=True)

def decode_value(value):
    """Decode a value from storage."""
    if value is None:
        return None
    return msgpack.unpackb(value, raw=False)

def main():
    """Initialize the LMDB database directly."""
    logger.info(f"Starting simplified LMDB initialization at {DB_PATH}")
    
    # Step 1: Remove existing database if it exists
    if DB_PATH.exists():
        logger.info("Removing existing database...")
        try:
            if DB_PATH.is_dir():
                shutil.rmtree(DB_PATH)
            else:
                DB_PATH.unlink()
        except Exception as e:
            logger.error(f"Error removing database: {e}")
            return False
    
    # Step 2: Create database directory
    logger.info(f"Creating database directory at {DB_PATH}")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    # Step 3: Create LMDB environment
    try:
        env = lmdb.Environment(
            path=str(DB_PATH),
            map_size=10 * 1024 * 1024 * 1024,  # 10GB
            max_dbs=10,  # Separate databases for different collections
            subdir=True,  # Use subdirectory
            create=True,  # Create if doesn't exist
        )
        logger.info("Created LMDB environment")
        
        # Step 4: Create subdatabases and add data
        with env:
            # Step 4.1: Create subdatabases
            logger.info("Creating subdatabases...")
            sessions_db = env.open_db(b'sessions', create=True)
            messages_db = env.open_db(b'messages', create=True)
            message_by_session_db = env.open_db(b'message_by_session', dupsort=True, create=True)
            message_by_agent_db = env.open_db(b'message_by_agent', dupsort=True, create=True)
            agent_cards_db = env.open_db(b'agent_cards', create=True)
            shared_contexts_db = env.open_db(b'shared_contexts', create=True)
            context_by_session_db = env.open_db(b'context_by_session', dupsort=True, create=True)
            a2a_tasks_db = env.open_db(b'a2a_tasks', create=True)
            task_agents_db = env.open_db(b'task_agents', dupsort=True, create=True)
            
            # Step 4.2: Add default agents
            logger.info("Adding default agents...")
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
                        "created_at": datetime.now(timezone.utc).isoformat()
                    },
                    {
                        "id": "phil_connors",
                        "name": "Phil Connors",
                        "description": "Task management and coordination",
                        "color": "rgb(249, 115, 22)",
                        "icon_path": "agents/phil_connors/src/assets/phil-connors.svg",
                        "capabilities": ["task", "coordinate", "plan"],
                        "is_active": True,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                ]
                
                # Add agents to database
                for agent in default_agents:
                    agent_key = agent["id"].encode('utf-8')
                    agent_value = encode_value(agent)
                    txn.put(agent_key, agent_value, db=agent_cards_db)
                    logger.info(f"Added default agent: {agent['id']}")
                
                # Create default session
                logger.info("Creating default session...")
                session_id = str(uuid.uuid4())
                session_data = {
                    'id': session_id,
                    'title': f"Default Session",
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'session_metadata': {}
                }
                session_key = session_id.encode('utf-8')
                session_value = encode_value(session_data)
                txn.put(session_key, session_value, db=sessions_db)
                logger.info(f"Added default session: {session_id}")
        
        # Step 5: Verify data
        logger.info("Verifying data...")
        with env:
            with env.begin() as txn:
                # Check agents
                cursor = txn.cursor(db=agent_cards_db)
                agent_count = 0
                for key, value in cursor:
                    agent = decode_value(value)
                    logger.info(f"Found agent in database: {agent.get('id')}")
                    agent_count += 1
                logger.info(f"Total agents: {agent_count}")
                
                # Check sessions
                cursor = txn.cursor(db=sessions_db)
                session_count = 0
                for key, value in cursor:
                    session = decode_value(value)
                    logger.info(f"Found session in database: {session.get('id')}")
                    session_count += 1
                logger.info(f"Total sessions: {session_count}")
        
        # Step 6: Close environment
        env.close()
        logger.info("LMDB initialization completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Error initializing LMDB database: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)