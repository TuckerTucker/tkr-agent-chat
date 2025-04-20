# Feature Slice 3: Context Sharing System

This document details the implementation of selective context sharing between agents in a server/client architecture running locally.

## Overview

The context sharing system enables agents to share relevant conversation context with each other while maintaining appropriate boundaries and efficiency. Context is stored server-side and accessed by the client through React Query.

## Components

### 1. Server-Side Context Model

```python
# api_gateway/src/models/shared_context.py

from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base

class SharedContext(Base):
    __tablename__ = "shared_contexts"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    source_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    target_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    context_type = Column(
        Enum(
            "full",
            "relevant",
            "summary",
            name="context_type"
        )
    )
    content = Column(JSON)  # The shared context data
    metadata = Column(JSON)  # Additional context metadata
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)
```

### 2. Server Context Service

```python
# api_gateway/src/services/context_service.py

import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.shared_context import SharedContext
from ..services.chat_service import chat_service

logger = logging.getLogger(__name__)

class ContextService:
    async def share_context(
        self,
        db: AsyncSession,
        source_agent_id: str,
        target_agent_id: str,
        context_data: Dict[str, Any],
        session_id: Optional[str] = None,
        context_type: str = "relevant",
        ttl_minutes: Optional[int] = None
    ) -> SharedContext:
        """Share context between agents."""
        context_id = str(uuid.uuid4())
        
        # Calculate expiration if TTL provided
        expires_at = None
        if ttl_minutes:
            expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
        
        context = SharedContext(
            id=context_id,
            session_id=session_id,
            source_agent_id=source_agent_id,
            target_agent_id=target_agent_id,
            context_type=context_type,
            content=context_data,
            metadata={},
            expires_at=expires_at
        )
        
        db.add(context)
        await db.commit()
        await db.refresh(context)
        
        logger.info(f"Created shared context {context_id}")
        return context
    
    async def get_shared_context(
        self,
        db: AsyncSession,
        target_agent_id: str,
        session_id: Optional[str] = None,
        source_agent_id: Optional[str] = None
    ) -> List[SharedContext]:
        """Get shared context available to an agent."""
        query = select(SharedContext).filter(
            SharedContext.target_agent_id == target_agent_id,
            SharedContext.expires_at.is_(None) | 
            (SharedContext.expires_at > datetime.utcnow())
        )
        
        if session_id:
            query = query.filter(SharedContext.session_id == session_id)
        if source_agent_id:
            query = query.filter(SharedContext.source_agent_id == source_agent_id)
            
        result = await db.execute(query)
        return result.scalars().all()
    
    async def filter_relevant_context(
        self,
        db: AsyncSession,
        contexts: List[SharedContext],
        query: str
    ) -> List[SharedContext]:
        """Filter contexts by relevance using text similarity."""
        # Simple keyword matching for now
        # Could be enhanced with more sophisticated relevance scoring
        keywords = set(query.lower().split())
        relevant = []
        
        for context in contexts:
            content_text = str(context.content).lower()
            if any(keyword in content_text for keyword in keywords):
                relevant.append(context)
        
        return relevant
    
    async def cleanup_expired_context(
        self,
        db: AsyncSession
    ) -> int:
        """Remove expired shared contexts."""
        result = await db.execute(
            select(SharedContext).filter(
                SharedContext.expires_at <= datetime.utcnow()
            )
        )
        expired = result.scalars().all()
        
        for context in expired:
            await db.delete(context)
        
        await db.commit()
        return len(expired)

# Global instance
context_service = ContextService()
```

### 3. Server API Endpoints

```python
# api_gateway/src/routes/context.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.context_service import context_service

router = APIRouter()

@router.post("/api/v1/context/share")
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

@router.get("/api/v1/context/{target_agent_id}")
async def get_context(
    target_agent_id: str,
    session_id: Optional[str] = None,
    source_agent_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get shared context for an agent."""
    contexts = await context_service.get_shared_context(
        db,
        target_agent_id,
        session_id,
        source_agent_id
    )
    return contexts
```

### 4. Client Context Service

```typescript
// src/services/context.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface SharedContext {
  id: string;
  session_id: string;
  source_agent_id: string;
  target_agent_id: string;
  context_type: 'full' | 'relevant' | 'summary';
  content: any;
  metadata: Record<string, any>;
  created_at: string;
  expires_at?: string;
}

interface ShareContextRequest {
  source_agent_id: string;
  target_agent_id: string;
  context_data: any;
  session_id?: string;
  context_type?: string;
  ttl_minutes?: number;
}

export const contextApi = {
  shareContext: async (request: ShareContextRequest): Promise<SharedContext> => {
    const response = await fetch('/api/v1/context/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error('Failed to share context');
    }
    
    return response.json();
  },

  getContext: async (
    targetAgentId: string,
    sessionId?: string,
    sourceAgentId?: string
  ): Promise<SharedContext[]> => {
    const params = new URLSearchParams();
    if (sessionId) params.append('session_id', sessionId);
    if (sourceAgentId) params.append('source_agent_id', sourceAgentId);
    
    const response = await fetch(
      `/api/v1/context/${targetAgentId}?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get context');
    }
    
    return response.json();
  }
};

// React Query hooks
export const useSharedContext = (
  targetAgentId: string,
  sessionId?: string,
  sourceAgentId?: string
) => {
  return useQuery(
    ['context', targetAgentId, sessionId, sourceAgentId],
    () => contextApi.getContext(targetAgentId, sessionId, sourceAgentId)
  );
};

export const useShareContext = () => {
  const queryClient = useQueryClient();
  
  return useMutation(
    (request: ShareContextRequest) => contextApi.shareContext(request),
    {
      onSuccess: (data) => {
        // Invalidate relevant queries
        queryClient.invalidateQueries([
          'context',
          data.target_agent_id,
          data.session_id
        ]);
      }
    }
  );
};
```

### 5. Client Context Components

```typescript
// src/components/ui/context-indicator.tsx

interface ContextIndicatorProps {
  messageId: string;
  usedContext: boolean;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  messageId,
  usedContext
}) => {
  if (!usedContext) return null;
  
  return (
    <div className="context-indicator" title="This response used shared context">
      <ContextIcon />
      <span className="sr-only">Used shared context</span>
    </div>
  );
};

// src/components/ui/context-viewer.tsx

interface ContextViewerProps {
  agentId: string;
  sessionId: string;
}

export const ContextViewer: React.FC<ContextViewerProps> = ({
  agentId,
  sessionId
}) => {
  const { data: contexts, isLoading } = useSharedContext(agentId, sessionId);
  
  if (isLoading) return <LoadingSpinner />;
  if (!contexts?.length) return null;
  
  return (
    <div className="context-viewer">
      <h3>Available Context</h3>
      {contexts.map(context => (
        <div key={context.id} className="context-item">
          <div className="context-header">
            <span>From: {context.source_agent_id}</span>
            <span>Type: {context.context_type}</span>
          </div>
          <div className="context-content">
            {JSON.stringify(context.content, null, 2)}
          </div>
        </div>
      ))}
    </div>
  );
};
```

## Testing Requirements

### Unit Tests

1. Context Service
```python
class TestContextService:
    async def test_share_context(self):
        """Test sharing context."""
        context = await context_service.share_context(
            db,
            "agent1",
            "agent2",
            {"text": "test context"}
        )
        assert context.id is not None
        assert context.source_agent_id == "agent1"
```

2. Context API
```typescript
describe('contextApi', () => {
  it('should share context', async () => {
    const context = await contextApi.shareContext({
      source_agent_id: 'agent1',
      target_agent_id: 'agent2',
      context_data: { text: 'test' }
    });
    expect(context.id).toBeDefined();
  });
});
```

### Integration Tests

1. End-to-End Context Flow
```python
async def test_context_flow():
    """Test complete context flow."""
    # Share context
    context = await context_service.share_context(...)
    
    # Get context
    contexts = await context_service.get_shared_context(...)
    
    assert len(contexts) > 0
    assert contexts[0].content == context.content
```

## Setup Checklist

1. Database
   - [ ] Create shared_contexts table
   - [ ] Set up indexes
   - [ ] Configure cleanup job

2. Server
   - [ ] Initialize context service
   - [ ] Configure API endpoints
   - [ ] Set up monitoring

3. Client
   - [ ] Set up React Query
   - [ ] Implement components
   - [ ] Test integration

## Success Criteria

1. Functionality
   - Context sharing works
   - Relevance filtering works
   - Context expiration works
   - UI shows context usage

2. Performance
   - Context sharing < 50ms
   - Context retrieval < 50ms
   - Context filtering < 100ms
   - UI remains responsive

3. Reliability
   - No context leaks
   - Proper cleanup
   - Error handling
   - Data consistency

## Next Steps

1. Test thoroughly
2. Document usage
3. Add error recovery
4. Prepare for Feature Slice 4: Conversation Checkpoints

## Dependencies

- PostgreSQL
- SQLAlchemy
- FastAPI
- React Query
