"""
API routes for shared context management.
"""

from typing import List, Optional, Dict
from time import time
from datetime import datetime, timedelta, UTC
from fastapi import APIRouter, HTTPException, Query

from ..services.context_service import context_service
from ..models.api import (
    ShareContextRequest,
    SharedContextResponse,
    UpdateContextRequest,
    ExtendTTLRequest,
    FilterContextRequest,
    BatchCleanupResponse,
    ContextStatsResponse,
    ContextConfigResponse,
    ContextMetricsResponse
)

# Import configuration constants
from ..services.context_service import (
    DEFAULT_MAX_CONTEXTS,
    DEFAULT_CONTEXT_TTL_MINUTES,
    DEFAULT_MIN_RELEVANCE_SCORE,
    DEFAULT_CONTEXT_LIMIT_BYTES
)

router = APIRouter(prefix="/api/v1/context", tags=["context"])

@router.get("/metrics", response_model=ContextMetricsResponse)
def get_context_metrics() -> Dict:
    """Get metrics about context usage."""
    return context_service.get_metrics()

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
    source_agent_id: Optional[str] = None,
    limit: Optional[int] = Query(None, gt=0, description="Maximum number of contexts to return")
) -> List[Dict]:
    """Get shared context for an agent."""
    try:
        contexts = context_service.get_shared_context(
            target_agent_id=target_agent_id,
            session_id=session_id,
            source_agent_id=source_agent_id,
            limit=limit if limit is not None else DEFAULT_MAX_CONTEXTS
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
            min_score=request.min_score,
            max_contexts=request.max_contexts if request.max_contexts else DEFAULT_MAX_CONTEXTS
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
            updates["expires_at"] = (datetime.now(UTC) + timedelta(minutes=request.ttl_minutes)).isoformat()
        
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

@router.get("/{target_agent_id}/stats", response_model=ContextStatsResponse)
def get_context_stats(
    target_agent_id: str,
    session_id: Optional[str] = None
) -> Dict:
    """Get statistics about an agent's contexts."""
    try:
        stats = context_service.get_agent_context_stats(
            target_agent_id=target_agent_id,
            session_id=session_id
        )
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{target_agent_id}/prune", response_model=Dict[str, int])
def prune_contexts(
    target_agent_id: str,
    session_id: Optional[str] = None,
    max_contexts: Optional[int] = Query(None, gt=0, description="Maximum number of contexts to keep")
) -> Dict[str, int]:
    """Manually prune contexts for an agent to the specified limit."""
    try:
        before_count, removed_count = context_service._prune_contexts_if_needed(
            target_agent_id=target_agent_id,
            session_id=session_id,
            max_contexts=max_contexts if max_contexts is not None else DEFAULT_MAX_CONTEXTS
        )
        return {
            "before_count": before_count,
            "removed_count": removed_count,
            "after_count": before_count - removed_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config", response_model=ContextConfigResponse)
def get_context_config() -> Dict:
    """Get the current context configuration settings."""
    return ContextConfigResponse(
        max_contexts_per_agent=DEFAULT_MAX_CONTEXTS,
        default_ttl_minutes=DEFAULT_CONTEXT_TTL_MINUTES,
        min_relevance_score=DEFAULT_MIN_RELEVANCE_SCORE,
        context_limit_bytes=DEFAULT_CONTEXT_LIMIT_BYTES
    )
    
@router.get("/debug/test")
def test_context_sharing(
    source_agent_id: str,
    target_agent_id: str,
    session_id: str,
    content: str = "Test context from debug endpoint"
):
    """Debug endpoint to test context sharing between agents."""
    try:
        # Create context data
        context_data = {
            "content": content,
            "timestamp": datetime.now(UTC).isoformat()
        }
        
        # Share context
        context = context_service.share_context(
            source_agent_id=source_agent_id,
            target_agent_id=target_agent_id,
            context_data=context_data,
            session_id=session_id
        )
        
        # Format context
        formatted_context = context_service.format_context_for_content(
            target_agent_id=target_agent_id,
            session_id=session_id
        )
        
        # Return debug info
        return {
            "success": True,
            "context_id": context["id"],
            "source_agent": source_agent_id,
            "target_agent": target_agent_id,
            "session_id": session_id,
            "content": content,
            "context_size": len(content),
            "formatted_context": formatted_context,
            "formatted_context_size": len(formatted_context) if formatted_context else 0
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "source_agent": source_agent_id,
            "target_agent": target_agent_id,
            "session_id": session_id
        }