import pytest
from datetime import datetime, timedelta, UTC
import sqlite3
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from services.context_service import ContextService
from models.shared_context import SharedContext
from models.agent_cards import AgentCard
from models.chat_sessions import ChatSession
from database import Base

# Create test database
@pytest.fixture(scope="function")
async def test_db():
    # Use SQLite in memory for tests
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session
        await session.rollback()
    
    await engine.dispose()

@pytest.fixture
def context_service():
    return ContextService()

@pytest.fixture
async def sample_agents(test_db):
    # Create test agents
    agents = [
        AgentCard(
            id="agent1",
            name="Test Agent 1",
            description="Test agent 1",
            capabilities=["test"]
        ),
        AgentCard(
            id="agent2",
            name="Test Agent 2",
            description="Test agent 2",
            capabilities=["test"]
        )
    ]
    
    for agent in agents:
        test_db.add(agent)
    await test_db.commit()
    
    return agents

@pytest.fixture
async def sample_session(test_db):
    # Create test session
    session = ChatSession(
        id="test-session",
        title="Test Session"
    )
    test_db.add(session)
    await test_db.commit()
    
    return session

@pytest.fixture
def sample_context_data():
    return {
        "id": "test-context-1",
        "source_agent_id": "agent1",
        "target_agent_id": "agent2",
        "session_id": "test-session",
        "context_type": "relevant",
        "content": {"key": "value"},
        "context_metadata": {},
        "created_at": datetime.now(UTC),
        "expires_at": datetime.now(UTC) + timedelta(hours=1)
    }

@pytest.mark.asyncio
async def test_share_context(context_service, test_db, sample_agents, sample_session, sample_context_data):
    # Test sharing context
    context = await context_service.share_context(
        db=test_db,
        source_agent_id=sample_context_data["source_agent_id"],
        target_agent_id=sample_context_data["target_agent_id"],
        context_data=sample_context_data["content"],
        session_id=sample_context_data["session_id"],
        context_type=sample_context_data["context_type"],
        ttl_minutes=60
    )

    assert context is not None
    assert context.source_agent_id == sample_context_data["source_agent_id"]
    assert context.target_agent_id == sample_context_data["target_agent_id"]
    assert context.context_type == sample_context_data["context_type"]
    
    # Test relationships
    assert context.source_agent.id == sample_context_data["source_agent_id"]
    assert context.target_agent.id == sample_context_data["target_agent_id"]
    assert context.session.id == sample_context_data["session_id"]
    
    # Test reverse relationships
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload

    # Query agents with eager loading of relationships
    source_query = select(AgentCard).options(joinedload(AgentCard.outbound_contexts)).filter(AgentCard.id == sample_context_data["source_agent_id"])
    target_query = select(AgentCard).options(joinedload(AgentCard.inbound_contexts)).filter(AgentCard.id == sample_context_data["target_agent_id"])

    source_result = await test_db.execute(source_query)
    target_result = await test_db.execute(target_query)

    source_agent = source_result.unique().scalar_one()
    target_agent = target_result.unique().scalar_one()

    assert context in source_agent.outbound_contexts
    assert context in target_agent.inbound_contexts

@pytest.mark.asyncio
async def test_get_shared_context(context_service, test_db, sample_agents, sample_session, sample_context_data):
    # Create a test context first
    context = SharedContext(**sample_context_data)
    test_db.add(context)
    await test_db.commit()
    
    # Test retrieving context
    contexts = await context_service.get_shared_context(
        db=test_db,
        target_agent_id=sample_context_data["target_agent_id"],
        session_id=sample_context_data["session_id"]
    )

    assert len(contexts) == 1
    assert contexts[0].id == sample_context_data["id"]
    assert contexts[0].target_agent_id == sample_context_data["target_agent_id"]
    
    # Test relationships are loaded
    assert contexts[0].source_agent is not None
    assert contexts[0].target_agent is not None
    assert contexts[0].session is not None

@pytest.mark.asyncio
async def test_filter_relevant_context(context_service, test_db, sample_agents, sample_session, sample_context_data):
    # Create test contexts
    context = SharedContext(**sample_context_data)
    test_db.add(context)
    await test_db.commit()
    
    # Test filtering context
    filtered = await context_service.filter_relevant_context(
        db=test_db,
        contexts=[context],
        query="value",
        min_score=0.3
    )

    assert len(filtered) > 0
    assert "score" in filtered[0]
    assert "context" in filtered[0]
    assert filtered[0]["score"] >= 0.3

@pytest.mark.asyncio
async def test_extend_context_ttl(context_service, test_db, sample_agents, sample_session, sample_context_data):
    # Create test context
    context = SharedContext(**sample_context_data)
    test_db.add(context)
    await test_db.commit()
    
    # Test extending TTL
    updated_context = await context_service.extend_context_ttl(
        db=test_db,
        context_id=sample_context_data["id"],
        additional_minutes=30
    )

    assert updated_context is not None
    assert updated_context.id == sample_context_data["id"]
    assert "ttl_extended_at" in updated_context.context_metadata

@pytest.mark.asyncio
async def test_batch_cleanup_contexts(context_service, test_db, sample_agents, sample_session, sample_context_data):
    # Create expired context
    expired_context = SharedContext(**{
        **sample_context_data,
        "expires_at": datetime.now(UTC) - timedelta(hours=1)
    })
    test_db.add(expired_context)
    await test_db.commit()
    
    # Test batch cleanup
    removed_count = await context_service.batch_cleanup_contexts(
        db=test_db,
        batch_size=100
    )

    assert removed_count == 1
    
    # Verify context was removed
    result = await test_db.get(SharedContext, sample_context_data["id"])
    assert result is None

@pytest.mark.asyncio
async def test_update_context(context_service, test_db, sample_agents, sample_session, sample_context_data):
    # Create test context
    context = SharedContext(**sample_context_data)
    test_db.add(context)
    await test_db.commit()
    
    # Test updating context
    updates = {
        "content": {"updated": "value"},
        "context_type": "summary"
    }
    updated_context = await context_service.update_context(
        db=test_db,
        context_id=sample_context_data["id"],
        updates=updates
    )

    assert updated_context is not None
    assert updated_context.id == sample_context_data["id"]
    assert updated_context.content == updates["content"]
    assert updated_context.context_type == updates["context_type"]
    assert "updated_at" in updated_context.context_metadata
