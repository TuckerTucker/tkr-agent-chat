"""
Direct SQL database operations for the API Gateway.

This module provides:
- Database connection management
- Helper functions for SQL operations
- CRUD operations for all models
"""

import sqlite3
import json
import uuid
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Define the project root relative to this file's location
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "api_gateway" / "chats" / "chat_database.db"

# Ensure the 'chats' directory exists
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

@contextmanager
def get_connection():
    """Context manager for database connections."""
    conn = sqlite3.connect(str(DEFAULT_DB_PATH))
    conn.row_factory = sqlite3.Row  # Return rows as dict-like objects
    
    # Enable foreign keys and WAL mode
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")  # Wait up to 5 seconds if database is locked
    
    try:
        # Begin transaction
        conn.execute("BEGIN")
        yield conn
        # Commit transaction if no exception occurred
        conn.commit()
    except Exception:
        # Rollback transaction on error
        conn.rollback()
        raise
    finally:
        conn.close()

def dict_to_params(data: Dict) -> Tuple[str, str, Tuple]:
    """Convert a dict to SQL parameters for INSERT/UPDATE."""
    columns = ', '.join(data.keys())
    placeholders = ', '.join(['?' for _ in data.keys()])
    values = tuple(json.dumps(v) if isinstance(v, (dict, list)) else v for v in data.values())
    return columns, placeholders, values

def row_to_dict(row) -> Optional[Dict]:
    """Convert a sqlite3.Row to a dict, parsing JSON fields."""
    if row is None:
        return None
    result = dict(row)
    # Parse JSON fields
    for key, value in result.items():
        if isinstance(value, str) and (value.startswith('{') or value.startswith('[')):
            try:
                result[key] = json.loads(value)
            except json.JSONDecodeError:
                pass
    return result

# --- Agent Card Operations ---

def get_agent_card(agent_id: str) -> Optional[Dict]:
    """Get an agent card by ID."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM agent_cards WHERE id = ?",
            (agent_id,)
        )
        return row_to_dict(cursor.fetchone())

def list_agent_cards() -> List[Dict]:
    """List all agent cards."""
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM agent_cards")
        return [row_to_dict(row) for row in cursor.fetchall()]

def create_agent_card(data: Dict) -> Dict:
    """Create a new agent card."""
    with get_connection() as conn:
        columns, placeholders, values = dict_to_params(data)
        cursor = conn.execute(
            f"INSERT INTO agent_cards ({columns}) VALUES ({placeholders})",
            values
        )
        conn.commit()
        return get_agent_card(data['id'])

def update_agent_card(agent_id: str, data: Dict) -> Optional[Dict]:
    """Update an agent card."""
    with get_connection() as conn:
        set_clause = ', '.join([f"{k} = ?" for k in data.keys()])
        values = tuple(json.dumps(v) if isinstance(v, (dict, list)) else v for v in data.values())
        cursor = conn.execute(
            f"UPDATE agent_cards SET {set_clause} WHERE id = ?",
            values + (agent_id,)
        )
        conn.commit()
        return get_agent_card(agent_id) if cursor.rowcount > 0 else None

# --- Chat Session Operations ---

def create_session(title: Optional[str] = None, session_id: Optional[str] = None) -> Dict:
    """Create a new chat session."""
    now = datetime.utcnow().isoformat()
    data = {
        'id': session_id or str(uuid.uuid4()),
        'title': title or f"Chat Session {now}",
        'created_at': now,
        'session_metadata': json.dumps({})
    }
    
    with get_connection() as conn:
        columns, placeholders, values = dict_to_params(data)
        conn.execute(
            f"INSERT INTO chat_sessions ({columns}) VALUES ({placeholders})",
            values
        )
        conn.commit()
        return get_session(data['id'])

def get_session(session_id: str) -> Optional[Dict]:
    """Get a chat session by ID."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM chat_sessions WHERE id = ?",
            (session_id,)
        )
        return row_to_dict(cursor.fetchone())

def list_sessions(skip: int = 0, limit: int = 100) -> List[Dict]:
    """List chat sessions with pagination."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM chat_sessions ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, skip)
        )
        return [row_to_dict(row) for row in cursor.fetchall()]

def delete_session(session_id: str) -> bool:
    """Delete a chat session and its associated messages."""
    with get_connection() as conn:
        # Delete messages first due to foreign key constraint
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        cursor = conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        return cursor.rowcount > 0

# --- Message Operations ---

def create_message(data: Dict) -> Dict:
    """Create a new message."""
    with get_connection() as conn:
        if 'message_uuid' not in data:
            data['message_uuid'] = str(uuid.uuid4())
        if 'created_at' not in data:
            data['created_at'] = datetime.utcnow().isoformat()
            
        columns, placeholders, values = dict_to_params(data)
        cursor = conn.execute(
            f"INSERT INTO messages ({columns}) VALUES ({placeholders})",
            values
        )
        conn.commit()
        return get_message(data['message_uuid'])

def get_message(message_uuid: str) -> Optional[Dict]:
    """Get a message by UUID."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM messages WHERE message_uuid = ?",
            (message_uuid,)
        )
        return row_to_dict(cursor.fetchone())

def get_session_messages(session_id: str, skip: int = 0, limit: int = 1000) -> List[Dict]:
    """Get messages for a specific session."""
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT * FROM messages 
            WHERE session_id = ? 
            ORDER BY created_at ASC
            LIMIT ? OFFSET ?
            """,
            (session_id, limit, skip)
        )
        return [row_to_dict(row) for row in cursor.fetchall()]

# --- Shared Context Operations ---

def create_shared_context(data: Dict) -> Dict:
    """Create a new shared context."""
    with get_connection() as conn:
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
        if 'created_at' not in data:
            data['created_at'] = datetime.utcnow().isoformat()
            
        columns, placeholders, values = dict_to_params(data)
        cursor = conn.execute(
            f"INSERT INTO shared_contexts ({columns}) VALUES ({placeholders})",
            values
        )
        conn.commit()
        return get_shared_context(data['id'])

def get_shared_context(context_id: str) -> Optional[Dict]:
    """Get a shared context by ID."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM shared_contexts WHERE id = ?",
            (context_id,)
        )
        return row_to_dict(cursor.fetchone())

def get_agent_contexts(agent_id: str, as_target: bool = True) -> List[Dict]:
    """Get shared contexts for an agent."""
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT * FROM shared_contexts 
            WHERE ? = CASE WHEN ? THEN target_agent_id ELSE source_agent_id END
            ORDER BY created_at DESC
            """,
            (agent_id, as_target)
        )
        return [row_to_dict(row) for row in cursor.fetchall()]

def get_session_contexts(session_id: str) -> List[Dict]:
    """Get shared contexts for a session."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM shared_contexts WHERE session_id = ? ORDER BY created_at DESC",
            (session_id,)
        )
        return [row_to_dict(row) for row in cursor.fetchall()]

def delete_expired_contexts() -> int:
    """Delete expired shared contexts."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM shared_contexts WHERE expires_at < datetime('now')"
        )
        conn.commit()
        return cursor.rowcount

# --- Task Operations ---

def create_task(data: Dict) -> Dict:
    """Create a new A2A task."""
    with get_connection() as conn:
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
        if 'created_at' not in data:
            data['created_at'] = datetime.utcnow().isoformat()
            
        columns, placeholders, values = dict_to_params(data)
        cursor = conn.execute(
            f"INSERT INTO a2a_tasks ({columns}) VALUES ({placeholders})",
            values
        )
        conn.commit()
        return get_task(data['id'])

def get_task(task_id: str) -> Optional[Dict]:
    """Get a task by ID."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM a2a_tasks WHERE id = ?",
            (task_id,)
        )
        task = row_to_dict(cursor.fetchone())
        if task:
            # Get associated agents
            cursor = conn.execute(
                """
                SELECT a.* FROM agent_cards a
                JOIN task_agents ta ON a.id = ta.agent_id
                WHERE ta.task_id = ?
                """,
                (task_id,)
            )
            task['agents'] = [row_to_dict(row) for row in cursor.fetchall()]
        return task

def update_task(task_id: str, data: Dict) -> Optional[Dict]:
    """Update a task."""
    with get_connection() as conn:
        set_clause = ', '.join([f"{k} = ?" for k in data.keys()])
        values = tuple(json.dumps(v) if isinstance(v, (dict, list)) else v for v in data.values())
        cursor = conn.execute(
            f"UPDATE a2a_tasks SET {set_clause} WHERE id = ?",
            values + (task_id,)
        )
        conn.commit()
        return get_task(task_id) if cursor.rowcount > 0 else None

def get_agent_tasks(agent_id: str, status: Optional[str] = None) -> List[Dict]:
    """Get tasks for a specific agent."""
    with get_connection() as conn:
        query = """
            SELECT t.* FROM a2a_tasks t
            JOIN task_agents ta ON t.id = ta.task_id
            WHERE ta.agent_id = ?
        """
        params = [agent_id]
        
        if status:
            query += " AND t.status = ?"
            params.append(status)
            
        cursor = conn.execute(query, tuple(params))
        return [row_to_dict(row) for row in cursor.fetchall()]

def get_session_tasks(session_id: str, include_completed: bool = False) -> List[Dict]:
    """Get tasks for a chat session."""
    with get_connection() as conn:
        query = "SELECT * FROM a2a_tasks WHERE session_id = ?"
        params = [session_id]
        
        if not include_completed:
            query += " AND status IN ('pending', 'in_progress')"
            
        cursor = conn.execute(query, tuple(params))
        return [row_to_dict(row) for row in cursor.fetchall()]

def link_task_agents(task_id: str, agent_ids: List[str]) -> None:
    """Link agents to a task."""
    with get_connection() as conn:
        # First verify all agents exist
        placeholders = ','.join(['?' for _ in agent_ids])
        cursor = conn.execute(
            f"SELECT id FROM agent_cards WHERE id IN ({placeholders})",
            tuple(agent_ids)
        )
        found_agents = {row[0] for row in cursor.fetchall()}
        missing = set(agent_ids) - found_agents
        if missing:
            raise ValueError(f"Agents not found: {missing}")
            
        # Link agents to task
        for agent_id in agent_ids:
            conn.execute(
                "INSERT OR IGNORE INTO task_agents (task_id, agent_id) VALUES (?, ?)",
                (task_id, agent_id)
            )
        conn.commit()

# --- Context Operations ---

def share_context(data: Dict) -> Dict:
    """Create a new shared context."""
    with get_connection() as conn:
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
        if 'created_at' not in data:
            data['created_at'] = datetime.utcnow().isoformat()
            
        columns, placeholders, values = dict_to_params(data)
        cursor = conn.execute(
            f"INSERT INTO shared_contexts ({columns}) VALUES ({placeholders})",
            values
        )
        conn.commit()
        return get_shared_context(data['id'])

def get_shared_contexts(
    target_agent_id: str,
    session_id: Optional[str] = None,
    source_agent_id: Optional[str] = None,
    include_expired: bool = False
) -> List[Dict]:
    """Get shared contexts for an agent."""
    with get_connection() as conn:
        query = """
            SELECT * FROM shared_contexts 
            WHERE target_agent_id = ?
        """
        params = [target_agent_id]
        
        if session_id:
            query += " AND session_id = ?"
            params.append(session_id)
            
        if source_agent_id:
            query += " AND source_agent_id = ?"
            params.append(source_agent_id)
            
        if not include_expired:
            query += " AND (expires_at IS NULL OR expires_at > datetime('now'))"
            
        cursor = conn.execute(query, tuple(params))
        return [row_to_dict(row) for row in cursor.fetchall()]

def update_shared_context(context_id: str, data: Dict) -> Optional[Dict]:
    """Update a shared context."""
    with get_connection() as conn:
        set_clause = ', '.join([f"{k} = ?" for k in data.keys()])
        values = tuple(json.dumps(v) if isinstance(v, (dict, list)) else v for v in data.values())
        cursor = conn.execute(
            f"UPDATE shared_contexts SET {set_clause} WHERE id = ?",
            values + (context_id,)
        )
        conn.commit()
        return get_shared_context(context_id) if cursor.rowcount > 0 else None

def extend_context_ttl(context_id: str, additional_minutes: int) -> Optional[Dict]:
    """Extend the TTL of a shared context."""
    with get_connection() as conn:
        # Get current context
        cursor = conn.execute(
            """
            SELECT expires_at FROM shared_contexts 
            WHERE id = ?
            """,
            (context_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None
            
        # Calculate new expiry
        current_time = datetime.utcnow()
        base_time = max(
            current_time,
            datetime.fromisoformat(row['expires_at']) if row['expires_at'] else current_time
        )
        new_expiry = base_time + timedelta(minutes=additional_minutes)
        
        # Update context
        cursor = conn.execute(
            """
            UPDATE shared_contexts 
            SET expires_at = ?, 
                context_metadata = json_set(
                    COALESCE(context_metadata, '{}'),
                    '$.ttl_extended_at',
                    ?,
                    '$.ttl_extension',
                    ?
                )
            WHERE id = ?
            """,
            (new_expiry.isoformat(), current_time.isoformat(), additional_minutes, context_id)
        )
        conn.commit()
        return get_shared_context(context_id) if cursor.rowcount > 0 else None

def cleanup_expired_contexts(batch_size: int = 100) -> int:
    """Clean up expired shared contexts in batches."""
    with get_connection() as conn:
        cursor = conn.execute(
            """
            DELETE FROM shared_contexts 
            WHERE id IN (
                SELECT id FROM shared_contexts 
                WHERE expires_at <= datetime('now')
                LIMIT ?
            )
            """,
            (batch_size,)
        )
        conn.commit()
        return cursor.rowcount

# --- Database Initialization ---

def init_database():
    """Initialize the database with schema."""
    with get_connection() as conn:
        # Create tables using the schema from init_db.py
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS agent_cards (
                id VARCHAR NOT NULL PRIMARY KEY,
                name VARCHAR NOT NULL,
                description TEXT,
                color VARCHAR,
                icon_path VARCHAR,
                is_active BOOLEAN,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                config JSON,
                capabilities JSON DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS chat_sessions (
                id VARCHAR NOT NULL PRIMARY KEY,
                title VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                session_type VARCHAR,
                session_metadata JSON
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER NOT NULL PRIMARY KEY,
                message_uuid VARCHAR UNIQUE,
                session_id VARCHAR NOT NULL REFERENCES chat_sessions(id),
                type VARCHAR(6) NOT NULL,
                role VARCHAR(11),
                agent_id VARCHAR REFERENCES agent_cards(id),
                parts JSON NOT NULL,
                message_metadata JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                in_reply_to VARCHAR REFERENCES messages(message_uuid),
                context_refs JSON,
                capabilities_used JSON
            );

            CREATE TABLE IF NOT EXISTS shared_contexts (
                id VARCHAR NOT NULL PRIMARY KEY,
                session_id VARCHAR REFERENCES chat_sessions(id),
                source_agent_id VARCHAR REFERENCES agent_cards(id),
                target_agent_id VARCHAR REFERENCES agent_cards(id),
                context_type VARCHAR CHECK (context_type IN ('full', 'relevant', 'summary')),
                content JSON,
                context_metadata JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME
            );

            CREATE INDEX IF NOT EXISTS ix_messages_session_id ON messages(session_id);
            CREATE INDEX IF NOT EXISTS ix_messages_agent_id ON messages(agent_id);
            CREATE UNIQUE INDEX IF NOT EXISTS ix_messages_message_uuid ON messages(message_uuid);
            CREATE INDEX IF NOT EXISTS ix_messages_id ON messages(id);
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_target_agent_id ON shared_contexts(target_agent_id);
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_session_id ON shared_contexts(session_id);
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_expires_at ON shared_contexts(expires_at);
        """)
        
        logger.info("Database schema initialized successfully")
