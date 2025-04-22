from typing import Optional, Dict, Any
from pydantic import BaseModel

class ShareContextRequest(BaseModel):
    source_agent_id: str
    target_agent_id: str
    context_data: Dict[str, Any]
    session_id: Optional[str] = None
    context_type: str = "relevant"
    ttl_minutes: Optional[int] = None

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

    class Config:
        from_attributes = True
