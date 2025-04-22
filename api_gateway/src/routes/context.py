"""
API routes for shared context management.
"""

from typing import List, Optional
from time import time
from fastapi import APIRouter, HTTPException

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
def share_context(request: ShareContextRequest) -> Dict:
    """Share context between agents."""
    try:
        context = context_service.share_context(
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
def get_context(
    target_agent_id: str,
    session_id: Optional[str] = None,
    source_agent_id: Optional[str] = None
) -> List[Dict]:
    """Get shared context for an agent."""
    try:
        contexts = context_service.get_shared_context(
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
def filter_context(
    target_agent_id: str,
    request: FilterContextRequest
) -> List[Dict]:
    """Get filtered context for an agent based on relevance."""
    try:
        contexts = context_service.get_shared_context(
            target_agent_id=target_agent_id,
            session_id=request.session_id,
            source_agent_id=request.source_agent_id
        )
        filtered = context_service.filter_relevant_context(
            contexts=contexts,
            query=request.query,
            min_score=request.min_score
        )
        return [
            {**context["context"], "relevance_score": context["score"]}
            for context in filtered
        ]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{context_id}", response_model=SharedContextResponse)
def update_context(
    context_id: str,
    request: UpdateContextRequest
) -> Dict:
    """Update an existing context."""
    try:
        updates = {k: v for k, v in request.dict().items() if v is not None}
        if request.ttl_minutes is not None:
            updates["expires_at"] = time() + (request.ttl_minutes * 60)
        
        context = context_service.update_context(
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
def extend_context_ttl(
    context_id: str,
    request: ExtendTTLRequest
) -> Dict:
    """Extend the TTL of a context."""
    try:
        context = context_service.extend_context_ttl(
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
def cleanup_expired_contexts(batch_size: int = 100) -> Dict:
    """Clean up expired contexts in batches."""
    try:
        start_time = time()
        removed_count = context_service.batch_cleanup_contexts(
            batch_size=batch_size
        )
        execution_time = (time() - start_time) * 1000  # Convert to milliseconds
        
        return BatchCleanupResponse(
            removed_count=removed_count,
            execution_time_ms=execution_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
