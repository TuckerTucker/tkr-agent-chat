#!/usr/bin/env python

"""
LMDB Database Health Check Script

This script checks the health and status of the LMDB database.
It verifies integrity, reports stats, and looks for potential issues.

Usage:
    python check_lmdb_health.py [--fix]

Options:
    --fix    Attempt to fix common issues automatically
"""

import sys
import os
import logging
import argparse
import time
from pathlib import Path
from datetime import datetime, timezone

# Add the parent directory to the path
parent_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_dir))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("lmdb_health_check")

try:
    import lmdb
    import msgpack
except ImportError as e:
    logger.error(f"Required package not installed: {e}")
    logger.error("Please install required packages: pip install lmdb msgpack")
    sys.exit(1)

def get_db_path():
    """Get the path to the LMDB database."""
    project_root = parent_dir.parent
    db_path = project_root / "api_gateway" / "chats" / "chat_database"
    return db_path

def check_db_exists(db_path):
    """Check if the database directory and files exist."""
    logger.info(f"Checking database at: {db_path}")
    
    if not db_path.exists():
        logger.error(f"Database directory does not exist: {db_path}")
        return False
        
    data_file = db_path / "data.mdb"
    lock_file = db_path / "lock.mdb"
    
    if not data_file.exists():
        logger.error(f"Data file not found: {data_file}")
        return False
        
    if not lock_file.exists():
        logger.warning(f"Lock file not found: {lock_file}")
        return False
        
    logger.info("Database files exist ✓")
    return True

def check_db_size(db_path):
    """Check the size of the database files."""
    data_file = db_path / "data.mdb"
    lock_file = db_path / "lock.mdb"
    
    data_size = data_file.stat().st_size if data_file.exists() else 0
    lock_size = lock_file.stat().st_size if lock_file.exists() else 0
    
    # Convert to MB
    data_size_mb = data_size / (1024 * 1024)
    lock_size_kb = lock_size / 1024
    
    logger.info(f"Database size: {data_size_mb:.2f} MB (data.mdb), {lock_size_kb:.2f} KB (lock.mdb)")
    
    # Check for potential issues
    if data_size_mb > 5000:  # 5 GB
        logger.warning(f"Database is very large ({data_size_mb:.2f} MB). Consider optimization.")
    elif data_size_mb < 0.1:  # 100 KB
        logger.warning(f"Database is very small ({data_size_mb:.2f} MB). May be empty or corrupted.")
        
    return data_size, lock_size

def check_db_permissions(db_path):
    """Check the permissions of the database files."""
    data_file = db_path / "data.mdb"
    lock_file = db_path / "lock.mdb"
    
    if data_file.exists():
        # Check if we can read and write to the data file
        try:
            # Check read permission
            with open(data_file, "rb") as f:
                f.read(10)
            logger.info("Data file is readable ✓")
        except PermissionError:
            logger.error(f"Cannot read data file: {data_file}")
            return False
    
    return True

def open_db(db_path, readonly=True):
    """Try to open the database."""
    try:
        env = lmdb.Environment(
            path=str(db_path),
            readonly=readonly,
            max_dbs=10,
            map_size=10 * 1024 * 1024 * 1024,  # 10GB
        )
        logger.info("Successfully opened database ✓")
        return env
    except lmdb.Error as e:
        logger.error(f"Error opening database: {e}")
        return None

def check_db_stats(env):
    """Get and check database statistics."""
    try:
        stats = env.stat()
        info = env.info()
        
        logger.info("Database Statistics:")
        logger.info(f"  Page size: {stats['psize']} bytes")
        logger.info(f"  Number of entries: {stats['entries']}")
        logger.info(f"  Branch pages: {stats['branch_pages']}")
        logger.info(f"  Leaf pages: {stats['leaf_pages']}")
        logger.info(f"  Overflow pages: {stats['overflow_pages']}")
        
        logger.info("Environment Info:")
        logger.info(f"  Map size: {info['map_size'] / (1024 * 1024 * 1024):.2f} GB")
        logger.info(f"  Last transaction ID: {info['last_txnid']}")
        
        # Check map usage
        map_used_pct = info['map_addr'] / info['map_size'] * 100 if info['map_size'] > 0 else 0
        logger.info(f"  Map usage: {map_used_pct:.2f}%")
        
        if map_used_pct > 80:
            logger.warning(f"Database map usage is high ({map_used_pct:.2f}%). Consider increasing map size.")
            
        return stats, info
    except lmdb.Error as e:
        logger.error(f"Error getting database stats: {e}")
        return None, None

def check_record_counts(env):
    """Count records in each database."""
    try:
        with env.begin() as txn:
            # Get all named databases
            dbs = {
                'sessions': env.open_db(b'sessions', txn=txn),
                'messages': env.open_db(b'messages', txn=txn),
                'message_by_session': env.open_db(b'message_by_session', txn=txn),
                'message_by_agent': env.open_db(b'message_by_agent', txn=txn),
                'agent_cards': env.open_db(b'agent_cards', txn=txn),
                'shared_contexts': env.open_db(b'shared_contexts', txn=txn),
                'context_by_session': env.open_db(b'context_by_session', txn=txn),
                'a2a_tasks': env.open_db(b'a2a_tasks', txn=txn),
                'task_agents': env.open_db(b'task_agents', txn=txn),
            }
            
            # Count entries in each database
            counts = {}
            for name, db in dbs.items():
                cursor = txn.cursor(db=db)
                count = 0
                for _ in cursor:
                    count += 1
                counts[name] = count
                
            logger.info("Record counts by database:")
            for name, count in counts.items():
                logger.info(f"  {name}: {count} records")
                
            return counts
    except lmdb.Error as e:
        logger.error(f"Error counting records: {e}")
        return None

def check_database_data(env):
    """Sample some data from the database to verify it's valid."""
    try:
        with env.begin() as txn:
            # Check sessions
            sessions_db = env.open_db(b'sessions', txn=txn)
            cursor = txn.cursor(db=sessions_db)
            
            # Get up to 5 sessions
            sessions = []
            count = 0
            for key, value in cursor:
                if count >= 5:
                    break
                try:
                    session_data = msgpack.unpackb(value, raw=False)
                    sessions.append(session_data)
                    count += 1
                except Exception as e:
                    logger.error(f"Error unpacking session data: {e}")
                    
            if sessions:
                logger.info(f"Successfully read {len(sessions)} sessions ✓")
                logger.info(f"Sample session ID: {sessions[0].get('id', 'UNKNOWN')}")
            else:
                logger.warning("No sessions found in database")
                
            # Check messages
            messages_db = env.open_db(b'messages', txn=txn)
            cursor = txn.cursor(db=messages_db)
            
            # Get up to 5 messages
            messages = []
            count = 0
            for key, value in cursor:
                if count >= 5:
                    break
                try:
                    message_data = msgpack.unpackb(value, raw=False)
                    messages.append(message_data)
                    count += 1
                except Exception as e:
                    logger.error(f"Error unpacking message data: {e}")
                    
            if messages:
                logger.info(f"Successfully read {len(messages)} messages ✓")
                logger.info(f"Sample message UUID: {messages[0].get('message_uuid', 'UNKNOWN')}")
            else:
                logger.warning("No messages found in database")
                
            return len(sessions) > 0 and len(messages) > 0
    except lmdb.Error as e:
        logger.error(f"Error checking database data: {e}")
        return False

def fix_common_issues(db_path):
    """Attempt to fix common database issues."""
    logger.info("Attempting to fix common database issues...")
    
    # Try to repair directory permissions
    try:
        os.chmod(str(db_path), 0o755)
        logger.info("Updated database directory permissions")
    except Exception as e:
        logger.error(f"Error updating directory permissions: {e}")
    
    # Check for and remove any stale lock files
    lock_file = db_path / "lock.mdb"
    if lock_file.exists():
        try:
            # Check if the lock file is stale (older than 1 hour)
            mtime = lock_file.stat().st_mtime
            now = time.time()
            if now - mtime > 3600:  # 1 hour
                logger.warning(f"Found stale lock file (last modified {datetime.fromtimestamp(mtime)})")
                
                # Backup the lock file
                backup_path = lock_file.with_name(f"lock.mdb.backup_{int(now)}")
                logger.info(f"Backing up lock file to {backup_path}")
                import shutil
                shutil.copy2(lock_file, backup_path)
                
                # Remove the lock file
                os.chmod(str(lock_file), 0o644)  # Make writable
                logger.info("Removing stale lock file...")
                lock_file.unlink()
                logger.info("Stale lock file removed")
        except Exception as e:
            logger.error(f"Error handling lock file: {e}")
    
    logger.info("Fix attempts completed")
    
def main():
    parser = argparse.ArgumentParser(description="Check LMDB database health")
    parser.add_argument("--fix", action="store_true", help="Attempt to fix common issues")
    args = parser.parse_args()
    
    logger.info("=== LMDB Database Health Check ===")
    logger.info(f"Starting check at: {datetime.now(timezone.utc).isoformat()}")
    
    # Get database path
    db_path = get_db_path()
    
    # Basic file checks
    if not check_db_exists(db_path):
        if args.fix:
            logger.info("Database doesn't exist. Use scripts/init_lmdb.sh to initialize it.")
        return 1
    
    # Check file sizes
    check_db_size(db_path)
    
    # Check permissions
    if not check_db_permissions(db_path):
        if args.fix:
            fix_common_issues(db_path)
        return 1
    
    # Try to open the database
    env = open_db(db_path, readonly=True)
    if not env:
        if args.fix:
            fix_common_issues(db_path)
        return 1
    
    # Check database stats
    check_db_stats(env)
    
    # Count records
    check_record_counts(env)
    
    # Check data
    check_database_data(env)
    
    # Close the environment
    env.close()
    
    logger.info("=== Health Check Completed ===")
    return 0

if __name__ == "__main__":
    sys.exit(main())