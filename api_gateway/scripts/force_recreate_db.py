#!/usr/bin/env python3
"""
Force recreates the LMDB database with minimal settings to recover from corruption.
This is a recovery script to be used when the database won't initialize properly.
"""

import os
import sys
import logging
import shutil
from pathlib import Path
import lmdb
import uuid
import time
import msgpack
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('force_recreate_db')

# Define paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_ROOT / "api_gateway" / "chats" / "chat_database"
BACKUP_DIR = PROJECT_ROOT / "api_gateway" / "chats" / "backups"

def encode_value(value):
    """Encode value for LMDB storage."""
    return msgpack.packb(value, use_bin_type=True)

def encode_key(key):
    """Convert key to bytes for LMDB."""
    if isinstance(key, str):
        return key.encode('utf-8')
    elif isinstance(key, bytes):
        return key
    else:
        return str(key).encode('utf-8')

def main():
    """Force recreate the LMDB database."""
    logger.info(f"Starting forced LMDB database recreation at {DB_PATH}")
    
    # Create backup directory if it doesn't exist
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Backup existing database if it exists
    if DB_PATH.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = BACKUP_DIR / f"db_backup_{timestamp}"
        logger.info(f"Creating backup of existing database at {backup_path}")
        try:
            shutil.copytree(DB_PATH, backup_path)
            logger.info("Backup complete")
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            logger.warning("Continuing without backup")
    
    # Delete existing database
    logger.info(f"Deleting existing database at {DB_PATH}")
    if DB_PATH.exists():
        try:
            shutil.rmtree(DB_PATH)
            logger.info("Successfully deleted existing database")
        except Exception as e:
            logger.error(f"Error deleting database: {e}")
            logger.error("Attempting to continue anyway")
    
    # Create database directory
    logger.info(f"Creating database directory at {DB_PATH}")
    DB_PATH.mkdir(parents=True, exist_ok=True)
    
    # Create minimal database
    logger.info("Creating minimal LMDB database")
    try:
        # Use very conservative settings
        env = lmdb.Environment(
            path=str(DB_PATH),
            map_size=64 * 1024 * 1024,  # 64MB
            max_dbs=10,
            sync=True,
            readahead=True,
            metasync=True,
            writemap=False,
            create=True,
            subdir=True,
        )
        
        logger.info("Creating subdatabases...")
        with env.begin(write=True) as txn:
            # Create all the required databases
            sessions_db = env.open_db(b'sessions', create=True)
            messages_db = env.open_db(b'messages', create=True)
            message_by_session_db = env.open_db(b'message_by_session', dupsort=True, create=True)
            message_by_agent_db = env.open_db(b'message_by_agent', dupsort=True, create=True)
            agent_cards_db = env.open_db(b'agent_cards', create=True)
            shared_contexts_db = env.open_db(b'shared_contexts', create=True)
            context_by_session_db = env.open_db(b'context_by_session', dupsort=True, create=True)
            a2a_tasks_db = env.open_db(b'a2a_tasks', create=True)
            task_agents_db = env.open_db(b'task_agents', dupsort=True, create=True)
            
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
            
            # Add default agents
            for agent in default_agents:
                agent_key = encode_key(agent["id"])
                txn.put(agent_key, encode_value(agent), db=agent_cards_db)
                logger.info(f"Added default agent: {agent['id']}")
            
            # Create default session
            session_id = str(uuid.uuid4())
            session_data = {
                'id': session_id,
                'title': "Default Session",
                'created_at': datetime.now(timezone.utc).isoformat(),
                'session_metadata': {}
            }
            session_key = encode_key(session_id)
            txn.put(session_key, encode_value(session_data), db=sessions_db)
            logger.info(f"Added default session: {session_id}")
        
        # Sync and close
        env.sync()
        env.close()
        logger.info("Successfully created minimal database")
        return True
    except Exception as e:
        logger.error(f"Error creating database: {e}", exc_info=True)
        logger.error("Database recreation failed")
        return False

if __name__ == "__main__":
    success = main()
    if success:
        logger.info("Database recreation completed successfully")
        sys.exit(0)
    else:
        logger.error("Database recreation failed")
        sys.exit(1)