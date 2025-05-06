"""
Quick fix script to repair LMDB database
"""

import os
import shutil
import lmdb
import uuid
import msgpack
from datetime import datetime, timezone
from pathlib import Path

# Logging setup
import logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("fix_lmdb")

# Define the project root relative to this file's location
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_ROOT / "api_gateway" / "chats" / "chat_database"

UTC = timezone.utc

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

def main():
    """Fix the LMDB database."""
    logger.info(f"Starting LMDB database repair")
    
    # First delete the existing database
    if DB_PATH.exists():
        logger.info(f"Removing existing database at {DB_PATH}")
        shutil.rmtree(DB_PATH)
    
    # Create database directory
    DB_PATH.mkdir(parents=True, exist_ok=True)
    logger.info(f"Created database directory at {DB_PATH}")
    
    # Create a new database with smaller map size (1GB)
    map_size = 1 * 1024 * 1024 * 1024  # 1GB
    
    logger.info(f"Opening LMDB environment with map_size={map_size} bytes")
    env = lmdb.Environment(
        path=str(DB_PATH),
        map_size=map_size,
        max_dbs=10,
        sync=True,  # More durable for first initialization
        readahead=False,
        metasync=True,
        writemap=True,
        create=True,
        subdir=True,
    )
    
    # Initialize database
    with env.begin(write=True) as txn:
        # Create databases
        logger.info("Creating subdatabases...")
        sessions_db = env.open_db(b'sessions', create=True, txn=txn)
        messages_db = env.open_db(b'messages', create=True, txn=txn)
        message_by_session_db = env.open_db(b'message_by_session', dupsort=True, create=True, txn=txn)
        message_by_agent_db = env.open_db(b'message_by_agent', dupsort=True, create=True, txn=txn)
        agent_cards_db = env.open_db(b'agent_cards', create=True, txn=txn)
        shared_contexts_db = env.open_db(b'shared_contexts', create=True, txn=txn)
        context_by_session_db = env.open_db(b'context_by_session', dupsort=True, create=True, txn=txn)
        a2a_tasks_db = env.open_db(b'a2a_tasks', create=True, txn=txn)
        task_agents_db = env.open_db(b'task_agents', dupsort=True, create=True, txn=txn)
        
        # Add default agents
        logger.info("Adding default agents...")
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
        
        for agent in default_agents:
            agent_key = encode_key(agent["id"])
            txn.put(agent_key, encode_value(agent), db=agent_cards_db)
            logger.info(f"Added default agent: {agent['id']}")
        
        # Create default session
        logger.info("Creating default session...")
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
    
    # Sync changes and close
    env.sync()
    env.close()
    
    logger.info("Database initialization complete")
    logger.info("You can now start the server with: npm run dev")

if __name__ == "__main__":
    main()