"""
API routes for A2A protocol task management.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException

from ..models.agent_tasks import TaskStatus, TaskPriority
from ..services.a2a_service import A2AService
from ..models.agent_tasks import (
    A2ATaskCreate,
    A2ATaskRead
)

router = APIRouter(prefix="/a2a", tags=["a2a"])

@router.post("/tasks", response_model=A2ATaskRead)
def create_task(task: A2ATaskCreate) -> Dict[str, Any]:
    """Create a new A2A task."""
    service = A2AService()
    try:
        return service.create_task(
            session_id=task.session_id,
            title=task.title,
            description=task.description,
            agent_ids=task.agent_ids,
            priority=task.priority,
            config=task.config,
            context=task.context
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/tasks/{task_id}/status", response_model=A2ATaskRead)
def update_task_status(
    task_id: str,
    status: TaskStatus,
    result: Optional[dict] = None
) -> Dict[str, Any]:
    """Update a task's status and optionally add results."""
    service = A2AService()
    try:
        return service.update_task_status(task_id, status, result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/tasks/agent/{agent_id}", response_model=List[A2ATaskRead])
def get_agent_tasks(
    agent_id: str,
    status: Optional[TaskStatus] = None
) -> List[Dict[str, Any]]:
    """Get all tasks for a specific agent."""
    service = A2AService()
    return service.get_agent_tasks(agent_id, status)

@router.get("/tasks/session/{session_id}", response_model=List[A2ATaskRead])
def get_session_tasks(
    session_id: str,
    include_completed: bool = False
) -> List[Dict[str, Any]]:
    """Get all tasks for a chat session."""
    service = A2AService()
    return service.get_session_tasks(session_id, include_completed)

@router.patch("/tasks/{task_id}/context", response_model=A2ATaskRead)
def update_task_context(
    task_id: str,
    context_update: dict
) -> Dict[str, Any]:
    """Add or update context for a task."""
    service = A2AService()
    try:
        return service.add_task_context(task_id, context_update)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
        
@router.post("/test-context")
def test_context_sharing(
    source_agent_id: str,
    target_agent_id: str,
    session_id: str,
    content: str = "This is a test context from the A2A API"
):
    """Test endpoint for direct A2A context sharing."""
    try:
        from ..services.context_service import context_service
        from datetime import datetime, UTC
        
        # Create context data
        context_data = {
            "content": content,
            "timestamp": datetime.now(UTC).isoformat()
        }
        
        # Share context directly
        context = context_service.share_context(
            source_agent_id=source_agent_id,
            target_agent_id=target_agent_id,
            context_data=context_data,
            session_id=session_id
        )
        
        # Get formatted context for the target agent
        formatted_context = context_service.format_context_for_content(
            target_agent_id=target_agent_id,
            session_id=session_id
        )
        
        # Return debug info
        return {
            "success": True,
            "context_id": context["id"],
            "source_agent": source_agent_id,
            "target_agent": target_agent_id,
            "session_id": session_id,
            "context": context_data,
            "formatted_context": formatted_context
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "source_agent": source_agent_id,
            "target_agent": target_agent_id,
            "session_id": session_id
        }
