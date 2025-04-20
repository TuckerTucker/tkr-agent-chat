# Feature Slice 4: Conversation Checkpoints

This document details the implementation of checkpoint-based summarization for efficient context sharing between agents in a server/client architecture running locally.

## Overview

Conversation checkpoints provide a way to create and manage summaries of conversation segments, enabling more efficient context sharing between agents and reducing the amount of context that needs to be processed. Checkpoints are stored server-side and managed through React Query on the client.

## Components

### 1. Server-Side Checkpoint Model

```python
# api_gateway/src/models/checkpoints.py

from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base

class ConversationCheckpoint(Base):
    __tablename__ = "conversation_checkpoints"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    creator_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    checkpoint_type = Column(
        Enum(
            "automatic",
            "manual",
            "topic_change",
            "agent_switch",
            name="checkpoint_type"
        )
    )
    start_message_id = Column(String, ForeignKey("messages.id"))
    end_message_id = Column(String, ForeignKey("messages.id"))
    summary = Column(String)  # The checkpoint summary
    topics = Column(JSON)  # List of topics covered
    key_points = Column(JSON)  # List of key points
    participating_agents = Column(JSON)  # List of agents involved
    metadata = Column(JSON)  # Additional checkpoint metadata
    created_at = Column(DateTime, server_default=func.now())
```

### 2. Server Checkpoint Service

```python
# api_gateway/src/services/checkpoint_service.py

import uuid
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.checkpoints import ConversationCheckpoint
from ..models.messages import Message
from ..services.chat_service import chat_service

logger = logging.getLogger(__name__)

class CheckpointService:
    async def create_checkpoint(
        self,
        db: AsyncSession,
        session_id: str,
        creator_agent_id: str,
        start_message_id: str,
        end_message_id: str,
        checkpoint_type: str = "automatic",
        metadata: Optional[Dict[str, Any]] = None
    ) -> ConversationCheckpoint:
        """Create a new conversation checkpoint."""
        # Get messages for summarization
        messages = await self._get_messages_range(
            db,
            start_message_id,
            end_message_id
        )
        
        # Generate summary using creator agent
        creator_agent = chat_service.get_agent(creator_agent_id)
        if not creator_agent:
            raise ValueError(f"Creator agent {creator_agent_id} not found")
            
        summary_data = await self._generate_summary(
            creator_agent,
            messages
        )
        
        # Create checkpoint
        checkpoint = ConversationCheckpoint(
            id=str(uuid.uuid4()),
            session_id=session_id,
            creator_agent_id=creator_agent_id,
            checkpoint_type=checkpoint_type,
            start_message_id=start_message_id,
            end_message_id=end_message_id,
            summary=summary_data["summary"],
            topics=summary_data["topics"],
            key_points=summary_data["key_points"],
            participating_agents=list(set(msg.agent_id for msg in messages if msg.agent_id)),
            metadata=metadata or {}
        )
        
        db.add(checkpoint)
        await db.commit()
        await db.refresh(checkpoint)
        
        logger.info(f"Created checkpoint {checkpoint.id}")
        return checkpoint
    
    async def get_checkpoints(
        self,
        db: AsyncSession,
        session_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> List[ConversationCheckpoint]:
        """Get checkpoints from database."""
        query = select(ConversationCheckpoint).filter(
            ConversationCheckpoint.session_id == session_id
        )
        
        if start_time:
            query = query.filter(ConversationCheckpoint.created_at >= start_time)
        if end_time:
            query = query.filter(ConversationCheckpoint.created_at <= end_time)
            
        result = await db.execute(query)
        return result.scalars().all()
    
    async def _get_messages_range(
        self,
        db: AsyncSession,
        start_id: str,
        end_id: str
    ) -> List[Message]:
        """Get messages between start and end IDs."""
        result = await db.execute(
            select(Message).filter(
                Message.id >= start_id,
                Message.id <= end_id
            ).order_by(Message.created_at)
        )
        return result.scalars().all()
    
    async def _generate_summary(
        self,
        agent: Any,
        messages: List[Message]
    ) -> Dict[str, Any]:
        """Use an agent to generate a summary of messages."""
        # Format messages for summarization
        formatted_messages = [
            f"{msg.agent_id or 'User'}: {msg.content}"
            for msg in messages
        ]
        message_text = "\n".join(formatted_messages)
        
        # Create ADK content for summarization
        content = Content(
            role="user",
            parts=[
                Part.from_text(
                    text="Please summarize this conversation segment and extract key points and topics:\n\n" + 
                         message_text
                )
            ]
        )
        
        # Create ADK session
        session = agent.session_service.create_session(
            app_name=APP_NAME,
            user_id="summarization",
            session_id=str(uuid.uuid4())
        )
        
        # Run summarization
        runner = Runner(
            app_name=APP_NAME,
            agent=agent,
            session_service=agent.session_service
        )
        
        response = await runner.run(
            session=session,
            content=content
        )
        
        # Parse response into summary format
        # TODO: Implement proper response parsing
        # For now, return dummy structure
        return {
            "summary": response.parts[0].text if response and response.parts else "",
            "topics": [],
            "key_points": []
        }

# Global instance
checkpoint_service = CheckpointService()
```

### 3. Server API Endpoints

```python
# api_gateway/src/routes/checkpoints.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.checkpoint_service import checkpoint_service

router = APIRouter()

@router.post("/api/v1/checkpoints")
async def create_checkpoint(
    request: CreateCheckpointRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new checkpoint."""
    try:
        checkpoint = await checkpoint_service.create_checkpoint(
            db,
            request.session_id,
            request.creator_agent_id,
            request.start_message_id,
            request.end_message_id,
            request.checkpoint_type,
            request.metadata
        )
        return checkpoint
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/v1/checkpoints/{session_id}")
async def get_checkpoints(
    session_id: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get checkpoints for a session."""
    checkpoints = await checkpoint_service.get_checkpoints(
        db,
        session_id,
        start_time,
        end_time
    )
    return checkpoints
```

### 4. Client Checkpoint Service

```typescript
// src/services/checkpoints.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ConversationCheckpoint {
  id: string;
  session_id: string;
  creator_agent_id: string;
  checkpoint_type: 'automatic' | 'manual' | 'topic_change' | 'agent_switch';
  start_message_id: string;
  end_message_id: string;
  summary: string;
  topics: string[];
  key_points: string[];
  participating_agents: string[];
  metadata: Record<string, any>;
  created_at: string;
}

interface CreateCheckpointRequest {
  session_id: string;
  creator_agent_id: string;
  start_message_id: string;
  end_message_id: string;
  checkpoint_type?: string;
  metadata?: Record<string, any>;
}

export const checkpointApi = {
  createCheckpoint: async (request: CreateCheckpointRequest): Promise<ConversationCheckpoint> => {
    const response = await fetch('/api/v1/checkpoints', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create checkpoint');
    }
    
    return response.json();
  },

  getCheckpoints: async (
    sessionId: string,
    startTime?: string,
    endTime?: string
  ): Promise<ConversationCheckpoint[]> => {
    const params = new URLSearchParams();
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    
    const response = await fetch(
      `/api/v1/checkpoints/${sessionId}?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get checkpoints');
    }
    
    return response.json();
  }
};

// React Query hooks
export const useCheckpoints = (
  sessionId: string,
  startTime?: string,
  endTime?: string
) => {
  return useQuery(
    ['checkpoints', sessionId, startTime, endTime],
    () => checkpointApi.getCheckpoints(sessionId, startTime, endTime)
  );
};

export const useCreateCheckpoint = () => {
  const queryClient = useQueryClient();
  
  return useMutation(
    (request: CreateCheckpointRequest) => checkpointApi.createCheckpoint(request),
    {
      onSuccess: (data) => {
        // Invalidate relevant queries
        queryClient.invalidateQueries(['checkpoints', data.session_id]);
      }
    }
  );
};
```

### 5. Client Checkpoint Components

```typescript
// src/components/ui/checkpoint-marker.tsx

interface CheckpointMarkerProps {
  checkpoint: ConversationCheckpoint;
  onExpand?: () => void;
}

export const CheckpointMarker: React.FC<CheckpointMarkerProps> = ({
  checkpoint,
  onExpand
}) => {
  return (
    <div className="checkpoint-marker">
      <div className="checkpoint-header">
        <CheckpointIcon type={checkpoint.checkpoint_type} />
        <span className="checkpoint-title">Conversation Checkpoint</span>
        <button onClick={onExpand}>
          <ExpandIcon />
        </button>
      </div>
      <div className="checkpoint-summary">
        <p>{checkpoint.summary}</p>
        <div className="checkpoint-topics">
          {checkpoint.topics.map(topic => (
            <span key={topic} className="topic-tag">
              {topic}
            </span>
          ))}
        </div>
        <div className="checkpoint-agents">
          {checkpoint.participating_agents.map(agentId => (
            <AgentAvatar key={agentId} agentId={agentId} />
          ))}
        </div>
      </div>
    </div>
  );
};

// src/components/ui/message-list.tsx

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  checkpoints,
  ...props
}) => {
  const items = interleaveCheckpoints(messages, checkpoints);
  
  return (
    <div className="message-list">
      {items.map(item => (
        item.type === "message" ? (
          <Message key={item.id} message={item} />
        ) : (
          <CheckpointMarker key={item.id} checkpoint={item} />
        )
      ))}
    </div>
  );
};
```

## Testing Requirements

### Unit Tests

1. Checkpoint Service
```python
class TestCheckpointService:
    async def test_create_checkpoint(self):
        """Test creating a checkpoint."""
        checkpoint = await checkpoint_service.create_checkpoint(
            db,
            "session1",
            "agent1",
            "msg1",
            "msg10"
        )
        assert checkpoint.id is not None
        assert checkpoint.summary is not None
```

2. Checkpoint API
```typescript
describe('checkpointApi', () => {
  it('should create checkpoint', async () => {
    const checkpoint = await checkpointApi.createCheckpoint({
      session_id: 'session1',
      creator_agent_id: 'agent1',
      start_message_id: 'msg1',
      end_message_id: 'msg10'
    });
    expect(checkpoint.id).toBeDefined();
  });
});
```

### Integration Tests

1. End-to-End Checkpoint Flow
```python
async def test_checkpoint_flow():
    """Test complete checkpoint flow."""
    # Create checkpoint
    checkpoint = await checkpoint_service.create_checkpoint(...)
    
    # Get checkpoints
    checkpoints = await checkpoint_service.get_checkpoints(...)
    
    assert len(checkpoints) > 0
    assert checkpoints[0].summary == checkpoint.summary
```

## Setup Checklist

1. Database
   - [ ] Create checkpoint table
   - [ ] Set up indexes
   - [ ] Test data consistency

2. Server
   - [ ] Initialize checkpoint service
   - [ ] Configure API endpoints
   - [ ] Set up monitoring

3. Client
   - [ ] Set up React Query
   - [ ] Implement components
   - [ ] Test integration

## Success Criteria

1. Functionality
   - Automatic checkpoints work
   - Manual checkpoints work
   - Summaries are accurate
   - UI displays properly

2. Performance
   - Checkpoint creation < 1s
   - Summary generation < 500ms
   - UI remains responsive
   - Low memory usage

3. Reliability
   - No data loss
   - Error handling works
   - Consistent triggers
   - Accurate summaries

## Next Steps

1. Test thoroughly
2. Document usage
3. Add error recovery
4. Prepare for Feature Slice 5: Agent Communication Customization

## Dependencies

- PostgreSQL
- SQLAlchemy
- FastAPI
- React Query
