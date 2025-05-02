"""
Agent metadata and management routes.

Provides:
- Agent list and metadata
- Agent status updates and health monitoring
- Agent restart capability for hung agents
- Agent registration/deregistration
"""

import logging
from enum import Enum
from typing import Dict, List, Optional, Any, Union
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from ..services.chat_service import chat_service
from ..services.agent_health_service import agent_health_service
from ..services.logger_service import logger_service

# Get a logger for this module
logger = logger_service.get_logger(__name__)

router = APIRouter()

# Models

class AgentStatus(str, Enum):
    """Agent status enum."""
    AVAILABLE = "available"
    BUSY = "busy"
    OFFLINE = "offline"
    ERROR = "error"
    HUNG = "hung"

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

class AgentHealthStatus(BaseModel):
    """Detailed health status of an agent."""
    id: str
    name: str
    status: str
    last_activity: Optional[str] = None
    last_error: Optional[str] = None
    minutes_since_activity: Optional[float] = None
    is_hung: Optional[bool] = None
    tools_available: Optional[int] = None
    capabilities: Optional[List[str]] = None

class AgentHealthList(BaseModel):
    """List of agent health status."""
    agents: List[AgentHealthStatus]
    timestamp: str = Field(..., description="Time when health check was performed")

class AgentRestartRequest(BaseModel):
    """Request to restart an agent."""
    force: bool = Field(False, description="Force restart even if agent is not hung")

class AgentRestartResponse(BaseModel):
    """Response from agent restart operation."""
    id: str
    success: bool
    message: str
    health_status: Optional[Dict[str, Any]] = None

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

# Agent Health Management

@router.get("/health/all", response_model=AgentHealthList)
async def get_all_agents_health():
    """Get health status for all agents."""
    try:
        health_statuses = agent_health_service.check_all_agents_health()
        from datetime import datetime
        return AgentHealthList(
            agents=health_statuses,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"Error getting all agents health: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving agent health: {e}")

@router.get("/health/{agent_id}", response_model=AgentHealthStatus)
async def get_agent_health(agent_id: str):
    """Get health status for a specific agent."""
    try:
        health_status = agent_health_service.check_agent_health(agent_id)
        return health_status
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting agent health for {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving agent health: {e}")

@router.post("/restart/{agent_id}", response_model=AgentRestartResponse)
async def restart_agent(agent_id: str, request: AgentRestartRequest = None):
    """
    Restart an agent that may be hung or in an error state.
    
    Args:
        agent_id: ID of the agent to restart
        request: Optional restart configuration
    """
    request = request or AgentRestartRequest()
    
    try:
        # Check agent exists
        agent = chat_service.get_agent(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
        
        # Check if agent is hung (unless force=True)
        if not request.force:
            health_status = agent_health_service.check_agent_health(agent_id)
            if not health_status.get("is_hung", False) and health_status.get("status") != "error":
                return AgentRestartResponse(
                    id=agent_id,
                    success=False,
                    message="Agent is not hung or in error state. Use force=true to restart anyway."
                )
        
        # Attempt to restart the agent
        result = agent_health_service.restart_agent(agent_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error restarting agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error restarting agent: {e}")

@router.post("/health/restart-hung", response_model=List[AgentRestartResponse])
async def restart_hung_agents(background_tasks: BackgroundTasks):
    """
    Check all agents and restart any that are hung.
    
    This endpoint returns immediately and performs the restart in the background.
    """
    try:
        # Run the actual restart operation in a background task
        background_tasks.add_task(agent_health_service.find_and_restart_hung_agents)
        
        return [
            AgentRestartResponse(
                id="background_task",
                success=True,
                message="Background task started to find and restart hung agents"
            )
        ]
    except Exception as e:
        logger.error(f"Error scheduling hung agent restart: {e}")
        raise HTTPException(status_code=500, detail=f"Error scheduling hung agent restart: {e}")
