import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock

from ...services.context_service import ContextService
from ...models.shared_context import SharedContext

@pytest.fixture
def context_service():
    return ContextService()

@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db

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
        "created_at": datetime.now(UTC).isoformat(),
        "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    }

@pytest.mark.asyncio
async def test_share_context(context_service, mock_db, sample_context_data):
    # Test sharing context
    context = await context_service.share_context(
        db=mock_db,
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
    assert mock_db.add.called
    assert mock_db.commit.called
    assert mock_db.refresh.called

@pytest.mark.asyncio
async def test_get_shared_context(context_service, mock_db, sample_context_data):
    # Mock the database response
    mock_context = SharedContext(**sample_context_data)
    mock_db.execute.return_value.scalars.return_value.all.return_value = [mock_context]

    # Test retrieving context
    contexts = await context_service.get_shared_context(
        db=mock_db,
        target_agent_id=sample_context_data["target_agent_id"],
        session_id=sample_context_data["session_id"]
    )

    assert len(contexts) == 1
    assert contexts[0].id == sample_context_data["id"]
    assert contexts[0].target_agent_id == sample_context_data["target_agent_id"]
    assert mock_db.execute.called

@pytest.mark.asyncio
async def test_filter_relevant_context(context_service, mock_db, sample_context_data):
    # Mock contexts
    mock_context = SharedContext(**sample_context_data)
    contexts = [mock_context]

    # Test filtering context
    filtered = await context_service.filter_relevant_context(
        db=mock_db,
        contexts=contexts,
        query="value",
        min_score=0.3
    )

    assert len(filtered) > 0
    assert "score" in filtered[0]
    assert "context" in filtered[0]
    assert filtered[0]["score"] >= 0.3

@pytest.mark.asyncio
async def test_extend_context_ttl(context_service, mock_db, sample_context_data):
    # Mock the context retrieval
    mock_context = SharedContext(**sample_context_data)
    mock_db.execute.return_value.scalar_one_or_none.return_value = mock_context

    # Test extending TTL
    updated_context = await context_service.extend_context_ttl(
        db=mock_db,
        context_id=sample_context_data["id"],
        additional_minutes=30
    )

    assert updated_context is not None
    assert updated_context.id == sample_context_data["id"]
    assert "ttl_extended_at" in updated_context.context_metadata
    assert mock_db.commit.called
    assert mock_db.refresh.called

@pytest.mark.asyncio
async def test_batch_cleanup_contexts(context_service, mock_db, sample_context_data):
    # Mock expired contexts
    expired_context = SharedContext(**{
        **sample_context_data,
        "expires_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    })
    mock_db.execute.return_value.scalars.return_value.all.return_value = [expired_context]

    # Test batch cleanup
    removed_count = await context_service.batch_cleanup_contexts(
        db=mock_db,
        batch_size=100
    )

    assert removed_count == 1
    assert mock_db.delete.called
    assert mock_db.commit.called

@pytest.mark.asyncio
async def test_update_context(context_service, mock_db, sample_context_data):
    # Mock the context retrieval
    mock_context = SharedContext(**sample_context_data)
    mock_db.execute.return_value.scalar_one_or_none.return_value = mock_context

    # Test updating context
    updates = {
        "content": {"updated": "value"},
        "context_type": "summary"
    }
    updated_context = await context_service.update_context(
        db=mock_db,
        context_id=sample_context_data["id"],
        updates=updates
    )

    assert updated_context is not None
    assert updated_context.id == sample_context_data["id"]
    assert updated_context.content == updates["content"]
    assert updated_context.context_type == updates["context_type"]
    assert "updated_at" in updated_context.context_metadata
    assert mock_db.commit.called
    assert mock_db.refresh.called
