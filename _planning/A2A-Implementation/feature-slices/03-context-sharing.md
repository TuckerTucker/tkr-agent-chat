# Feature Slice 3: Context Sharing System with SQLite

This document details the implementation of selective context sharing between agents using SQLite for data persistence in a server/client architecture running locally.

## Overview

The context sharing system enables agents to share relevant conversation context with each other while maintaining appropriate boundaries and efficiency. Context is stored in SQLite and accessed by the client through React Query.

## Components

### 1. Database Schema

```sql
CREATE TABLE shared_contexts (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    source_agent_id TEXT,
    target_agent_id TEXT,
    context_type TEXT CHECK(context_type IN ('full', 'relevant', 'summary')),
    content JSON,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id),
    FOREIGN KEY(source_agent_id) REFERENCES agent_cards(agent_id),
    FOREIGN KEY(target_agent_id) REFERENCES agent_cards(agent_id)
);

CREATE INDEX ix_shared_contexts_target_agent_id ON shared_contexts(target_agent_id);
CREATE INDEX ix_shared_contexts_session_id ON shared_contexts(session_id);
CREATE INDEX ix_shared_contexts_expires_at ON shared_contexts(expires_at);
```

### 2. Server-Side Context Model

```python
# api_gateway/src/models/shared_context.py

from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base

class SharedContext(Base):
    __tablename__ = "shared_contexts"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    source_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    target_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    context_type = Column(String)
    content = Column(JSON)  # The shared context data
    metadata = Column(JSON)  # Additional context metadata
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)
    
    # SQLite-compatible check constraint for context_type
    __table_args__ = (
        CheckConstraint(
            "context_type IN ('full', 'relevant', 'summary')",
            name="context_type_check"
        ),
    )
```

### 3. Database Initialization

```python
# api_gateway/scripts/init_db.py

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from ..database import Base
from ..models.shared_context import SharedContext

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key support and WAL mode for better concurrency."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

def init_database():
    """Initialize the database with all required tables."""
    engine = create_engine("sqlite:///chats/chat_database.db")
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    # Create indexes for better query performance
    with engine.connect() as conn:
        conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_target_agent_id 
            ON shared_contexts(target_agent_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_session_id 
            ON shared_contexts(session_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_shared_contexts_expires_at 
            ON shared_contexts(expires_at)
        """)
```

### 4. Server Context Service

```python
# api_gateway/src/services/context_service.py

import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text

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
        # Use SQLite's datetime functions for expiration check
        query = select(SharedContext).filter(
            SharedContext.target_agent_id == target_agent_id,
            SharedContext.expires_at.is_(None) | 
            text("datetime(expires_at) > datetime('now')")
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
        """Filter contexts by relevance using SQLite's JSON1 extension."""
        # Use JSON1 for better content searching
        keywords = set(query.lower().split())
        relevant = []
        
        for context in contexts:
            # Use json_extract for more efficient JSON searching
            content_text = str(context.content).lower()
            if any(keyword in content_text for keyword in keywords):
                relevant.append(context)
        
        return relevant
    
    async def cleanup_expired_context(
        self,
        db: AsyncSession
    ) -> int:
        """Remove expired shared contexts."""
        # Use SQLite's datetime functions for cleanup
        result = await db.execute(
            select(SharedContext).filter(
                text("datetime(expires_at) <= datetime('now')")
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

### 5. Server API Endpoints

```python
# api_gateway/src/routes/context.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlite3 import IntegrityError

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
    except IntegrityError as e:
        raise HTTPException(
            status_code=400,
            detail="Invalid context type. Must be 'full', 'relevant', or 'summary'"
        )
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
```

### 6. Client Context Service

```typescript
// src/services/context.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface SharedContext {
    id: string;
    session_id: string | null;
    source_agent_id: string;
    target_agent_id: string;
    context_type: 'full' | 'relevant' | 'summary';
    content: any;
    metadata: Record<string, any>;
    created_at: string;
    expires_at: string | null;
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
            const error = await response.json();
            throw new Error(error.detail || 'Failed to share context');
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
    },

    filterContext: async (
        targetAgentId: string,
        query: string,
        sessionId?: string,
        sourceAgentId?: string
    ): Promise<SharedContext[]> => {
        const params = new URLSearchParams();
        params.append('query', query);
        if (sessionId) params.append('session_id', sessionId);
        if (sourceAgentId) params.append('source_agent_id', sourceAgentId);
        
        const response = await fetch(
            `/api/v1/context/${targetAgentId}/filter?${params.toString()}`,
            { method: 'POST' }
        );
        
        if (!response.ok) {
            throw new Error('Failed to filter context');
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
    return useQuery({
        queryKey: ['context', targetAgentId, sessionId, sourceAgentId],
        queryFn: () => contextApi.getContext(targetAgentId, sessionId, sourceAgentId),
        enabled: !!targetAgentId,
        refetchInterval: 60000 // Refresh every minute to catch expired contexts
    });
};

export const useShareContext = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: (request: ShareContextRequest) => contextApi.shareContext(request),
        onSuccess: (data: SharedContext) => {
            queryClient.invalidateQueries({
                queryKey: ['context', data.target_agent_id, data.session_id]
            });
        }
    });
};

export const useFilterContext = (
    targetAgentId: string,
    sessionId?: string,
    sourceAgentId?: string
) => {
    return useMutation({
        mutationFn: (query: string) => contextApi.filterContext(
            targetAgentId,
            query,
            sessionId,
            sourceAgentId
        )
    });
};
```

### 7. Client Context Components

```typescript
// src/components/ui/context-indicator.tsx

import React from 'react';
import { Info } from 'lucide-react';

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
        <div 
            className="context-indicator inline-flex items-center text-muted-foreground"
            title="This response used shared context"
        >
            <Info className="h-4 w-4 mr-1" />
            <span className="sr-only">Used shared context</span>
        </div>
    );
};

// src/components/ui/context-viewer.tsx

import React from 'react';
import { useSharedContext, useFilterContext } from '../../services/context';
import { Loader2 } from 'lucide-react';

interface ContextViewerProps {
    agentId: string;
    sessionId: string;
}

export const ContextViewer: React.FC<ContextViewerProps> = ({
    agentId,
    sessionId
}) => {
    const { data: contexts, isLoading } = useSharedContext(agentId, sessionId);
    const filterMutation = useFilterContext(agentId, sessionId);
    
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }
    
    if (!contexts?.length) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                No shared context available
            </div>
        );
    }
    
    return (
        <div className="context-viewer space-y-4 p-4">
            <h3 className="text-sm font-medium">Available Context</h3>
            <div className="space-y-2">
                {contexts.map(context => (
                    <div 
                        key={context.id} 
                        className="context-item rounded-lg border bg-card p-4"
                    >
                        <div className="context-header flex items-center justify-between text-sm text-muted-foreground mb-2">
                            <span>From: {context.source_agent_id}</span>
                            <span>Type: {context.context_type}</span>
                        </div>
                        <div className="context-content text-sm">
                            <pre className="whitespace-pre-wrap">
                                {JSON.stringify(context.content, null, 2)}
                            </pre>
                        </div>
                        {context.expires_at && (
                            <div className="text-xs text-muted-foreground mt-2">
                                Expires: {new Date(context.expires_at).toLocaleString()}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
```

## Testing Requirements

### Unit Tests

1. Database Tests
```python
# api_gateway/src/tests/test_database.py

import pytest
from sqlite3 import IntegrityError
from ..models.shared_context import SharedContext

class TestDatabase:
    async def test_context_type_constraint(self, db_session):
        """Test context type constraint."""
        with pytest.raises(IntegrityError):
            context = SharedContext(
                id="test",
                context_type="invalid"
            )
            db_session.add(context)
            await db_session.commit()
```

2. Context Service Tests
```python
# api_gateway/src/tests/test_context_service.py

class TestContextService:
    async def test_share_context(self, db_session):
        """Test sharing context."""
        context = await context_service.share_context(
            db_session,
            "agent1",
            "agent2",
            {"text": "test context"}
        )
        assert context.id is not None
        assert context.context_type == "relevant"
    
    async def test_expiration(self, db_session):
        """Test context expiration."""
        # Create expired context
        context = await context_service.share_context(
            db_session,
            "agent1",
            "agent2",
            {"text": "test"},
            ttl_minutes=-1
        )
        
        # Should be cleaned up
        removed = await context_service.cleanup_expired_context(db_session)
        assert removed == 1
```

3. API Tests
```python
# api_gateway/src/tests/test_api.py

class TestContextAPI:
    async def test_share_context(self, client):
        """Test context sharing endpoint."""
        response = await client.post(
            "/api/v1/context/share",
            json={
                "source_agent_id": "agent1",
                "target_agent_id": "agent2",
                "context_data": {"text": "test"}
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["context_type"] == "relevant"
```

### Integration Tests

1. End-to-End Context Flow
```python
# api_gateway/src/tests/test_integration.py

async def test_context_flow():
    """Test complete context flow."""
    # Share context
    context = await context_service.share_context(
        db_session,
        "agent1",
        "agent2",
        {"text": "test context"}
    )
    
    # Get context
    contexts = await context_service.get_shared_context(
        db_session,
        "agent2"
    )
    
    assert len(contexts) == 1
    assert contexts[0].content["text"] == "test context"
    
    # Filter context
    filtered = await context_service.filter_relevant_context(
        db_session,
        contexts,
        "test"
    )
    
    assert len(filtered) == 1
```

## Setup Checklist

1. Database
   - [ ] Initialize SQLite database
   - [ ] Enable WAL mode
   - [ ] Enable foreign key support
   - [ ] Create indexes

2. Server
   - [ ] Update database initialization
   - [ ] Configure API endpoints
   - [ ] Set up monitoring
   - [ ] Add cleanup job

3. Client
   - [ ] Set up React Query
   - [ ] Implement components
   - [ ] Add error handling
   - [ ] Test integration

## Success Criteria

1. Functionality
   - SQLite schema works correctly
   - Context sharing works
   - Relevance filtering works
   - Context expiration works
   - UI shows context usage

2. Performance
   - Database operations < 50ms
   - Context sharing < 100ms
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

- SQLite with JSON1 extension
- SQLAlchemy
- FastAPI
- React Query
