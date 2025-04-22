import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from httpx import AsyncClient

from ...routes.context import router
from ...services.context_service import context_service
from ...models.shared_context import SharedContext

@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(router)
    return app

@pytest.fixture
async def client(app):
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

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
async def test_share_context(client, sample_context_data):
    # Mock context service
    with patch.object(context_service, "share_context") as mock_share:
        mock_share.return_value = SharedContext(**sample_context_data)

        # Test endpoint
        response = await client.post(
            "/api/v1/context/share",
            json={
                "source_agent_id": sample_context_data["source_agent_id"],
                "target_agent_id": sample_context_data["target_agent_id"],
                "context_data": sample_context_data["content"],
                "session_id": sample_context_data["session_id"],
                "context_type": sample_context_data["context_type"],
                "ttl_minutes": 60
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_context_data["id"]
        assert data["source_agent_id"] == sample_context_data["source_agent_id"]
        assert data["target_agent_id"] == sample_context_data["target_agent_id"]
        assert mock_share.called

@pytest.mark.asyncio
async def test_get_context(client, sample_context_data):
    # Mock context service
    with patch.object(context_service, "get_shared_context") as mock_get:
        mock_get.return_value = [SharedContext(**sample_context_data)]

        # Test endpoint
        response = await client.get(
            f"/api/v1/context/{sample_context_data['target_agent_id']}",
            params={
                "session_id": sample_context_data["session_id"]
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == sample_context_data["id"]
        assert data[0]["target_agent_id"] == sample_context_data["target_agent_id"]
        assert mock_get.called

@pytest.mark.asyncio
async def test_filter_context(client, sample_context_data):
    # Mock context service
    with patch.object(context_service, "get_shared_context") as mock_get:
        mock_get.return_value = [SharedContext(**sample_context_data)]
        
        with patch.object(context_service, "filter_relevant_context") as mock_filter:
            mock_filter.return_value = [{
                "context": SharedContext(**sample_context_data),
                "score": 0.8,
                "metadata": {"relevance_score": 0.8}
            }]

            # Test endpoint
            response = await client.post(
                f"/api/v1/context/{sample_context_data['target_agent_id']}/filter",
                json={
                    "query": "value",
                    "min_score": 0.3,
                    "session_id": sample_context_data["session_id"]
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert "relevance_score" in data[0]
            assert data[0]["relevance_score"] >= 0.3
            assert mock_get.called
            assert mock_filter.called

@pytest.mark.asyncio
async def test_update_context(client, sample_context_data):
    # Mock context service
    with patch.object(context_service, "update_context") as mock_update:
        updated_data = {**sample_context_data, "content": {"updated": "value"}}
        mock_update.return_value = SharedContext(**updated_data)

        # Test endpoint
        response = await client.patch(
            f"/api/v1/context/{sample_context_data['id']}",
            json={
                "content": {"updated": "value"},
                "context_type": "summary"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_context_data["id"]
        assert data["content"] == {"updated": "value"}
        assert mock_update.called

@pytest.mark.asyncio
async def test_extend_context_ttl(client, sample_context_data):
    # Mock context service
    with patch.object(context_service, "extend_context_ttl") as mock_extend:
        mock_extend.return_value = SharedContext(**sample_context_data)

        # Test endpoint
        response = await client.post(
            f"/api/v1/context/{sample_context_data['id']}/extend",
            json={
                "additional_minutes": 30
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_context_data["id"]
        assert mock_extend.called

@pytest.mark.asyncio
async def test_cleanup_expired_contexts(client):
    # Mock context service
    with patch.object(context_service, "batch_cleanup_contexts") as mock_cleanup:
        mock_cleanup.return_value = 5

        # Test endpoint
        response = await client.delete(
            "/api/v1/context/cleanup",
            params={"batch_size": 100}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["removed_count"] == 5
        assert mock_cleanup.called

@pytest.mark.asyncio
async def test_invalid_context_type(client, sample_context_data):
    # Test invalid context type validation
    response = await client.post(
        "/api/v1/context/share",
        json={
            "source_agent_id": sample_context_data["source_agent_id"],
            "target_agent_id": sample_context_data["target_agent_id"],
            "context_data": sample_context_data["content"],
            "context_type": "invalid_type"  # Invalid type
        }
    )

    assert response.status_code == 422  # Validation error

@pytest.mark.asyncio
async def test_negative_ttl(client, sample_context_data):
    # Test negative TTL validation
    response = await client.post(
        "/api/v1/context/share",
        json={
            "source_agent_id": sample_context_data["source_agent_id"],
            "target_agent_id": sample_context_data["target_agent_id"],
            "context_data": sample_context_data["content"],
            "ttl_minutes": -30  # Negative TTL
        }
    )

    assert response.status_code == 422  # Validation error
