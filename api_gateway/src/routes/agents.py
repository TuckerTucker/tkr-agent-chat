"""
Agent metadata and management routes.

Provides:
- Agent list and metadata
- Agent status updates
- Agent registration/deregistration
"""

import enum # Import enum module
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..services.chat_service import chat_service
# Removed A2A/BaseAgent imports

router = APIRouter()

# Models

class AgentStatus(str, enum.Enum): # Inherit from str and enum.Enum (or use StrEnum in Python 3.11+)
    AVAILABLE = "available"
    BUSY = "busy"
    OFFLINE = "offline"

class AgentMetadata(BaseModel):
    """Extended agent information including status and capabilities."""
    id: str
    name: str
    description: str
    color: str
    # status: AgentStatus = AgentStatus.AVAILABLE # Remove status field
    capabilities: List[str]
    metadata: Optional[Dict[str, str]] = None # Keep optional metadata

class AgentList(BaseModel):
    """List of available agents and their metadata."""
    agents: List[AgentMetadata]

class AgentUpdateEvent(BaseModel):
    """Event for agent status or metadata updates."""
    agent_id: str
    status: Optional[AgentStatus] = None
    metadata: Optional[Dict[str, str]] = None

# Routes

@router.get("/", response_model=AgentList)
async def list_agents():
    """Get list of all available agents and their metadata."""
    # Restore original code
    try:
        agents = chat_service.get_agents()
        agent_metadata_list = []
        for agent in agents:
             # Defensive check for attributes before creating AgentMetadata
             agent_id = getattr(agent, 'id', 'unknown')
             # status = chat_service.agent_status.get(agent_id, AgentStatus.AVAILABLE) # Status removed
             agent_meta = AgentMetadata( # Rename variable for clarity
                 id=agent_id,
                 name=getattr(agent, 'name', 'Unknown Agent'),
                 description=getattr(agent, 'description', ''),
                 color=getattr(agent, 'color', '#808080'), # Default color
                 capabilities=getattr(agent, 'capabilities', []),
                 # status=status, # Remove status assignment
             )
             agent_metadata_list.append(agent_meta) # Append the renamed variable
        return AgentList(agents=agent_metadata_list)
    except Exception as e:
        print(f"ERROR in list_agents: {e}") # Add print statement for debugging
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
            # status=chat_service.agent_status.get(agent_id, AgentStatus.AVAILABLE) # Remove status
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Removed /agent-card endpoint

# Remove update_agent_status endpoint and handle_agent_update function as they are no longer used
