"""
Service layer for A2A protocol task management.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime

from ..db import (
    create_task as db_create_task,
    get_task as db_get_task,
    update_task as db_update_task,
    get_agent_tasks as db_get_agent_tasks,
    get_session_tasks as db_get_session_tasks,
    link_task_agents,
    create_message as db_create_message
)
from ..models.agent_tasks import TaskStatus, TaskPriority
from ..models.messages import MessageType, MessageRole

class A2AService:
    """Service for managing Agent-to-Agent communication tasks."""
    
    def create_task(
        self,
        session_id: str,
        title: str,
        description: Optional[str],
        agent_ids: List[str],
        priority: TaskPriority = TaskPriority.MEDIUM,
        config: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict:
        """Create a new A2A task."""
        # Create task
        task_data = {
            'session_id': session_id,
            'title': title,
            'description': description,
            'status': TaskStatus.PENDING.value,
            'priority': priority.value,
            'config': config,
            'context': context
        }
        
        task = db_create_task(task_data)
        
        # Link agents
        link_task_agents(task['id'], agent_ids)
        
        # Create system message for task creation
        message_data = {
            'session_id': session_id,
            'type': MessageType.TASK.value,
            'role': MessageRole.COORDINATOR.value,
            'parts': [{'type': 'text', 'content': f"Task created: {title}"}],
            'message_metadata': {
                'task_id': task['id'],
                'action': 'create'
            }
        }
        db_create_message(message_data)
        
        return task

    def update_task_status(
        self,
        task_id: str,
        status: TaskStatus,
        result: Optional[Dict[str, Any]] = None
    ) -> Dict:
        """Update a task's status and optionally add results."""
        task = db_get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        
        # Update status and timing
        update_data = {'status': status.value}
        
        if status == TaskStatus.IN_PROGRESS and not task.get('started_at'):
            update_data['started_at'] = datetime.utcnow().isoformat()
        elif status in (TaskStatus.COMPLETED, TaskStatus.FAILED):
            update_data['completed_at'] = datetime.utcnow().isoformat()
        
        # Add results if provided
        if result:
            update_data['result'] = result
        
        # Update task
        updated_task = db_update_task(task_id, update_data)
        
        # Create status update message
        message_data = {
            'session_id': task['session_id'],
            'type': MessageType.TASK.value,
            'role': MessageRole.COORDINATOR.value,
            'parts': [{
                'type': 'text',
                'content': f"Task status updated to: {status.value}"
            }],
            'message_metadata': {
                'task_id': task_id,
                'action': 'status_update',
                'status': status.value
            }
        }
        db_create_message(message_data)
        
        return updated_task

    def get_agent_tasks(
        self,
        agent_id: str,
        status: Optional[TaskStatus] = None
    ) -> List[Dict]:
        """Get all tasks for a specific agent, optionally filtered by status."""
        return db_get_agent_tasks(agent_id, status.value if status else None)

    def get_session_tasks(
        self,
        session_id: str,
        include_completed: bool = False
    ) -> List[Dict]:
        """Get all tasks for a chat session."""
        return db_get_session_tasks(session_id, include_completed)

    def add_task_context(
        self,
        task_id: str,
        context_update: Dict[str, Any]
    ) -> Dict:
        """Add or update context for a task."""
        task = db_get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        
        # Merge new context with existing
        current_context = task.get('context', {}) or {}
        current_context.update(context_update)
        
        # Update task
        updated_task = db_update_task(task_id, {'context': current_context})
        
        # Create context update message
        message_data = {
            'session_id': task['session_id'],
            'type': MessageType.TASK.value,
            'role': MessageRole.COORDINATOR.value,
            'parts': [{
                'type': 'text',
                'content': "Task context updated"
            }],
            'message_metadata': {
                'task_id': task_id,
                'action': 'context_update',
                'context_keys': list(context_update.keys())
            }
        }
        db_create_message(message_data)
        
        return updated_task
