"""
API routes for A2A protocol task management.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.agent_tasks import TaskStatus, TaskPriority, A2ATask
from ..services.a2a_service import A2AService
from ..models.agent_tasks import (
    A2ATaskCreate,
    A2ATaskRead,
)

router = APIRouter(prefix="/a2a", tags=["a2a"])

@router.post("/tasks", response_model=A2ATaskRead)
async def create_task(
    task: A2ATaskCreate,
    db: AsyncSession = Depends(get_db)
) -> A2ATask:
    """Create a new A2A task."""
    service = A2AService(db)
    try:
        return await service.create_task(
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
async def update_task_status(
    task_id: str,
    status: TaskStatus,
    result: Optional[dict] = None,
    db: AsyncSession = Depends(get_db)
) -> A2ATask:
    """Update a task's status and optionally add results."""
    service = A2AService(db)
    try:
        return await service.update_task_status(task_id, status, result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/tasks/agent/{agent_id}", response_model=List[A2ATaskRead])
async def get_agent_tasks(
    agent_id: str,
    status: Optional[TaskStatus] = None,
    db: AsyncSession = Depends(get_db)
) -> List[A2ATask]:
    """Get all tasks for a specific agent."""
    service = A2AService(db)
    return await service.get_agent_tasks(agent_id, status)

@router.get("/tasks/session/{session_id}", response_model=List[A2ATaskRead])
async def get_session_tasks(
    session_id: str,
    include_completed: bool = False,
    db: AsyncSession = Depends(get_db)
) -> List[A2ATask]:
    """Get all tasks for a chat session."""
    service = A2AService(db)
    return await service.get_session_tasks(session_id, include_completed)

@router.patch("/tasks/{task_id}/context", response_model=A2ATaskRead)
async def update_task_context(
    task_id: str,
    context_update: dict,
    db: AsyncSession = Depends(get_db)
) -> A2ATask:
    """Add or update context for a task."""
    service = A2AService(db)
    try:
        return await service.add_task_context(task_id, context_update)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
