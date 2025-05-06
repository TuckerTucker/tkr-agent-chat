#!/usr/bin/env python

"""
Script to forcibly initialize the LMDB database.
This script will delete any existing LMDB database and recreate it.
"""

import sys
import os
import shutil
from pathlib import Path

# Add parent directory to sys.path
parent_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_dir / "src"))

# Import required modules
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("force_init_lmdb")

# Database path
DB_PATH = parent_dir / "chats" / "chat_database"

def main():
    """Delete and recreate the LMDB database."""
    # Delete existing database
    if DB_PATH.exists():
        logger.info(f"Deleting existing LMDB database at {DB_PATH}")
        try:
            if DB_PATH.is_dir():
                shutil.rmtree(DB_PATH)
            else:
                DB_PATH.unlink()
        except Exception as e:
            logger.error(f"Error deleting database: {e}")
            return False
    
    # Create database directory
    logger.info(f"Creating database directory at {DB_PATH}")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.mkdir(parents=True, exist_ok=True)
    
    # Create databases
    logger.info("Initializing LMDB database...")
    
    try:
        # Import our db_lmdb module
        import db_lmdb
        
        # Create environment directly without using helper functions
        import lmdb
        env = lmdb.Environment(
            path=str(DB_PATH),
            map_size=10 * 1024 * 1024 * 1024,  # 10GB
            max_dbs=10,
            create=True,
            subdir=True
        )
        
        # Create all subdatabases first
        with env:
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
            
            # Add default agents
            logger.info("Adding default agents...")
            with env.begin(write=True) as txn:
                import msgpack
                import uuid
                from datetime import datetime, timezone
                
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
                
                for agent in default_agents:
                    agent_key = agent["id"].encode('utf-8')
                    agent_value = msgpack.packb(agent, use_bin_type=True)
                    txn.put(agent_key, agent_value, db=agent_cards_db)
                
                # Create default session
                session_id = str(uuid.uuid4())
                session_data = {
                    'id': session_id,
                    'title': f"Default Session",
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'session_metadata': {}
                }
                session_key = session_id.encode('utf-8')
                session_value = msgpack.packb(session_data, use_bin_type=True)
                txn.put(session_key, session_value, db=sessions_db)
        
        # Now check if initialization worked by listing agents
        logger.info("Testing agent listing...")
        agents = db_lmdb.list_agent_cards()
        if agents:
            logger.info(f"Successfully listed agents: {[a.get('id') for a in agents]}")
        else:
            logger.warning("No agents returned, but initialization completed")
        
        logger.info("LMDB database initialized successfully")
        return True
        
    except Exception as e:
        logger.error(f"Error initializing LMDB database: {e}", exc_info=True)
        return False
    
if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)