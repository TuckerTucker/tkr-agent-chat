from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.context_service import context_service
from ..models.api import ShareContextRequest, SharedContextResponse

router = APIRouter(prefix="/api/v1/context", tags=["context"])

@router.post("/share", response_model=SharedContextResponse)
async def share_context(
    request: ShareContextRequest,
    db: AsyncSession = Depends(get_db)
):
    """Share context between agents."""
    try:
        context = await context_service.share_context(
            db,
            request.source_agent_id,
            request.target_agent_id,
            request.context_data,
            request.session_id,
            request.context_type,
            request.ttl_minutes
        )
        return context
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{target_agent_id}", response_model=List[SharedContextResponse])
async def get_context(
    target_agent_id: str,
    session_id: Optional[str] = None,
    source_agent_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get shared context for an agent."""
    try:
        contexts = await context_service.get_shared_context(
            db,
            target_agent_id,
            session_id,
            source_agent_id
        )
        return contexts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{target_agent_id}/filter", response_model=List[SharedContextResponse])
async def filter_context(
    target_agent_id: str,
    query: str,
    session_id: Optional[str] = None,
    source_agent_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get filtered context for an agent based on relevance."""
    try:
        contexts = await context_service.get_shared_context(
            db,
            target_agent_id,
            session_id,
            source_agent_id
        )
        filtered = await context_service.filter_relevant_context(
            db,
            contexts,
            query
        )
        return filtered
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cleanup")
async def cleanup_expired_contexts(
    db: AsyncSession = Depends(get_db)
):
    """Clean up expired contexts."""
    try:
        removed_count = await context_service.cleanup_expired_context(db)
        return {"message": f"Removed {removed_count} expired contexts"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
