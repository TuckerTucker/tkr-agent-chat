"""
Database initialization script.

This script:
1. Creates the database directory if it doesn't exist
2. Runs Alembic migrations to set up the schema
3. Adds initial data (like default agent cards)

Usage:
    python -m api_gateway.scripts.init_db
"""

import os
import sys
import asyncio
import logging
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from sqlalchemy.ext.asyncio import AsyncSession
from api_gateway.database import init_db, AsyncSessionLocal
from api_gateway.models.agent_tasks import AgentCard
from alembic.config import Config
from alembic import command

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def create_default_agents(session: AsyncSession):
    """Create default agent cards in the database."""
    default_agents = [
        {
            "id": "chloe",
            "name": "Chloe",
            "description": "Git operations and general help",
            "color": "rgb(34 197 94)",
            "icon_path": "agents/chloe/src/assets/chloe.svg",
            "capabilities": {"git", "search", "explain"}
        },
        {
            "id": "phil_connors",
            "name": "Phil Connors",
            "description": "Task management and coordination",
            "color": "rgb(249 115 22)",
            "icon_path": "agents/phil_connors/src/assets/phil.svg",
            "capabilities": {"task", "coordinate", "plan"}
        }
    ]

    for agent_data in default_agents:
        # Check if agent already exists
        existing = await session.get(AgentCard, agent_data["id"])
        if not existing:
            agent = AgentCard(
                id=agent_data["id"],
                name=agent_data["name"],
                description=agent_data["description"],
                color=agent_data["color"],
                icon_path=agent_data["icon_path"],
                capabilities=agent_data["capabilities"]
            )
            session.add(agent)
            logger.info(f"Created agent card for {agent_data['name']}")
        else:
            logger.info(f"Agent card for {agent_data['name']} already exists")

    await session.commit()

async def init_database():
    """Initialize the database with schema and default data."""
    try:
        # Ensure database directory exists
        db_dir = project_root / "api_gateway" / "chats"
        db_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Database directory ensured at {db_dir}")

        # Initialize database tables
        await init_db()
        logger.info("Database tables initialized")

        # Run Alembic migrations
        alembic_cfg = Config(project_root / "api_gateway" / "alembic.ini")
        command.upgrade(alembic_cfg, "head")
        logger.info("Alembic migrations applied")

        # Create default data
        async with AsyncSessionLocal() as session:
            await create_default_agents(session)
        logger.info("Default data created")

        logger.info("Database initialization completed successfully")

    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(init_database())
