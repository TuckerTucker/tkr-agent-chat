import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Use environment variable or default to a file in the gateway directory
# Corrected path: ./ resolves to the directory where uvicorn is run (api_gateway)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./chat_database.db")

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=True) # echo=True for debugging SQL

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
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all) # Uncomment to drop tables on startup
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables initialized.")
