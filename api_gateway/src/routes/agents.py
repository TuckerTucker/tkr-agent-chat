"""
Agent metadata and management routes.

Provides:
- Agent list and metadata
- Agent status updates
- Agent registration/deregistration
"""

from enum import Enum
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.chat_service import chat_service

router = APIRouter()

# Models

class AgentStatus(str, Enum):
    """Agent status enum."""
    AVAILABLE = "available"
    BUSY = "busy"
    OFFLINE = "offline"

class AgentMetadata(BaseModel):
    """Extended agent information including status and capabilities."""
    id: str
    name: str
    description: str
    color: str
    avatar: Optional[str] = None
    capabilities: List[str]
    metadata: Optional[Dict[str, str]] = None

    class Config:
        from_attributes = True

class AgentList(BaseModel):
    """List of available agents and their metadata."""
    agents: List[AgentMetadata]

    class Config:
        from_attributes = True

# Routes

@router.get("/", response_model=AgentList)
async def list_agents():
    """Get list of all available agents and their metadata."""
    try:
        agents = chat_service.get_agents()
        agent_metadata_list = []
        for agent in agents:
            # Defensive check for attributes before creating AgentMetadata
            agent_id = getattr(agent, 'id', 'unknown')
            agent_meta = AgentMetadata(
                id=agent_id,
                name=getattr(agent, 'name', 'Unknown Agent'),
                description=getattr(agent, 'description', ''),
                color=getattr(agent, 'color', '#808080'),
                avatar=getattr(agent, 'avatar', None),
                capabilities=getattr(agent, 'capabilities', []),
            )
            agent_metadata_list.append(agent_meta)
        return AgentList(agents=agent_metadata_list)
    except Exception as e:
        logger.error(f"Error in list_agents: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving agent list: {e}")

@router.get("/{agent_id}", response_model=AgentMetadata)
async def get_agent(agent_id: str):
    """Get metadata for a specific agent."""
    try:
        agent = chat_service.get_agent(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        return AgentMetadata(
            id=agent.id,
            name=agent.name,
            description=agent.description,
            color=agent.color,
            capabilities=getattr(agent, 'capabilities', []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
