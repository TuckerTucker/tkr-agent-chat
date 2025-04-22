from typing import List, Optional
from time import time
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.context_service import context_service
from ..models.api import (
    ShareContextRequest,
    SharedContextResponse,
    UpdateContextRequest,
    ExtendTTLRequest,
    FilterContextRequest,
    BatchCleanupResponse
)

router = APIRouter(prefix="/api/v1/context", tags=["context"])

@router.post("/share", response_model=SharedContextResponse)
async def share_context(
    request: ShareContextRequest,
    db: AsyncSession = Depends(get_db)
):
    """Share context between agents."""
    try:
        context = await context_service.share_context(
            db=db,
            source_agent_id=request.source_agent_id,
            target_agent_id=request.target_agent_id,
            context_data=request.context_data,
            session_id=request.session_id,
            context_type=request.context_type,
            ttl_minutes=request.ttl_minutes
        )
        return context
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
            db=db,
            target_agent_id=target_agent_id,
            session_id=session_id,
            source_agent_id=source_agent_id
        )
        return contexts
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{target_agent_id}/filter", response_model=List[SharedContextResponse])
async def filter_context(
    target_agent_id: str,
    request: FilterContextRequest,
    db: AsyncSession = Depends(get_db)
):
    """Get filtered context for an agent based on relevance."""
    try:
        contexts = await context_service.get_shared_context(
            db=db,
            target_agent_id=target_agent_id,
            session_id=request.session_id,
            source_agent_id=request.source_agent_id
        )
        filtered = await context_service.filter_relevant_context(
            db=db,
            contexts=contexts,
            query=request.query,
            min_score=request.min_score
        )
        return [
            {**context["context"].__dict__, "relevance_score": context["score"]}
            for context in filtered
        ]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{context_id}", response_model=SharedContextResponse)
async def update_context(
    context_id: str,
    request: UpdateContextRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update an existing context."""
    try:
        updates = {k: v for k, v in request.dict().items() if v is not None}
        if request.ttl_minutes is not None:
            updates["expires_at"] = time() + (request.ttl_minutes * 60)
        
        context = await context_service.update_context(
            db=db,
            context_id=context_id,
            updates=updates
        )
        if not context:
            raise HTTPException(status_code=404, detail="Context not found")
        return context
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{context_id}/extend", response_model=SharedContextResponse)
async def extend_context_ttl(
    context_id: str,
    request: ExtendTTLRequest,
    db: AsyncSession = Depends(get_db)
):
    """Extend the TTL of a context."""
    try:
        context = await context_service.extend_context_ttl(
            db=db,
            context_id=context_id,
            additional_minutes=request.additional_minutes
        )
        if not context:
            raise HTTPException(status_code=404, detail="Context not found")
        return context
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cleanup", response_model=BatchCleanupResponse)
async def cleanup_expired_contexts(
    batch_size: int = Query(default=100, gt=0, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """Clean up expired contexts in batches."""
    try:
        start_time = time()
        removed_count = await context_service.batch_cleanup_contexts(
            db=db,
            batch_size=batch_size
        )
        execution_time = (time() - start_time) * 1000  # Convert to milliseconds
        
        return BatchCleanupResponse(
            removed_count=removed_count,
            execution_time_ms=execution_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
