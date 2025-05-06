"""
Database factory module that loads the LMDB database implementation.
SQLite support has been removed.
"""

import os
import logging
import shutil
from pathlib import Path
from typing import Dict, List, Any, Optional, Union

# Set up logging
logger = logging.getLogger(__name__)

# Define the project root and database paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
LEGACY_SQLITE_PATH = PROJECT_ROOT / "api_gateway" / "chats" / "chat_database.db"
LMDB_PATH = PROJECT_ROOT / "api_gateway" / "chats" / "chat_database"
BACKUP_DIR = PROJECT_ROOT / "api_gateway" / "chats" / "backups"

# Check for legacy SQLite database file
if LEGACY_SQLITE_PATH.exists():
    logger.warning(f"Found legacy SQLite database at {LEGACY_SQLITE_PATH}")
    # Create backup directory if needed
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Create a backup of the SQLite DB before proceeding
    try:
        backup_path = BACKUP_DIR / f"sqlite_backup_{LEGACY_SQLITE_PATH.name}"
        logger.info(f"Creating backup of SQLite database at {backup_path}")
        shutil.copy2(LEGACY_SQLITE_PATH, backup_path)
        
        # Consider moving the SQLite file aside instead of deleting
        moved_path = LEGACY_SQLITE_PATH.with_suffix(".db.bak")
        logger.info(f"Moving SQLite database to {moved_path}")
        shutil.move(LEGACY_SQLITE_PATH, moved_path)
        logger.info("Legacy SQLite database has been backed up and moved aside")
    except Exception as e:
        logger.error(f"Error handling legacy SQLite file: {e}")
        logger.warning("Will attempt to continue with LMDB initialization")

# Use LMDB only now
logger.info("Using LMDB database module exclusively")
try:
    from . import db_lmdb as db
    logger.info("Successfully imported LMDB database module")
except ImportError as e:
    logger.error(f"Critical error importing LMDB database module: {e}")
    raise ImportError("LMDB database module could not be imported. Please ensure lmdb package is installed.")

# Export all functions from the selected database module
init_database = db.init_database

# Agent card operations
get_agent_card = db.get_agent_card
list_agent_cards = db.list_agent_cards
create_agent_card = db.create_agent_card
update_agent_card = db.update_agent_card

# Session operations
create_session = db.create_session
get_session = db.get_session
list_sessions = db.list_sessions
update_session = db.update_session
delete_session = db.delete_session

# Message operations
get_message_by_uuid = db.get_message_by_uuid
create_message = db.create_message
get_message = db.get_message
trim_session_messages = db.trim_session_messages
get_session_messages = db.get_session_messages

# Shared context operations
create_shared_context = db.create_shared_context
get_shared_context = db.get_shared_context
get_agent_contexts = db.get_agent_contexts
get_session_contexts = db.get_session_contexts
delete_expired_contexts = db.delete_expired_contexts
get_shared_contexts = db.get_shared_contexts
update_shared_context = db.update_shared_context
extend_context_ttl = db.extend_context_ttl
cleanup_expired_contexts = db.cleanup_expired_contexts
share_context = db.share_context

# Task operations
create_task = db.create_task
get_task = db.get_task
update_task = db.update_task
get_agent_tasks = db.get_agent_tasks
get_session_tasks = db.get_session_tasks
link_task_agents = db.link_task_agents

# Function to determine current database status
def get_database_info() -> Dict[str, Any]:
    """Return information about the current database configuration."""
    return {
        "type": "lmdb",
        "implementation": db.__name__,
        "path": str(db.DEFAULT_DB_PATH),
        "loaded_successfully": True,
    }