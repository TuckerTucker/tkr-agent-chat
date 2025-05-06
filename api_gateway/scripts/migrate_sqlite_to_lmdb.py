#!/usr/bin/env python

"""
SQLite to LMDB Migration Script

This script migrates data from SQLite to LMDB format for the chat system.
After migration, the system will exclusively use LMDB as SQLite support has been removed.

Usage:
    python migrate_sqlite_to_lmdb.py

Notes:
    - IMPORTANT: This is a one-time migration script. After running it, SQLite will no longer be used.
    - Performs a one-way migration from SQLite to LMDB
    - Does not modify the original SQLite database
    - Can be run multiple times safely (will skip existing records)
    - After migration, the .env file will be updated to use LMDB exclusively
"""

import sys
import logging
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime, timezone
import json

# Add parent directory to sys.path to import db modules
parent_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_dir))  # Add api_gateway to path

# Define the project root for consistent path resolution
PROJECT_ROOT = parent_dir.parent
logger.info(f"Project root: {PROJECT_ROOT}")
logger.info(f"API Gateway directory: {parent_dir}")

try:
    # Import both database modules from the src package
    from src import db  # SQLite module
    from src import db_lmdb  # LMDB module
    logger.info("Successfully imported database modules")
except ImportError as e:
    logger.error(f"Failed to import database modules: {e}")
    logger.error("Make sure you're running this script from the api_gateway directory")
    sys.exit(1)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("migrate_sqlite_to_lmdb")

# Connect to SQLite database
@contextmanager
def get_sqlite_connection():
    """Context manager for SQLite database connections."""
    conn = sqlite3.connect(str(db.DEFAULT_DB_PATH))
    conn.row_factory = sqlite3.Row  # Return rows as dict-like objects
    
    try:
        yield conn
    finally:
        conn.close()

def migrate_agent_cards():
    """Migrate agent cards from SQLite to LMDB."""
    logger.info("Migrating agent cards...")
    
    with get_sqlite_connection() as conn:
        cursor = conn.execute("SELECT * FROM agent_cards")
        agent_cards = [dict(row) for row in cursor.fetchall()]
        
    logger.info(f"Found {len(agent_cards)} agent cards in SQLite database")
    
    # Migrate each agent card
    migrated_count = 0
    skipped_count = 0
    for agent in agent_cards:
        agent_id = agent["id"]
        
        # Check if already exists in LMDB
        existing_agent = db_lmdb.get_agent_card(agent_id)
        if existing_agent:
            skipped_count += 1
            continue
            
        # Parse JSON fields if needed
        for key, value in agent.items():
            if isinstance(value, str) and (value.startswith('{') or value.startswith('[')):
                try:
                    agent[key] = json.loads(value)
                except json.JSONDecodeError:
                    pass
                    
        # Create agent in LMDB
        db_lmdb.create_agent_card(agent)
        migrated_count += 1
        
    logger.info(f"Migrated {migrated_count} agent cards, skipped {skipped_count} existing records")
    return migrated_count

def migrate_sessions():
    """Migrate chat sessions from SQLite to LMDB."""
    logger.info("Migrating chat sessions...")
    
    with get_sqlite_connection() as conn:
        cursor = conn.execute("SELECT * FROM chat_sessions")
        sessions = [dict(row) for row in cursor.fetchall()]
        
    logger.info(f"Found {len(sessions)} chat sessions in SQLite database")
    
    # Migrate each session
    migrated_count = 0
    skipped_count = 0
    for session in sessions:
        session_id = session["id"]
        
        # Check if already exists in LMDB
        existing_session = db_lmdb.get_session(session_id)
        if existing_session:
            skipped_count += 1
            continue
            
        # Parse JSON fields if needed
        for key, value in session.items():
            if isinstance(value, str) and (value.startswith('{') or value.startswith('[')):
                try:
                    session[key] = json.loads(value)
                except json.JSONDecodeError:
                    pass
                    
        # Create session in LMDB
        db_lmdb.create_session(title=session.get("title"), session_id=session_id)
        
        # Update with additional fields
        db_lmdb.update_session(session_id, {
            k: v for k, v in session.items() 
            if k not in ["id", "title", "created_at"] and v is not None
        })
        
        migrated_count += 1
        
    logger.info(f"Migrated {migrated_count} chat sessions, skipped {skipped_count} existing records")
    return migrated_count

def migrate_messages():
    """Migrate messages from SQLite to LMDB."""
    logger.info("Migrating messages...")
    
    with get_sqlite_connection() as conn:
        cursor = conn.execute("SELECT * FROM messages ORDER BY created_at ASC")
        messages = [dict(row) for row in cursor.fetchall()]
        
    logger.info(f"Found {len(messages)} messages in SQLite database")
    
    # Migrate each message
    migrated_count = 0
    skipped_count = 0
    error_count = 0
    for msg in messages:
        message_uuid = msg["message_uuid"]
        
        # Check if already exists in LMDB
        existing_message = db_lmdb.get_message(message_uuid)
        if existing_message:
            skipped_count += 1
            continue
            
        try:
            # Parse JSON fields
            parts = json.loads(msg["parts"]) if isinstance(msg["parts"], str) else msg["parts"]
            message_metadata = json.loads(msg["message_metadata"]) if isinstance(msg["message_metadata"], str) and msg["message_metadata"] else {}
            context_refs = json.loads(msg["context_refs"]) if isinstance(msg["context_refs"], str) and msg["context_refs"] else None
            capabilities_used = json.loads(msg["capabilities_used"]) if isinstance(msg["capabilities_used"], str) and msg["capabilities_used"] else None
            
            # Prepare data for LMDB
            message_data = {
                "message_uuid": message_uuid,
                "session_id": msg["session_id"],
                "type": msg["type"],
                "role": msg["role"],
                "agent_id": msg["agent_id"],
                "parts": parts,
                "message_metadata": message_metadata,
                "created_at": msg["created_at"],
                "updated_at": msg["updated_at"],
                "in_reply_to": msg["in_reply_to"],
                "context_refs": context_refs,
                "capabilities_used": capabilities_used
            }
            
            # Create message in LMDB
            db_lmdb.create_message(message_data)
            migrated_count += 1
            
            # Log progress periodically
            if migrated_count % 100 == 0:
                logger.info(f"Migrated {migrated_count} messages so far...")
                
        except Exception as e:
            logger.error(f"Error migrating message {message_uuid}: {e}")
            error_count += 1
        
    logger.info(f"Migrated {migrated_count} messages, skipped {skipped_count} existing records, {error_count} errors")
    return migrated_count

def migrate_shared_contexts():
    """Migrate shared contexts from SQLite to LMDB."""
    logger.info("Migrating shared contexts...")
    
    with get_sqlite_connection() as conn:
        cursor = conn.execute("SELECT * FROM shared_contexts")
        contexts = [dict(row) for row in cursor.fetchall()]
        
    logger.info(f"Found {len(contexts)} shared contexts in SQLite database")
    
    # Migrate each context
    migrated_count = 0
    skipped_count = 0
    error_count = 0
    for ctx in contexts:
        context_id = ctx["id"]
        
        # Check if already exists in LMDB
        existing_context = db_lmdb.get_shared_context(context_id)
        if existing_context:
            skipped_count += 1
            continue
            
        try:
            # Parse JSON fields
            content = json.loads(ctx["content"]) if isinstance(ctx["content"], str) else ctx["content"]
            context_metadata = json.loads(ctx["context_metadata"]) if isinstance(ctx["context_metadata"], str) and ctx["context_metadata"] else {}
            
            # Prepare data for LMDB
            context_data = {
                "id": context_id,
                "session_id": ctx["session_id"],
                "source_agent_id": ctx["source_agent_id"],
                "target_agent_id": ctx["target_agent_id"],
                "context_type": ctx["context_type"],
                "content": content,
                "context_metadata": context_metadata,
                "created_at": ctx["created_at"],
                "expires_at": ctx["expires_at"]
            }
            
            # Create context in LMDB
            db_lmdb.create_shared_context(context_data)
            migrated_count += 1
                
        except Exception as e:
            logger.error(f"Error migrating context {context_id}: {e}")
            error_count += 1
        
    logger.info(f"Migrated {migrated_count} shared contexts, skipped {skipped_count} existing records, {error_count} errors")
    return migrated_count

def set_lmdb_in_env():
    """Update the .env file to use LMDB exclusively."""
    try:
        # Find the .env file in the project root
        env_file_path = Path(project_root / ".env")
        
        env_vars = {}
        if env_file_path.exists():
            with open(env_file_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        env_vars[key.strip()] = value.strip()
        
        # Set DB_TYPE to lmdb
        env_vars["DB_TYPE"] = "lmdb"
        
        # Remove SQLite related DATABASE_URL if it exists
        if "DATABASE_URL" in env_vars:
            del env_vars["DATABASE_URL"]
        
        # Write the updated .env file
        with open(env_file_path, "w") as f:
            for key, value in env_vars.items():
                f.write(f"{key}={value}\n")
                
        logger.info(f"Updated .env file to use LMDB exclusively")
        return True
    except Exception as e:
        logger.error(f"Error updating .env file: {e}")
        return False

def main():
    """Run the full migration."""
    start_time = datetime.now(timezone.utc)
    logger.info("Starting SQLite to LMDB migration...")
    
    # Initialize LMDB database
    db_lmdb.init_database()
    logger.info("LMDB database initialized")
    
    # Run migration functions in order
    agent_count = migrate_agent_cards()
    session_count = migrate_sessions()
    message_count = migrate_messages()
    context_count = migrate_shared_contexts()
    
    # Calculate total
    total_migrated = agent_count + session_count + message_count + context_count
    
    # Log completion
    end_time = datetime.now(timezone.utc)
    duration = (end_time - start_time).total_seconds()
    logger.info(f"Migration completed in {duration:.2f} seconds")
    logger.info(f"Total records migrated: {total_migrated}")
    logger.info(f"- Agent cards: {agent_count}")
    logger.info(f"- Chat sessions: {session_count}")
    logger.info(f"- Messages: {message_count}")
    logger.info(f"- Shared contexts: {context_count}")
    
    # Test the migration
    logger.info("Testing the migration results...")
    
    # Check a few random items
    lmdb_agents = db_lmdb.list_agent_cards()
    lmdb_sessions = db_lmdb.list_sessions(limit=1000)  # Get all sessions
    
    logger.info(f"LMDB database now contains:")
    logger.info(f"- {len(lmdb_agents)} agent cards")
    logger.info(f"- {len(lmdb_sessions)} chat sessions")
    
    # Update .env file to use LMDB exclusively
    if set_lmdb_in_env():
        logger.info("Updated environment settings to use LMDB exclusively")
    else:
        logger.warning("Failed to update environment settings - please manually set DB_TYPE=lmdb in .env file")
    
    logger.info("Migration completed successfully!")
    logger.info("IMPORTANT: SQLite support has been removed. The system will now use LMDB exclusively.")

if __name__ == "__main__":
    main()