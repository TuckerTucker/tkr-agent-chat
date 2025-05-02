"""
API request/response models for the Gateway.
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, validator
from datetime import datetime

class ShareContextRequest(BaseModel):
    source_agent_id: str
    target_agent_id: str
    context_data: Dict[str, Any]
    session_id: Optional[str] = None
    context_type: str = "relevant"
    ttl_minutes: Optional[int] = None

    @validator('context_type')
    def validate_context_type(cls, v):
        if v not in ('full', 'relevant', 'summary'):
            raise ValueError('context_type must be one of: full, relevant, summary')
        return v

    @validator('ttl_minutes')
    def validate_ttl(cls, v):
        if v is not None and v <= 0:
            raise ValueError('ttl_minutes must be positive')
        return v

class UpdateContextRequest(BaseModel):
    content: Optional[Dict[str, Any]] = None
    context_type: Optional[str] = None
    ttl_minutes: Optional[int] = None
    context_metadata: Optional[Dict[str, Any]] = None  # Renamed from 'metadata' to match service usage

    @validator('context_type')
    def validate_context_type(cls, v):
        if v is not None and v not in ('full', 'relevant', 'summary'):
            raise ValueError('context_type must be one of: full, relevant, summary')
        return v

    @validator('ttl_minutes')
    def validate_ttl(cls, v):
        if v is not None and v <= 0:
            raise ValueError('ttl_minutes must be positive')
        return v

class ExtendTTLRequest(BaseModel):
    additional_minutes: int = Field(gt=0, description="Additional minutes to extend TTL")

class FilterContextRequest(BaseModel):
    query: str = Field(min_length=1)
    min_score: float = Field(default=0.3, ge=0.0, le=1.0)
    max_contexts: Optional[int] = Field(default=None, gt=0, description="Maximum number of contexts to return")
    session_id: Optional[str] = None
    source_agent_id: Optional[str] = None

class SharedContextResponse(BaseModel):
    id: str
    session_id: Optional[str]
    source_agent_id: str
    target_agent_id: str
    context_type: str
    content: Dict[str, Any]
    context_metadata: Optional[Dict[str, Any]] = None  # Renamed from 'metadata' to match service usage
    created_at: str
    expires_at: Optional[str]
    relevance_score: Optional[float] = None

    class Config:
        from_attributes = True

class BatchCleanupResponse(BaseModel):
    removed_count: int
    execution_time_ms: float

class ContextStatsResponse(BaseModel):
    """Response with statistics about an agent's contexts."""
    count: int
    total_size_bytes: int
    avg_size_bytes: float
    oldest_context: Optional[Dict[str, Any]] = None
    newest_context: Optional[Dict[str, Any]] = None
    by_source_agent: Optional[Dict[str, int]] = None

class ContextConfigResponse(BaseModel):
    """Response with context configuration settings."""
    max_contexts_per_agent: int
    default_ttl_minutes: int
    min_relevance_score: float
    context_limit_bytes: int