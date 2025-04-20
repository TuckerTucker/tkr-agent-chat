# Feature Slice 5: Agent Communication Customization

This document details the implementation of user-configurable controls for agent communication behavior in a server/client architecture running locally.

## Overview

The agent communication customization system allows users to control how agents interact with each other through server-side configuration storage and client-side management via React Query.

## Components

### 1. Server-Side Configuration Model

```python
# api_gateway/src/models/communication_config.py

from sqlalchemy import Column, String, JSON, Integer, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base

class CommunicationConfig(Base):
    __tablename__ = "communication_configs"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=True)
    
    # Communication Style
    formality_level = Column(Integer)  # 1-5 (informal to formal)
    verbosity_level = Column(Integer)  # 1-5 (concise to verbose)
    technical_level = Column(Integer)  # 1-5 (simple to technical)
    
    # Visibility Settings
    visibility_mode = Column(
        Enum(
            "full",
            "collapsible",
            "summary",
            "background",
            name="visibility_mode"
        )
    )
    
    # Communication Triggers
    communication_trigger = Column(
        Enum(
            "auto",
            "user_approved",
            "explicit",
            "threshold",
            name="communication_trigger"
        )
    )
    confidence_threshold = Column(Integer)  # For threshold-based communication
    
    # Context Sharing
    context_sharing_mode = Column(
        Enum(
            "full",
            "relevant",
            "checkpoint",
            "user_approved",
            name="context_sharing_mode"
        )
    )
    
    # Agent Relationships
    agent_relationships = Column(JSON)  # Dict mapping agent pairs to relationship rules
    
    # Metadata
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
```

### 2. Server Configuration Service

```python
# api_gateway/src/services/communication_config.py

import uuid
import logging
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.communication_config import CommunicationConfig

logger = logging.getLogger(__name__)

class ConfigService:
    async def get_config(
        self,
        db: AsyncSession,
        session_id: Optional[str] = None
    ) -> CommunicationConfig:
        """Get communication config."""
        if session_id:
            # Try to get session-specific config
            result = await db.execute(
                select(CommunicationConfig).filter(
                    CommunicationConfig.session_id == session_id
                )
            )
            config = result.scalar_one_or_none()
            if config:
                return config
        
        # Return default config if nothing found
        return self._get_default_config()
    
    async def update_config(
        self,
        db: AsyncSession,
        config_updates: Dict[str, Any],
        session_id: Optional[str] = None
    ) -> CommunicationConfig:
        """Update communication config."""
        config = await self.get_config(db, session_id)
        
        # Create new config if one doesn't exist
        if not config.id or (session_id and not config.session_id == session_id):
            config = CommunicationConfig(
                id=str(uuid.uuid4()),
                session_id=session_id
            )
        
        # Update fields
        for key, value in config_updates.items():
            if hasattr(config, key):
                setattr(config, key, value)
        
        db.add(config)
        await db.commit()
        await db.refresh(config)
        
        return config
    
    def _get_default_config(self) -> CommunicationConfig:
        """Get default communication config."""
        return CommunicationConfig(
            id=str(uuid.uuid4()),
            formality_level=3,
            verbosity_level=3,
            technical_level=3,
            visibility_mode="full",
            communication_trigger="auto",
            confidence_threshold=80,
            context_sharing_mode="relevant",
            agent_relationships={}
        )

# Global instance
config_service = ConfigService()
```

### 3. Server API Endpoints

```python
# api_gateway/src/routes/config.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.communication_config import config_service

router = APIRouter()

@router.get("/api/v1/config/{session_id}")
async def get_config(
    session_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get communication config."""
    config = await config_service.get_config(db, session_id)
    return config

@router.post("/api/v1/config")
async def update_config(
    request: UpdateConfigRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update communication config."""
    try:
        config = await config_service.update_config(
            db,
            request.config_updates,
            request.session_id
        )
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 4. Client Configuration Service

```typescript
// src/services/config.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CommunicationConfig {
  id: string;
  session_id?: string;
  formality_level: number;
  verbosity_level: number;
  technical_level: number;
  visibility_mode: 'full' | 'collapsible' | 'summary' | 'background';
  communication_trigger: 'auto' | 'user_approved' | 'explicit' | 'threshold';
  confidence_threshold: number;
  context_sharing_mode: 'full' | 'relevant' | 'checkpoint' | 'user_approved';
  agent_relationships: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface UpdateConfigRequest {
  config_updates: Partial<CommunicationConfig>;
  session_id?: string;
}

export const configApi = {
  getConfig: async (sessionId?: string): Promise<CommunicationConfig> => {
    const response = await fetch(`/api/v1/config/${sessionId || ''}`);
    
    if (!response.ok) {
      throw new Error('Failed to get config');
    }
    
    return response.json();
  },

  updateConfig: async (request: UpdateConfigRequest): Promise<CommunicationConfig> => {
    const response = await fetch('/api/v1/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error('Failed to update config');
    }
    
    return response.json();
  }
};

// React Query hooks
export const useConfig = (sessionId?: string) => {
  return useQuery(
    ['config', sessionId],
    () => configApi.getConfig(sessionId)
  );
};

export const useUpdateConfig = () => {
  const queryClient = useQueryClient();
  
  return useMutation(
    (request: UpdateConfigRequest) => configApi.updateConfig(request),
    {
      onSuccess: (data) => {
        // Invalidate relevant queries
        queryClient.invalidateQueries(['config', data.session_id]);
      }
    }
  );
};
```

### 5. Client Configuration Components

```typescript
// src/components/ui/communication-settings.tsx

interface CommunicationSettingsProps {
  sessionId?: string;
}

export const CommunicationSettings: React.FC<CommunicationSettingsProps> = ({
  sessionId
}) => {
  const { data: config, isLoading } = useConfig(sessionId);
  const updateConfig = useUpdateConfig();
  
  if (isLoading) return <LoadingSpinner />;
  if (!config) return null;
  
  const handleUpdate = (updates: Partial<CommunicationConfig>) => {
    updateConfig.mutate({
      config_updates: updates,
      session_id: sessionId
    });
  };
  
  return (
    <div className="communication-settings">
      <h2>Communication Settings</h2>
      
      <section>
        <h3>Communication Style</h3>
        <Slider
          label="Formality"
          value={config.formality_level}
          min={1}
          max={5}
          onChange={value => handleUpdate({ formality_level: value })}
        />
        <Slider
          label="Verbosity"
          value={config.verbosity_level}
          min={1}
          max={5}
          onChange={value => handleUpdate({ verbosity_level: value })}
        />
        <Slider
          label="Technical Level"
          value={config.technical_level}
          min={1}
          max={5}
          onChange={value => handleUpdate({ technical_level: value })}
        />
      </section>
      
      <section>
        <h3>Visibility</h3>
        <Select
          value={config.visibility_mode}
          options={[
            { value: "full", label: "Show All" },
            { value: "collapsible", label: "Collapsible" },
            { value: "summary", label: "Summary Only" },
            { value: "background", label: "Hide" }
          ]}
          onChange={value => handleUpdate({ visibility_mode: value })}
        />
      </section>
      
      <section>
        <h3>Communication Triggers</h3>
        <Select
          value={config.communication_trigger}
          options={[
            { value: "auto", label: "Automatic" },
            { value: "user_approved", label: "Require Approval" },
            { value: "explicit", label: "Explicit Only" },
            { value: "threshold", label: "Confidence Threshold" }
          ]}
          onChange={value => handleUpdate({ communication_trigger: value })}
        />
        {config.communication_trigger === "threshold" && (
          <Slider
            label="Confidence Threshold"
            value={config.confidence_threshold}
            min={0}
            max={100}
            onChange={value => handleUpdate({ confidence_threshold: value })}
          />
        )}
      </section>
      
      <section>
        <h3>Context Sharing</h3>
        <Select
          value={config.context_sharing_mode}
          options={[
            { value: "full", label: "Share All" },
            { value: "relevant", label: "Relevant Only" },
            { value: "checkpoint", label: "Checkpoints Only" },
            { value: "user_approved", label: "Require Approval" }
          ]}
          onChange={value => handleUpdate({ context_sharing_mode: value })}
        />
      </section>
      
      <section>
        <h3>Agent Relationships</h3>
        <AgentRelationshipEditor
          relationships={config.agent_relationships}
          onChange={relationships => handleUpdate({ agent_relationships: relationships })}
        />
      </section>
    </div>
  );
};
```

## Testing Requirements

### Unit Tests

1. Config Service
```python
class TestConfigService:
    async def test_get_config(self):
        """Test getting communication config."""
        config = await config_service.get_config(
            db,
            session_id="session1"
        )
        assert config is not None
        assert config.visibility_mode == "full"
    
    async def test_update_config(self):
        """Test updating communication config."""
        updates = {
            "formality_level": 4,
            "visibility_mode": "collapsible"
        }
        config = await config_service.update_config(
            db,
            updates,
            session_id="session1"
        )
        assert config.formality_level == 4
        assert config.visibility_mode == "collapsible"
```

2. Config API
```typescript
describe('configApi', () => {
  it('should update config', async () => {
    const config = await configApi.updateConfig({
      config_updates: {
        formality_level: 4,
        visibility_mode: 'collapsible'
      },
      session_id: 'session1'
    });
    expect(config.formality_level).toBe(4);
    expect(config.visibility_mode).toBe('collapsible');
  });
});
```

### Integration Tests

1. End-to-End Config Flow
```python
async def test_config_flow():
    """Test complete config flow."""
    # Update config
    config = await config_service.update_config(...)
    
    # Get config
    retrieved = await config_service.get_config(...)
    
    assert retrieved.formality_level == config.formality_level
```

## Setup Checklist

1. Database
   - [ ] Create config table
   - [ ] Set up indexes
   - [ ] Test data consistency

2. Server
   - [ ] Initialize config service
   - [ ] Configure API endpoints
   - [ ] Set up monitoring

3. Client
   - [ ] Set up React Query
   - [ ] Implement components
   - [ ] Test integration

## Success Criteria

1. Functionality
   - Settings save correctly
   - Styles apply properly
   - Rules enforce correctly
   - UI works intuitively

2. Performance
   - Settings load < 50ms
   - Style processing < 10ms
   - Rule checking < 10ms
   - UI stays responsive

3. Reliability
   - Settings persist properly
   - No unexpected behavior
   - Graceful fallbacks
   - Clear error handling

## Next Steps

1. Test thoroughly
2. Document usage
3. Add error recovery
4. Prepare for Feature Slice 6: Monitoring and Analytics

## Dependencies

- PostgreSQL
- SQLAlchemy
- FastAPI
- React Query
