# Feature Slice 6: Monitoring and Analytics

This document details the implementation of monitoring and analytics for agent communication in a server/client architecture running locally.

## Overview

The monitoring system tracks agent communication patterns, performance metrics, and system health through server-side collection and client-side visualization via React Query.

## Components

### 1. Server-Side Metrics Model

```python
# api_gateway/src/models/metrics.py

from sqlalchemy import Column, String, JSON, Integer, Float, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base

class CommunicationMetric(Base):
    __tablename__ = "communication_metrics"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    timestamp = Column(DateTime, server_default=func.now())
    
    # Message Metrics
    source_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    target_agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    message_type = Column(String)
    message_size = Column(Integer)
    processing_time = Column(Float)  # milliseconds
    
    # Performance Metrics
    response_time = Column(Float)  # milliseconds
    cpu_usage = Column(Float)  # percentage
    memory_usage = Column(Float)  # MB
    
    # Context Metrics
    context_size = Column(Integer)  # bytes
    context_relevance_score = Column(Float)  # 0-1
    
    # Error Metrics
    error_count = Column(Integer, default=0)
    error_type = Column(String, nullable=True)
    retry_count = Column(Integer, default=0)

class SystemMetric(Base):
    __tablename__ = "system_metrics"
    
    id = Column(String, primary_key=True)
    timestamp = Column(DateTime, server_default=func.now())
    
    # System Health
    cpu_usage = Column(Float)  # percentage
    memory_usage = Column(Float)  # MB
    disk_usage = Column(Float)  # MB
    network_latency = Column(Float)  # milliseconds
    
    # Database Metrics
    db_connections = Column(Integer)
    db_query_time = Column(Float)  # milliseconds
    db_size = Column(Float)  # MB
    
    # WebSocket Metrics
    active_connections = Column(Integer)
    message_queue_size = Column(Integer)
    websocket_latency = Column(Float)  # milliseconds

class AgentMetric(Base):
    __tablename__ = "agent_metrics"
    
    id = Column(String, primary_key=True)
    agent_id = Column(String, ForeignKey("agent_cards.agent_id"))
    timestamp = Column(DateTime, server_default=func.now())
    
    # Performance
    response_time = Column(Float)  # milliseconds
    processing_time = Column(Float)  # milliseconds
    error_rate = Column(Float)  # percentage
    
    # Usage
    request_count = Column(Integer)
    success_count = Column(Integer)
    failure_count = Column(Integer)
    
    # Resource Usage
    memory_usage = Column(Float)  # MB
    cpu_usage = Column(Float)  # percentage
```

### 2. Server Metrics Service

```python
# api_gateway/src/services/metrics_service.py

import uuid
import logging
import psutil
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.metrics import CommunicationMetric, SystemMetric, AgentMetric

logger = logging.getLogger(__name__)

class MetricsService:
    async def record_communication_metric(
        self,
        db: AsyncSession,
        source_agent_id: str,
        target_agent_id: str,
        message_type: str,
        message_size: int,
        processing_time: float,
        session_id: Optional[str] = None,
        context_metrics: Optional[Dict[str, Any]] = None,
        error_info: Optional[Dict[str, Any]] = None
    ) -> CommunicationMetric:
        """Record communication metrics."""
        metric = CommunicationMetric(
            id=str(uuid.uuid4()),
            session_id=session_id,
            source_agent_id=source_agent_id,
            target_agent_id=target_agent_id,
            message_type=message_type,
            message_size=message_size,
            processing_time=processing_time,
            response_time=processing_time,  # Can be updated with actual response time
            cpu_usage=psutil.cpu_percent(),
            memory_usage=psutil.Process().memory_info().rss / 1024 / 1024,
            context_size=context_metrics.get("size", 0) if context_metrics else 0,
            context_relevance_score=context_metrics.get("relevance", 0.0) if context_metrics else 0.0,
            error_count=1 if error_info else 0,
            error_type=error_info.get("type") if error_info else None,
            retry_count=error_info.get("retries", 0) if error_info else 0
        )
        
        db.add(metric)
        await db.commit()
        await db.refresh(metric)
        
        return metric
    
    async def record_system_metric(
        self,
        db: AsyncSession
    ) -> SystemMetric:
        """Record system metrics."""
        metric = SystemMetric(
            id=str(uuid.uuid4()),
            cpu_usage=psutil.cpu_percent(),
            memory_usage=psutil.virtual_memory().used / 1024 / 1024,
            disk_usage=psutil.disk_usage('/').used / 1024 / 1024,
            network_latency=0.0,  # TODO: Implement network latency check
            db_connections=0,  # TODO: Get from connection pool
            db_query_time=0.0,  # TODO: Implement query time tracking
            db_size=0.0,  # TODO: Get database size
            active_connections=len(websocket_manager.active_connections),
            message_queue_size=websocket_manager.message_queue.qsize(),
            websocket_latency=0.0  # TODO: Implement WebSocket latency check
        )
        
        db.add(metric)
        await db.commit()
        await db.refresh(metric)
        
        return metric
    
    async def record_agent_metric(
        self,
        db: AsyncSession,
        agent_id: str,
        performance_metrics: Dict[str, Any]
    ) -> AgentMetric:
        """Record agent-specific metrics."""
        metric = AgentMetric(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            response_time=performance_metrics.get("response_time", 0.0),
            processing_time=performance_metrics.get("processing_time", 0.0),
            error_rate=performance_metrics.get("error_rate", 0.0),
            request_count=performance_metrics.get("request_count", 0),
            success_count=performance_metrics.get("success_count", 0),
            failure_count=performance_metrics.get("failure_count", 0),
            memory_usage=performance_metrics.get("memory_usage", 0.0),
            cpu_usage=performance_metrics.get("cpu_usage", 0.0)
        )
        
        db.add(metric)
        await db.commit()
        await db.refresh(metric)
        
        return metric
    
    async def get_metrics(
        self,
        db: AsyncSession,
        metric_type: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Any]:
        """Get metrics from database."""
        model = {
            "communication": CommunicationMetric,
            "system": SystemMetric,
            "agent": AgentMetric
        }.get(metric_type)
        
        if not model:
            raise ValueError(f"Invalid metric type: {metric_type}")
        
        query = select(model)
        
        if start_time:
            query = query.filter(model.timestamp >= start_time)
        if end_time:
            query = query.filter(model.timestamp <= end_time)
            
        if filters:
            for key, value in filters.items():
                if hasattr(model, key):
                    query = query.filter(getattr(model, key) == value)
                    
        result = await db.execute(query)
        return result.scalars().all()

# Global instance
metrics_service = MetricsService()
```

### 3. Server API Endpoints

```python
# api_gateway/src/routes/metrics.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.metrics_service import metrics_service

router = APIRouter()

@router.get("/api/v1/metrics/{metric_type}")
async def get_metrics(
    metric_type: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    filters: Optional[Dict[str, Any]] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get metrics."""
    try:
        metrics = await metrics_service.get_metrics(
            db,
            metric_type,
            start_time,
            end_time,
            filters
        )
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 4. Client Metrics Service

```typescript
// src/services/metrics.ts

import { useQuery } from '@tanstack/react-query';

interface MetricsRequest {
  metric_type: 'communication' | 'system' | 'agent';
  start_time?: string;
  end_time?: string;
  filters?: Record<string, any>;
}

export const metricsApi = {
  getMetrics: async (request: MetricsRequest): Promise<any[]> => {
    const params = new URLSearchParams();
    if (request.start_time) params.append('start_time', request.start_time);
    if (request.end_time) params.append('end_time', request.end_time);
    if (request.filters) params.append('filters', JSON.stringify(request.filters));
    
    const response = await fetch(
      `/api/v1/metrics/${request.metric_type}?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get metrics');
    }
    
    return response.json();
  }
};

// React Query hooks
export const useMetrics = (request: MetricsRequest) => {
  return useQuery(
    ['metrics', request.metric_type, request.start_time, request.end_time, request.filters],
    () => metricsApi.getMetrics(request)
  );
};
```

### 5. Client Visualization Components

```typescript
// src/components/ui/metrics-dashboard.tsx

interface MetricsDashboardProps {
  sessionId?: string;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  sessionId
}) => {
  const [timeRange, setTimeRange] = useState<[Date, Date]>([
    subHours(new Date(), 1),
    new Date()
  ]);
  
  const communicationMetrics = useMetrics({
    metric_type: 'communication',
    start_time: timeRange[0].toISOString(),
    end_time: timeRange[1].toISOString(),
    filters: sessionId ? { session_id: sessionId } : undefined
  });
  
  const systemMetrics = useMetrics({
    metric_type: 'system',
    start_time: timeRange[0].toISOString(),
    end_time: timeRange[1].toISOString()
  });
  
  const agentMetrics = useMetrics({
    metric_type: 'agent',
    start_time: timeRange[0].toISOString(),
    end_time: timeRange[1].toISOString()
  });
  
  if (communicationMetrics.isLoading || systemMetrics.isLoading || agentMetrics.isLoading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="metrics-dashboard">
      <header>
        <h2>System Metrics</h2>
        <TimeRangeSelector
          value={timeRange}
          onChange={setTimeRange}
        />
      </header>
      
      <div className="metrics-grid">
        <Card>
          <h3>Communication Performance</h3>
          <LineChart
            data={communicationMetrics.data}
            xKey="timestamp"
            yKey="processing_time"
            label="Processing Time (ms)"
          />
        </Card>
        
        <Card>
          <h3>System Health</h3>
          <AreaChart
            data={systemMetrics.data}
            series={[
              { key: "cpu_usage", label: "CPU Usage %" },
              { key: "memory_usage", label: "Memory Usage MB" }
            ]}
          />
        </Card>
        
        <Card>
          <h3>Agent Performance</h3>
          <BarChart
            data={agentMetrics.data}
            xKey="agent_id"
            yKey="response_time"
            label="Response Time (ms)"
          />
        </Card>
        
        <Card>
          <h3>Error Rates</h3>
          <PieChart
            data={agentMetrics.data.map(m => ({
              label: m.agent_id,
              value: m.error_rate
            }))}
          />
        </Card>
      </div>
      
      <div className="metrics-tables">
        <DataTable
          title="Communication Details"
          data={communicationMetrics.data}
          columns={[
            { key: "timestamp", label: "Time" },
            { key: "source_agent_id", label: "Source" },
            { key: "target_agent_id", label: "Target" },
            { key: "message_type", label: "Type" },
            { key: "processing_time", label: "Processing Time" }
          ]}
        />
        
        <DataTable
          title="System Details"
          data={systemMetrics.data}
          columns={[
            { key: "timestamp", label: "Time" },
            { key: "cpu_usage", label: "CPU %" },
            { key: "memory_usage", label: "Memory" },
            { key: "active_connections", label: "Connections" }
          ]}
        />
      </div>
    </div>
  );
};
```

## Testing Requirements

### Unit Tests

1. Metrics Service
```python
class TestMetricsService:
    async def test_record_communication_metric(self):
        """Test recording communication metrics."""
        metric = await metrics_service.record_communication_metric(
            db,
            "agent1",
            "agent2",
            "text",
            100,
            50.0
        )
        assert metric.id is not None
        assert metric.processing_time == 50.0
```

2. Metrics API
```typescript
describe('metricsApi', () => {
  it('should get metrics', async () => {
    const metrics = await metricsApi.getMetrics({
      metric_type: 'communication',
      start_time: '2025-04-19T00:00:00Z'
    });
    expect(metrics.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests

1. End-to-End Metrics Flow
```python
async def test_metrics_flow():
    """Test complete metrics flow."""
    # Record metric
    metric = await metrics_service.record_communication_metric(...)
    
    # Get metrics
    metrics = await metrics_service.get_metrics(...)
    
    assert len(metrics) > 0
    assert metrics[0].processing_time == metric.processing_time
```

## Setup Checklist

1. Database
   - [ ] Create metrics tables
   - [ ] Set up indexes
   - [ ] Configure retention

2. Server
   - [ ] Initialize metrics service
   - [ ] Configure API endpoints
   - [ ] Set up collectors

3. Client
   - [ ] Set up React Query
   - [ ] Implement visualizations
   - [ ] Test real-time updates

## Success Criteria

1. Functionality
   - Metrics collected properly
   - Data visualized clearly
   - Real-time updates work
   - Filtering works

2. Performance
   - Collection overhead < 1ms
   - Query response < 100ms
   - UI remains responsive
   - Low resource usage

3. Reliability
   - No data loss
   - Accurate measurements
   - Graceful degradation
   - Clear error handling

## Next Steps

1. Test thoroughly
2. Document usage
3. Add alerting
4. Add custom metrics

## Dependencies

- PostgreSQL
- SQLAlchemy
- FastAPI
- React Query
- Chart.js
