"""
WebSocket routes for A2A protocol task events.
"""

import json
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.a2a_service import A2AService
from ..models.agent_tasks import TaskStatus, A2ATask
from ..models.messages import MessageType, MessageRole

router = APIRouter()
logger = logging.getLogger(__name__)

# Store active task subscriptions
task_subscribers: Dict[str, set[WebSocket]] = {}

async def broadcast_task_update(task: A2ATask):
    """Broadcast task updates to all subscribed clients."""
    if task.id in task_subscribers:
        message = {
            "type": "task_update",
            "task_id": task.id,
            "status": task.status.value,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
            "result": task.result
        }
        for websocket in task_subscribers[task.id]:
            try:
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to send task update to subscriber: {e}")

@router.websocket("/tasks/{task_id}")
async def task_events(
    websocket: WebSocket,
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """WebSocket endpoint for subscribing to task events."""
    await websocket.accept()
    logger.info(f"Client subscribed to task events for task {task_id}")

    # Add subscriber
    if task_id not in task_subscribers:
        task_subscribers[task_id] = set()
    task_subscribers[task_id].add(websocket)

    try:
        # Send initial task state
        service = A2AService(db)
        try:
            task = await service._get_task(task_id)
            initial_state = {
                "type": "task_state",
                "task_id": task.id,
                "status": task.status.value,
                "context": task.context,
                "result": task.result
            }
            await websocket.send_text(json.dumps(initial_state))
        except ValueError:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Task {task_id} not found"
            }))
            await websocket.close()
            return

        # Listen for client messages (e.g., context updates)
        while True:
            try:
                data = await websocket.receive_json()
                action = data.get("action")

                if action == "update_context":
                    context_update = data.get("context", {})
                    task = await service.add_task_context(task_id, context_update)
                    # Broadcast update to all subscribers
                    await broadcast_task_update(task)

                elif action == "update_status":
                    new_status = TaskStatus(data.get("status"))
                    result = data.get("result")
                    task = await service.update_task_status(task_id, new_status, result)
                    # Broadcast update to all subscribers
                    await broadcast_task_update(task)

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error processing task event: {e}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": str(e)
                }))

    except Exception as e:
        logger.exception(f"Error in task events websocket: {e}")
    finally:
        # Remove subscriber
        if task_id in task_subscribers:
            task_subscribers[task_id].remove(websocket)
            if not task_subscribers[task_id]:
                del task_subscribers[task_id]
        logger.info(f"Client unsubscribed from task events for task {task_id}")
