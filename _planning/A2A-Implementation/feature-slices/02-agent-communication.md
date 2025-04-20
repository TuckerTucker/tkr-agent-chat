# Feature Slice 2: Agent Communication

This document details the implementation of agent-to-agent communication functionality using the A2A protocol in a server/client architecture running locally.

## Overview

Enable direct communication between agents through the A2A protocol, with WebSocket connections handling real-time communication between the client and server.

## Components

### 1. Server-Side WebSocket Manager

```python
# api_gateway/src/services/websocket_service.py

import asyncio
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.message_queue: asyncio.Queue = asyncio.Queue()
        
    async def connect(self, agent_id: str, websocket: WebSocket):
        """Connect an agent to WebSocket."""
        await websocket.accept()
        self.active_connections[agent_id] = websocket
        logger.info(f"Agent {agent_id} connected")
        
    async def disconnect(self, agent_id: str):
        """Disconnect an agent."""
        if agent_id in self.active_connections:
            del self.active_connections[agent_id]
            logger.info(f"Agent {agent_id} disconnected")
    
    async def send_message(
        self,
        source_agent_id: str,
        target_agent_id: str,
        message: dict
    ):
        """Send message between agents."""
        if target_agent_id in self.active_connections:
            websocket = self.active_connections[target_agent_id]
            await websocket.send_json({
                "type": "a2a_message",
                "source": source_agent_id,
                "content": message
            })
            logger.info(f"Message sent from {source_agent_id} to {target_agent_id}")
        else:
            logger.warning(f"Target agent {target_agent_id} not connected")
    
    async def broadcast_message(
        self,
        source_agent_id: str,
        message: dict,
        exclude: Optional[Set[str]] = None
    ):
        """Broadcast message to all agents except excluded ones."""
        exclude = exclude or set()
        exclude.add(source_agent_id)
        
        for agent_id, websocket in self.active_connections.items():
            if agent_id not in exclude:
                await websocket.send_json({
                    "type": "a2a_broadcast",
                    "source": source_agent_id,
                    "content": message
                })
        
        logger.info(f"Broadcast message sent from {source_agent_id}")

# Global instance
websocket_manager = WebSocketManager()
```

### 2. Server Message Router

```python
# api_gateway/src/services/message_router.py

import logging
from typing import Optional, Dict, Any

from ..models.a2a_tasks import A2ATask
from ..services.a2a_service import a2a_service
from ..services.websocket_service import websocket_manager

logger = logging.getLogger(__name__)

class MessageRouter:
    async def route_message(
        self,
        db: AsyncSession,
        source_agent_id: str,
        target_agent_id: str,
        content: Dict[str, Any],
        session_id: Optional[str] = None
    ) -> A2ATask:
        """Route a message between agents."""
        logger.info(f"Routing message from {source_agent_id} to {target_agent_id}")
        
        # Create A2A task
        task = await a2a_service.create_task(
            db,
            source_agent_id,
            target_agent_id,
            content,
            metadata={"session_id": session_id} if session_id else {}
        )
        
        # Send message via WebSocket
        await websocket_manager.send_message(
            source_agent_id,
            target_agent_id,
            {
                "task_id": task.id,
                "content": content
            }
        )
        
        return task

# Global instance
message_router = MessageRouter()
```

### 3. Server WebSocket Endpoints

```python
# api_gateway/src/routes/ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..services.websocket_service import websocket_manager

router = APIRouter()

@router.websocket("/ws/v1/chat/{session_id}/{agent_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, agent_id: str):
    """WebSocket endpoint for agent communication."""
    await websocket_manager.connect(agent_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "a2a_message":
                await message_router.route_message(
                    db,
                    data["source"],
                    data["target"],
                    data["content"],
                    session_id
                )
            elif data["type"] == "a2a_broadcast":
                await websocket_manager.broadcast_message(
                    data["source"],
                    data["content"]
                )
                
    except WebSocketDisconnect:
        await websocket_manager.disconnect(agent_id)
```

### 4. Client WebSocket Service

```typescript
// src/services/websocket.ts

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface WebSocketMessage {
  type: 'a2a_message' | 'a2a_broadcast';
  source: string;
  content: any;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout = 1000;
  private queryClient: any;

  constructor(queryClient: any) {
    this.queryClient = queryClient;
  }

  connect(sessionId: string, agentId: string) {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(`ws://localhost:8000/ws/v1/chat/${sessionId}/${agentId}`);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };
    
    this.ws.onmessage = (event) => {
      const data: WebSocketMessage = JSON.parse(event.data);
      
      if (data.type === 'a2a_message') {
        // Invalidate relevant queries
        this.queryClient.invalidateQueries(['messages', sessionId]);
        
        // Update UI immediately if needed
        this.queryClient.setQueryData(
          ['messages', sessionId],
          (old: any[]) => [...old, data.content]
        );
      }
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.attemptReconnect(sessionId, agentId);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private attemptReconnect(sessionId: string, agentId: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect(sessionId, agentId);
      }, this.reconnectTimeout * this.reconnectAttempts);
    }
  }

  sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// React Hook
export const useWebSocket = (sessionId: string, agentId: string) => {
  const queryClient = useQueryClient();
  
  const connect = useCallback(() => {
    const ws = new WebSocketService(queryClient);
    ws.connect(sessionId, agentId);
    return ws;
  }, [sessionId, agentId, queryClient]);
  
  useEffect(() => {
    const ws = connect();
    return () => ws.disconnect();
  }, [connect]);
};
```

### 5. Client Message Components

```typescript
// src/components/ui/message-composer.tsx

export const MessageComposer: React.FC = () => {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<AgentMention[]>([]);
  const currentAgent = useStore(state => state.currentAgent);
  const sessionId = useStore(state => state.sessionId);
  const sendTask = useSendTask();
  
  const handleInput = (value: string) => {
    setText(value);
    const newMentions = extractMentions(value);
    setMentions(newMentions);
  };
  
  const handleSend = async () => {
    if (mentions.length > 0) {
      // Send to each mentioned agent
      for (const mention of mentions) {
        await sendTask.mutateAsync({
          clientAgentId: currentAgent.id,
          remoteAgentId: mention.agentId,
          message: { text },
          metadata: { session_id: sessionId }
        });
      }
    }
    
    setText('');
    setMentions([]);
  };
  
  return (
    <div className="message-composer">
      <TextArea
        value={text}
        onChange={handleInput}
        placeholder="Type a message... Use @ to mention agents"
      />
      <Button onClick={handleSend}>Send</Button>
    </div>
  );
};
```

## Testing Requirements

### Unit Tests

1. WebSocket Manager
```python
class TestWebSocketManager:
    async def test_connection(self):
        """Test WebSocket connection."""
        ws = MockWebSocket()
        await websocket_manager.connect("agent1", ws)
        assert "agent1" in websocket_manager.active_connections
```

2. Message Router
```python
class TestMessageRouter:
    async def test_route_message(self):
        """Test message routing."""
        task = await message_router.route_message(
            db,
            "agent1",
            "agent2",
            {"text": "test"}
        )
        assert task.status == "submitted"
```

### Integration Tests

1. End-to-End Communication
```python
async def test_communication_flow():
    """Test complete communication flow."""
    # Connect agents
    ws1 = MockWebSocket()
    ws2 = MockWebSocket()
    await websocket_manager.connect("agent1", ws1)
    await websocket_manager.connect("agent2", ws2)
    
    # Send message
    await message_router.route_message(
        db,
        "agent1",
        "agent2",
        {"text": "test"}
    )
    
    # Verify message received
    message = await ws2.receive_json()
    assert message["source"] == "agent1"
```

## Setup Checklist

1. Server
   - [ ] Configure WebSocket endpoints
   - [ ] Initialize WebSocket manager
   - [ ] Set up message router
   - [ ] Test connections

2. Client
   - [ ] Set up WebSocket service
   - [ ] Configure React Query
   - [ ] Implement UI components
   - [ ] Test real-time updates

## Success Criteria

1. Functionality
   - WebSocket connections stable
   - Messages route correctly
   - UI updates in real-time
   - Error handling works

2. Performance
   - Message routing < 50ms
   - WebSocket latency < 10ms
   - UI remains responsive
   - Low resource usage

3. Reliability
   - No message loss
   - Clean reconnection
   - Error recovery works
   - Graceful degradation

## Next Steps

1. Test thoroughly
2. Document usage
3. Add error recovery
4. Prepare for Feature Slice 3: Context Sharing

## Dependencies

- FastAPI
- WebSockets
- React Query
- TanStack Query
