"""
Database initialization script.

This script:
1. Creates the database directory if it doesn't exist
2. Creates all tables using direct SQL
3. Sets up SQLite-specific configurations
4. Adds initial data (like default agent cards)

Usage:
    python -m api_gateway.scripts.init_db
"""

import os
import sys
import json
import sqlite3
import logging
from pathlib import Path
from datetime import datetime, UTC

# Add project root to Python path
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_database():
    """Initialize the database with schema and default data."""
    try:
        # Ensure database directory exists
        db_dir = project_root / "api_gateway" / "chats"
        db_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Database directory ensured at {db_dir}")

        # Create SQLite database
        db_path = db_dir / "chat_database.db"
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Enable foreign keys and WAL mode
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")

        # Create tables
        # Create tables if they don't exist
        cursor.execute("""
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
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id VARCHAR NOT NULL PRIMARY KEY,
                title VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                session_type VARCHAR,
                session_metadata JSON
            );
        """)

        cursor.execute("""
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
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS a2a_tasks (
                id VARCHAR NOT NULL PRIMARY KEY,
                session_id VARCHAR NOT NULL REFERENCES chat_sessions(id),
                title VARCHAR NOT NULL,
                description TEXT,
                status VARCHAR(11) NOT NULL,
                priority VARCHAR(8) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                started_at DATETIME,
                completed_at DATETIME,
                config JSON,
                context JSON,
                result JSON
            );
        """)

        cursor.execute("""
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
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_agents (
                task_id VARCHAR NOT NULL REFERENCES a2a_tasks(id),
                agent_id VARCHAR NOT NULL REFERENCES agent_cards(id),
                PRIMARY KEY (task_id, agent_id)
            );
        """)

        # Add capabilities column if it doesn't exist (safe migration)
        cursor.execute("PRAGMA table_info(agent_cards)")
        columns = cursor.fetchall()
        if not any(col[1] == 'capabilities' for col in columns):
            cursor.execute("""
                ALTER TABLE agent_cards
                ADD COLUMN capabilities JSON DEFAULT '[]';
            """)

        # Create indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS ix_messages_session_id 
            ON messages(session_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS ix_messages_agent_id 
            ON messages(agent_id)
        """)
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS ix_messages_message_uuid 
            ON messages(message_uuid)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS ix_messages_id 
            ON messages(id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_target_agent_id 
            ON shared_contexts(target_agent_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_session_id 
            ON shared_contexts(session_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_expires_at 
            ON shared_contexts(expires_at)
        """)

        # Create default agents
        default_agents = [
            {
                "id": "chloe",
                "name": "Chloe",
                "description": "Git operations and general help",
                "color": "rgb(34, 197, 94)",
                "icon_path": "agents/chloe/src/assets/chloe.svg",
                "capabilities": ["git", "search", "explain"]
            },
            {
                "id": "phil_connors",
                "name": "Phil Connors",
                "description": "Task management and coordination",
                "color": "rgb(249, 115, 22)",
                "icon_path": "agents/phil_connors/src/assets/phil.svg",
                "capabilities": ["task", "coordinate", "plan"]
            }
        ]

        for agent in default_agents:
            cursor.execute("""
                INSERT OR REPLACE INTO agent_cards (
                    id, name, description, color, icon_path, capabilities, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                agent["id"],
                agent["name"],
                agent["description"],
                agent["color"],
                agent["icon_path"],
                json.dumps(agent["capabilities"]),
                True,
                datetime.now(UTC).isoformat()
            ))

        # Create default session
        import uuid
        session_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO chat_sessions (id, created_at)
            VALUES (?, ?)
        """, (session_id, datetime.now(UTC).isoformat()))

        # Commit changes
        conn.commit()
        logger.info("Database initialized successfully")

    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    init_database()
