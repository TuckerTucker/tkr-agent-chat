"""
WebSocket routes for A2A protocol task events and agent-to-agent communication.
"""

import json
import asyncio
import logging
from typing import Dict, Any, Optional, Set
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.a2a_service import A2AService
from ..services.chat_service import chat_service
from ..models.agent_tasks import TaskStatus, A2ATask
from ..models.messages import MessageType, MessageRole

router = APIRouter()
logger = logging.getLogger(__name__)

# Store active connections
task_subscribers: Dict[str, Set[WebSocket]] = {}  # task_id -> set of WebSockets
agent_connections: Dict[str, Set[WebSocket]] = {}  # agent_id -> set of WebSockets

async def broadcast_task_update(task: A2ATask) -> None:
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

async def broadcast_agent_message(
    from_agent_id: str,
    to_agent_id: str,
    message: Dict[str, Any],
    task_id: Optional[str] = None
) -> None:
    """Broadcast a message from one agent to another."""
    if to_agent_id in agent_connections:
        message_data = {
            "type": "agent_message",
            "from_agent": from_agent_id,
            "task_id": task_id,
            "content": message
        }
        for websocket in agent_connections[to_agent_id]:
            try:
                await websocket.send_text(json.dumps(message_data))
            except Exception as e:
                logger.error(f"Failed to send agent message to {to_agent_id}: {e}")

async def handle_agent_message(
    websocket: WebSocket,
    agent_id: str,
    message: Dict[str, Any],
    db: AsyncSession
) -> None:
    """Handle incoming agent messages and route them appropriately."""
    message_type = message.get("type")
    task_id = message.get("task_id")
    target_agent = message.get("to_agent")
    content = message.get("content")

    if not all([message_type, target_agent, content]):
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Invalid message format"
        }))
        return

    try:
        # Save message to database
        await chat_service.save_message(
            db=db,
            session_id=task_id if task_id else f"a2a_{agent_id}_{target_agent}",
            msg_type=MessageType.AGENT,
            agent_id=agent_id,
            parts=[{"type": "text", "content": content}],
            message_metadata={
                "a2a": True,
                "target_agent": target_agent,
                "task_id": task_id
            }
        )

        # Broadcast message to target agent
        await broadcast_agent_message(agent_id, target_agent, content, task_id)

    except Exception as e:
        logger.error(f"Error handling agent message: {e}")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to process message: {str(e)}"
        }))

@router.websocket("/agent/{agent_id}")
async def agent_communication(
    websocket: WebSocket,
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """WebSocket endpoint for agent-to-agent communication."""
    await websocket.accept()
    logger.info(f"Agent {agent_id} connected to A2A communication")

    # Register agent connection
    if agent_id not in agent_connections:
        agent_connections[agent_id] = set()
    agent_connections[agent_id].add(websocket)

    try:
        while True:
            try:
                data = await websocket.receive_json()
                await handle_agent_message(websocket, agent_id, data, db)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON format"
                }))
            except Exception as e:
                logger.error(f"Error in agent communication: {e}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": str(e)
                }))
                # Implement exponential backoff for reconnection
                await asyncio.sleep(1)
    except WebSocketDisconnect:
        logger.info(f"Agent {agent_id} disconnected from A2A communication")
    finally:
        if agent_id in agent_connections:
            agent_connections[agent_id].remove(websocket)
            if not agent_connections[agent_id]:
                del agent_connections[agent_id]

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
