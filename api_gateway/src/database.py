import os
from pathlib import Path # Use pathlib for easier path manipulation
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# --- Start Modification ---

# Define the project root relative to this file's location
# __file__ is /Volumes/tkr-riffic/tucker-home-folder/tkr-agent-chat/api_gateway/src/database.py
# Project root is three levels up from the file's directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Define the desired database path within the project root
DEFAULT_DB_PATH = PROJECT_ROOT / "chats" / "chat_database.db"

# Ensure the 'chats' directory exists before the engine tries to connect/create the db
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Construct the database URL using the absolute path
# Use environment variable if set, otherwise use the calculated default path
# The f-string ensures the absolute path is correctly included after '///'
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DEFAULT_DB_PATH}")

# --- End Modification ---

# Create async engine
# echo=False is usually preferred for production/regular use unless debugging SQL
engine = create_async_engine(DATABASE_URL, echo=False)

# Create async session maker
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False, # Important for async context
)

# Base class for declarative models
Base = declarative_base()

async def get_db() -> AsyncSession:
    """Dependency to get an async database session."""
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    """Initialize the database tables."""
    print(f"Initializing database at: {DATABASE_URL}") # Log the path being used
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all) # Uncomment to drop tables on startup
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables initialized.")
