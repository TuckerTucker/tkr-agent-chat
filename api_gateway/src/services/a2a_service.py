"""
Service layer for A2A protocol task management.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload

from ..models.agent_tasks import A2ATask, AgentCard, TaskStatus, TaskPriority
from ..models.messages import Message, ChatSession, MessageType, MessageRole

class A2AService:
    """Service for managing Agent-to-Agent communication tasks."""
    
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_task(
        self,
        session_id: str,
        title: str,
        description: Optional[str],
        agent_ids: List[str],
        priority: TaskPriority = TaskPriority.MEDIUM,
        config: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> A2ATask:
        """Create a new A2A task."""
        # Create task
        task = A2ATask(
            session_id=session_id,
            title=title,
            description=description,
            status=TaskStatus.PENDING,
            priority=priority,
            config=config,
            context=context
        )
        
        # Link agents
        agents = await self._get_agents(agent_ids)
        task.agents.extend(agents)
        
        # Save to database
        self.db.add(task)
        await self.db.flush()
        
        # Create system message for task creation
        message = Message(
            session_id=session_id,
            type=MessageType.TASK,
            role=MessageRole.COORDINATOR,
            parts=[{
                "type": "text",
                "content": f"Task created: {title}"
            }],
            message_metadata={
                "task_id": task.id,
                "action": "create"
            }
        )
        self.db.add(message)
        await self.db.commit()
        
        return task

    async def update_task_status(
        self,
        task_id: str,
        status: TaskStatus,
        result: Optional[Dict[str, Any]] = None
    ) -> A2ATask:
        """Update a task's status and optionally add results."""
        task = await self._get_task(task_id)
        
        # Update status and timing
        task.status = status
        if status == TaskStatus.IN_PROGRESS and not task.started_at:
            task.started_at = datetime.utcnow()
        elif status in (TaskStatus.COMPLETED, TaskStatus.FAILED):
            task.completed_at = datetime.utcnow()
        
        # Add results if provided
        if result:
            task.result = result
        
        # Create status update message
        message = Message(
            session_id=task.session_id,
            type=MessageType.TASK,
            role=MessageRole.COORDINATOR,
            parts=[{
                "type": "text",
                "content": f"Task status updated to: {status.value}"
            }],
            message_metadata={
                "task_id": task.id,
                "action": "status_update",
                "status": status.value
            }
        )
        self.db.add(message)
        await self.db.commit()
        
        return task

    async def get_agent_tasks(
        self,
        agent_id: str,
        status: Optional[TaskStatus] = None
    ) -> List[A2ATask]:
        """Get all tasks for a specific agent, optionally filtered by status."""
        query = (
            select(A2ATask)
            .join(A2ATask.agents)
            .where(AgentCard.id == agent_id)
        )
        
        if status:
            query = query.where(A2ATask.status == status)
            
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_session_tasks(
        self,
        session_id: str,
        include_completed: bool = False
    ) -> List[A2ATask]:
        """Get all tasks for a chat session."""
        query = select(A2ATask).where(A2ATask.session_id == session_id)
        
        if not include_completed:
            query = query.where(
                A2ATask.status.in_([TaskStatus.PENDING, TaskStatus.IN_PROGRESS])
            )
            
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def add_task_context(
        self,
        task_id: str,
        context_update: Dict[str, Any]
    ) -> A2ATask:
        """Add or update context for a task."""
        task = await self._get_task(task_id)
        
        # Merge new context with existing
        current_context = task.context or {}
        current_context.update(context_update)
        task.context = current_context
        
        # Create context update message
        message = Message(
            session_id=task.session_id,
            type=MessageType.TASK,
            role=MessageRole.COORDINATOR,
            parts=[{
                "type": "text",
                "content": "Task context updated"
            }],
            message_metadata={
                "task_id": task.id,
                "action": "context_update",
                "context_keys": list(context_update.keys())
            }
        )
        self.db.add(message)
        await self.db.commit()
        
        return task

    async def _get_task(self, task_id: str) -> A2ATask:
        """Get a task by ID."""
        result = await self.db.execute(
            select(A2ATask)
            .where(A2ATask.id == task_id)
            .options(joinedload(A2ATask.agents))
        )
        task = result.scalar_one_or_none()
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        return task

    async def _get_agents(self, agent_ids: List[str]) -> List[AgentCard]:
        """Get a list of agents by their IDs."""
        result = await self.db.execute(
            select(AgentCard).where(AgentCard.id.in_(agent_ids))
        )
        agents = list(result.scalars().all())
        if len(agents) != len(agent_ids):
            missing = set(agent_ids) - {a.id for a in agents}
            raise ValueError(f"Agents not found: {missing}")
        return agents
