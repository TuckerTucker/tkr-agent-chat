# Feature Slice 1: Core Infrastructure

This document details the implementation of core infrastructure needed for A2A protocol support in a server/client architecture running locally.

## Overview

The core infrastructure slice establishes the foundational components needed to support agent-to-agent communication using the A2A protocol, with a clear separation between client and server components.

## Components

### 1. Server-Side Database Schema

```python
# api_gateway/src/models/agent_cards.py
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base

class AgentCard(Base):
    __tablename__ = "agent_cards"
    
    id = Column(String, primary_key=True)
    agent_id = Column(String, unique=True)
    name = Column(String)
    description = Column(String)
    capabilities = Column(JSON)  # Streaming, push notifications, etc.
    input_modes = Column(JSON)  # List of supported input MIME types
    output_modes = Column(JSON)  # List of supported output MIME types
    skills = Column(JSON)  # List of agent skills
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

class A2ATask(Base):
    __tablename__ = "a2a_tasks"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    client_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    remote_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    status = Column(
        Enum(
            "submitted",
            "working",
            "input-required",
            "completed",
            "canceled",
            "failed",
            name="task_status"
        )
    )
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    message = Column(JSON)  # The request message
    artifacts = Column(JSON)  # Task results
    metadata = Column(JSON)  # Additional task metadata
```

### 2. Server Database Setup

```python
# api_gateway/src/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "postgresql://localhost/tkr_agent_chat"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database."""
    Base.metadata.create_all(bind=engine)
```

### 3. A2A Service

```python
# api_gateway/src/services/a2a_service.py

import uuid
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.agent_cards import AgentCard, A2ATask
from ..services.chat_service import chat_service

logger = logging.getLogger(__name__)

class A2AService:
    async def register_agent_card(
        self,
        db: AsyncSession,
        agent_id: str,
        card_data: Dict[str, Any]
    ) -> AgentCard:
        """Register or update an agent's card."""
        # Check for existing card
        result = await db.execute(
            select(AgentCard).filter(AgentCard.agent_id == agent_id)
        )
        existing_card = result.scalar_one_or_none()
        
        if existing_card:
            # Update existing card
            for key, value in card_data.items():
                setattr(existing_card, key, value)
            card = existing_card
        else:
            # Create new card
            card = AgentCard(
                id=str(uuid.uuid4()),
                agent_id=agent_id,
                **card_data
            )
            db.add(card)
        
        await db.commit()
        await db.refresh(card)
        
        logger.info(f"Registered agent card for {agent_id}")
        return card
    
    async def create_task(
        self,
        db: AsyncSession,
        client_agent_id: str,
        remote_agent_id: str,
        message: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> A2ATask:
        """Create a new A2A task."""
        task_id = str(uuid.uuid4())
        session_id = metadata.get("session_id", str(uuid.uuid4()))
        
        task = A2ATask(
            id=task_id,
            session_id=session_id,
            client_agent_id=client_agent_id,
            remote_agent_id=remote_agent_id,
            status="submitted",
            message=message,
            metadata=metadata or {}
        )
        
        db.add(task)
        await db.commit()
        await db.refresh(task)
        
        logger.info(f"Created A2A task {task_id} from {client_agent_id} to {remote_agent_id}")
        return task

# Global instance
a2a_service = A2AService()
```

### 4. API Endpoints

```python
# api_gateway/src/routes/a2a.py

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.a2a_service import a2a_service

router = APIRouter()

@router.get("/api/v1/agent-card/{agent_id}")
async def get_agent_card(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get an agent's card."""
    card = await a2a_service.get_agent_card(db, agent_id)
    if not card:
        raise HTTPException(status_code=404, detail=f"Agent card not found: {agent_id}")
    return card

@router.post("/api/v1/tasks/send")
async def tasks_send(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """A2A tasks/send endpoint."""
    try:
        data = await request.json()
        
        # Extract JSON-RPC parameters
        if "jsonrpc" not in data or data["jsonrpc"] != "2.0":
            raise HTTPException(status_code=400, detail="Invalid JSON-RPC request")
        
        params = data.get("params", {})
        message = params.get("message")
        metadata = params.get("metadata", {})
        
        # Extract client and remote agent IDs from metadata
        client_agent_id = metadata.get("client_agent_id")
        remote_agent_id = metadata.get("remote_agent_id")
        
        if not client_agent_id or not remote_agent_id or not message:
            raise HTTPException(status_code=400, detail="Missing required parameters")
        
        # Create task
        task = await a2a_service.create_task(
            db,
            client_agent_id,
            remote_agent_id,
            message,
            metadata
        )
        
        # Return JSON-RPC response
        return {
            "jsonrpc": "2.0",
            "id": data.get("id", 1),
            "result": {
                "id": task.id,
                "sessionId": task.session_id,
                "status": {
                    "state": task.status,
                    "timestamp": datetime.utcnow().isoformat()
                },
                "metadata": task.metadata
            }
        }
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "id": data.get("id", 1),
            "error": {
                "code": -32603,
                "message": str(e)
            }
        }
```

### 5. Client-Side API Integration

```typescript
// src/services/api.ts

import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();

interface AgentCard {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  capabilities: string[];
  input_modes: string[];
  output_modes: string[];
  skills: string[];
}

interface A2ATask {
  id: string;
  session_id: string;
  status: string;
  metadata: Record<string, any>;
}

export const api = {
  getAgentCard: async (agentId: string): Promise<AgentCard> => {
    const response = await fetch(`/api/v1/agent-card/${agentId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch agent card');
    }
    return response.json();
  },

  sendTask: async (
    clientAgentId: string,
    remoteAgentId: string,
    message: any,
    metadata?: Record<string, any>
  ): Promise<A2ATask> => {
    const response = await fetch('/api/v1/tasks/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        params: {
          message,
          metadata: {
            client_agent_id: clientAgentId,
            remote_agent_id: remoteAgentId,
            ...metadata
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send task');
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.result;
  }
};

// React Query hooks
export const useAgentCard = (agentId: string) => {
  return useQuery(['agent', agentId], () => api.getAgentCard(agentId));
};

export const useSendTask = () => {
  return useMutation(
    ({ clientAgentId, remoteAgentId, message, metadata }) =>
      api.sendTask(clientAgentId, remoteAgentId, message, metadata)
  );
};
```

## Testing Requirements

### Unit Tests

1. Database Operations
```python
class TestDatabase:
    async def test_init_db(self):
        """Test database initialization."""
        init_db()
        assert engine.dialect.has_table(engine, "agent_cards")
```

2. A2A Service
```python
class TestA2AService:
    async def test_register_agent(self):
        """Test registering an agent card."""
        card = await a2a_service.register_agent_card(
            db,
            "test-agent",
            {"name": "Test Agent"}
        )
        assert card.id is not None
        assert card.name == "Test Agent"
```

### Integration Tests

1. End-to-End Flow
```python
async def test_a2a_flow():
    """Test complete A2A flow."""
    # Register agent
    card = await a2a_service.register_agent_card(...)
    
    # Create task
    task = await a2a_service.create_task(...)
    
    assert task.status == "submitted"
```

## Setup Checklist

1. Database
   - [ ] Initialize PostgreSQL database
   - [ ] Run migrations
   - [ ] Set up indexes
   - [ ] Configure backups

2. Server
   - [ ] Install Python dependencies
   - [ ] Configure FastAPI
   - [ ] Initialize services
   - [ ] Test endpoints

3. Client
   - [ ] Install npm dependencies
   - [ ] Configure React Query
   - [ ] Test API integration
   - [ ] Set up error handling

## Success Criteria

1. Functionality
   - Database operations working
   - Agent cards stored correctly
   - Tasks tracked properly
   - API responsive

2. Performance
   - Database operations < 50ms
   - API response < 100ms
   - Client caching working
   - Low resource usage

3. Reliability
   - No data loss
   - Proper error handling
   - Clean reconnection
   - Graceful degradation

## Next Steps

1. Test thoroughly
2. Document setup process
3. Create user guide
4. Prepare for Feature Slice 2: Basic Agent-to-Agent Communication

## Dependencies

- PostgreSQL
- SQLAlchemy
- FastAPI
- React Query
