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
    metadata: Optional[Dict[str, Any]] = None

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
    session_id: Optional[str] = None
    source_agent_id: Optional[str] = None

class SharedContextResponse(BaseModel):
    id: str
    session_id: Optional[str]
    source_agent_id: str
    target_agent_id: str
    context_type: str
    content: Dict[str, Any]
    metadata: Dict[str, Any]
    created_at: str
    expires_at: Optional[str]
    relevance_score: Optional[float] = None

    class Config:
        from_attributes = True

class BatchCleanupResponse(BaseModel):
    removed_count: int
    execution_time_ms: float
