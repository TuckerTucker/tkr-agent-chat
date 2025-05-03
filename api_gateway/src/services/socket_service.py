"""
Socket.IO service for the TKR Multi-Agent Chat API Gateway.

This service implements real-time communication using Socket.IO for:
- Client-to-agent messaging
- Agent-to-agent communication
- Task event subscriptions and broadcasts
- Connection management and monitoring
- Message validation and delivery
- Comprehensive error handling
"""

import os
import json
import asyncio
import logging
import uuid
from typing import Dict, Any, Optional, Set, List, Callable, Awaitable, Tuple, Union
from datetime import datetime

import socketio
from socketio import AsyncNamespace

from ..models.error_responses import (
    ErrorCodes, ErrorCategory, ErrorSeverity, 
    WebSocketErrorResponse, create_websocket_error
)
from ..services.logger_service import logger_service
from ..services.error_service import error_service
from ..services.socket_message_handler import process_message
from ..services.socket_error_handler import socket_error_handler

# Configure logger with our enhanced logging service
logger = logger_service.get_logger("socket.io")

# Create Socket.IO AsyncServer with ASGI mode
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # Configure as needed
    logger=True,
    engineio_logger=True,  # More verbose logging
    ping_timeout=60,  # Increased ping timeout for reliability
    ping_interval=25,  # More frequent pings
    max_http_buffer_size=5 * 1024 * 1024  # 5MB max buffer for larger messages
)

# Connection tracking
active_connections: Dict[str, Dict[str, Any]] = {}  # sid -> connection info
agent_rooms: Dict[str, Set[str]] = {}  # agent_id -> set of sids
session_rooms: Dict[str, Set[str]] = {}  # session_id -> set of sids
task_subscribers: Dict[str, Set[str]] = {}  # task_id -> set of sids

# Metrics tracking
class SocketMetrics:
    def __init__(self):
        self.total_connections = 0
        self.active_connections = 0
        self.peak_connections = 0
        self.reconnections = 0
        self.failed_connections = 0
        self.messages_sent = 0
        self.messages_received = 0
        self.errors = {
            "auth_errors": 0,
            "network_errors": 0,
            "timeout_errors": 0,
            "server_errors": 0
        }
    
    def connection_established(self):
        self.total_connections += 1
        self.active_connections += 1
        self.peak_connections = max(self.peak_connections, self.active_connections)
    
    def connection_closed(self):
        self.active_connections = max(0, self.active_connections - 1)
    
    def connection_failed(self, error_type=None):
        self.failed_connections += 1
        if error_type in self.errors:
            self.errors[error_type] += 1
    
    def reconnection_occurred(self):
        self.reconnections += 1
    
    def message_sent(self):
        self.messages_sent += 1
    
    def message_received(self):
        self.messages_received += 1
    
    def get_metrics(self):
        return {
            "total_connections": self.total_connections,
            "active_connections": self.active_connections,
            "peak_connections": self.peak_connections,
            "reconnections": self.reconnections,
            "failed_connections": self.failed_connections,
            "messages_sent": self.messages_sent,
            "messages_received": self.messages_received,
            "errors": self.errors
        }

# Initialize metrics object
socket_metrics = SocketMetrics()

# Parse connection data from query string and headers
def parse_connection_data(sid: str, environ: Dict[str, Any]) -> Dict[str, Any]:
    """Parse connection data from environ dictionary."""
    query = environ.get('QUERY_STRING', '')
    query_params = {}
    
    # Simple query string parsing
    if query:
        for param in query.split('&'):
            if '=' in param:
                key, value = param.split('=', 1)
                query_params[key] = value
    
    # Get client IP and user agent
    client_ip = environ.get('HTTP_X_FORWARDED_FOR') or environ.get('REMOTE_ADDR', 'unknown')
    user_agent = environ.get('HTTP_USER_AGENT', 'unknown')
    
    # Get auth token from headers
    auth_header = environ.get('HTTP_AUTHORIZATION', '')
    auth_token = ''
    if auth_header.startswith('Bearer '):
        auth_token = auth_header[7:]
    
    # Extract key connection parameters
    agent_id = query_params.get('agent_id', '')
    session_id = query_params.get('session_id', '')
    client_type = query_params.get('client_type', 'client')  # 'client', 'agent', or 'system'
    
    return {
        'sid': sid,
        'agent_id': agent_id,
        'session_id': session_id,
        'client_type': client_type,
        'client_ip': client_ip,
        'user_agent': user_agent,
        'auth_token': auth_token,
        'connected_at': datetime.utcnow().isoformat(),
        'last_activity': datetime.utcnow().isoformat(),
        'is_connected': True
    }

# Main namespace for chat functionality
class ChatNamespace(socketio.AsyncNamespace):
    async def on_connect(self, sid, environ):
        """Handle new Socket.IO connection."""
        try:
            # Parse connection data
            connection_data = parse_connection_data(sid, environ)
            agent_id = connection_data.get('agent_id')
            session_id = connection_data.get('session_id')
            client_type = connection_data.get('client_type')
            
            # Log connection with context
            logger_service.log_with_context(
                logger=logger,
                level="info",
                message=f"Socket.IO connection established",
                context={
                    "socket_id": sid,
                    "agent_id": agent_id,
                    "session_id": session_id,
                    "client_type": client_type,
                    "remote_addr": connection_data.get('client_ip')
                }
            )
            
            # Store connection data
            active_connections[sid] = connection_data
            
            # Update metrics
            socket_metrics.connection_established()
            
            # Add to appropriate rooms
            if agent_id:
                await self.enter_room(sid, f'agent_{agent_id}')
                if agent_id not in agent_rooms:
                    agent_rooms[agent_id] = set()
                agent_rooms[agent_id].add(sid)
            
            if session_id:
                await self.enter_room(sid, f'session_{session_id}')
                if session_id not in session_rooms:
                    session_rooms[session_id] = set()
                session_rooms[session_id].add(sid)
            
            # Notify client of successful connection
            await self.emit('connect:status', {
                'connected': True,
                'agent_id': agent_id,
                'session_id': session_id,
                'socket_id': sid
            }, room=sid)
            
            return True
        except Exception as e:
            logger.error(f"Error in Socket.IO connect handler: {e}", exc_info=True)
            socket_metrics.connection_failed(error_type="server_errors")
            return False
    
    async def on_disconnect(self, sid):
        """Handle Socket.IO disconnection."""
        try:
            # Get connection data
            connection_data = active_connections.get(sid, {})
            agent_id = connection_data.get('agent_id')
            session_id = connection_data.get('session_id')
            
            # Log disconnection with context
            logger_service.log_with_context(
                logger=logger,
                level="info",
                message=f"Socket.IO connection closed",
                context={
                    "socket_id": sid,
                    "agent_id": agent_id,
                    "session_id": session_id,
                    "connected_duration": (
                        datetime.utcnow() - 
                        datetime.fromisoformat(connection_data.get('connected_at', datetime.utcnow().isoformat()))
                    ).total_seconds() if 'connected_at' in connection_data else None
                }
            )
            
            # Clean up agent rooms
            if agent_id and agent_id in agent_rooms and sid in agent_rooms[agent_id]:
                agent_rooms[agent_id].remove(sid)
                if not agent_rooms[agent_id]:
                    del agent_rooms[agent_id]
            
            # Clean up session rooms
            if session_id and session_id in session_rooms and sid in session_rooms[session_id]:
                session_rooms[session_id].remove(sid)
                if not session_rooms[session_id]:
                    del session_rooms[session_id]
            
            # Remove connection data
            if sid in active_connections:
                del active_connections[sid]
            
            # Update metrics
            socket_metrics.connection_closed()
            
        except Exception as e:
            logger.error(f"Error in Socket.IO disconnect handler: {e}", exc_info=True)
    
    async def on_error(self, sid, error_data):
        """Handle client-reported errors."""
        try:
            connection_data = active_connections.get(sid, {})
            agent_id = connection_data.get('agent_id')
            session_id = connection_data.get('session_id')
            
            logger.error(f"Client-reported error: {error_data}", extra={
                "socket_id": sid,
                "agent_id": agent_id,
                "session_id": session_id,
                "error_data": error_data
            })
            
            # Update error metrics
            error_type = error_data.get('type', 'unknown')
            socket_metrics.connection_failed(error_type=f"{error_type}_errors")
            
            # Create standardized error response and log it
            from ..services.socket_error_handler import SocketErrorCategory, SocketErrorCodes, SocketErrorResponse
            
            error_response = SocketErrorResponse(
                error_code=error_data.get('error_code', SocketErrorCodes.CLIENT_ERROR),
                message=error_data.get('message', 'Client-reported error'),
                category=error_data.get('category', SocketErrorCategory.CLIENT),
                severity=error_data.get('severity', 'warning'),
                details=error_data.get('details', {}),
                request_id=error_data.get('request_id', str(uuid.uuid4())),
                session_id=session_id,
                agent_id=agent_id,
                context_id=error_data.get('context_id')
            )
            
            # Log the error with the error service
            error_service.log_error(
                error=error_response.to_dict(),
                level=error_response.severity,
                context_id=error_response.session_id or error_response.request_id
            )
            
        except Exception as e:
            logger.error(f"Error handling client error report: {e}", exc_info=True)
    
    async def on_message(self, sid, data):
        """Handle incoming messages from clients."""
        try:
            # Get connection data
            connection_data = active_connections.get(sid, {})
            agent_id = connection_data.get('agent_id')
            session_id = connection_data.get('session_id')
            client_type = connection_data.get('client_type')
            
            # Update last activity timestamp
            if sid in active_connections:
                active_connections[sid]['last_activity'] = datetime.utcnow().isoformat()
            
            # Update metrics
            socket_metrics.message_received()
            
            # Extract message data
            message_type = data.get('type', 'text')
            message_content = data.get('text', '') if message_type == 'text' else data.get('content', {})
            target_agent_id = data.get('to_agent', None)
            
            logger.info(f"Received {message_type} message from {client_type} {agent_id or 'unknown'}", extra={
                "socket_id": sid,
                "session_id": session_id,
                "message_type": message_type,
                "content_length": len(str(message_content)),
                "target_agent": target_agent_id
            })
            
            # Make sure the message has session_id
            if 'sessionId' not in data and session_id:
                data['sessionId'] = session_id
                
            # Make sure the message has an ID
            if 'id' not in data:
                data['id'] = str(uuid.uuid4())
                
            # Handle ping messages immediately
            if message_type == 'ping':
                # Simple ping-pong for connection verification
                await self.emit('pong', {'timestamp': datetime.utcnow().isoformat()}, room=sid)
                return {'status': 'pong', 'timestamp': datetime.utcnow().isoformat()}
                
            # Use the message handler module to process the message
            result = await process_message(sio, sid, data, self.namespace)
            return result
            
        except Exception as e:
            # Use the error handler for standardized errors
            error_response = await socket_error_handler.handle_error(
                exc=e, 
                sid=sid, 
                namespace=self.namespace,
                context={
                    "message_data": data,
                    "socket_id": sid,
                    "agent_id": active_connections.get(sid, {}).get('agent_id'),
                    "session_id": active_connections.get(sid, {}).get('session_id')
                }
            )
            
            # Return a summary of the error to the client
            return {
                'status': 'error',
                'error_code': error_response.error_code,
                'message': error_response.message,
                'timestamp': datetime.utcnow().isoformat()
            }
    
    async def handle_text_message(self, sid, data, connection_data):
        """
        Process a text message from a client or agent.
        Note: This method is deprecated - socket_message_handler.py is used instead via process_message.
        """
        logger.warning("handle_text_message called directly - this is deprecated in favor of process_message")
        
        session_id = connection_data.get('session_id')
        agent_id = connection_data.get('agent_id')
        
        # Only redirect this to the message handler if needed
        from ..services.socket_message_handler import process_message
        await process_message(sio, sid, data, self.namespace)
        
        logger.info("Redirected message to socket_message_handler.process_message")
    
    async def handle_a2a_message(self, sid, data, connection_data):
        """Process an agent-to-agent message."""
        from_agent_id = connection_data.get('agent_id')
        to_agent_id = data.get('to_agent')
        content = data.get('content')
        task_id = data.get('task_id')
        
        if not all([from_agent_id, to_agent_id, content]):
            await self.emit('error', {
                'type': 'validation',
                'message': 'Invalid A2A message format',
                'details': {
                    'required_fields': ['from_agent', 'to_agent', 'content']
                }
            }, room=sid)
            return
        
        # Broadcast to target agent's room
        socket_metrics.message_sent()
        await self.emit(
            'a2a',
            {
                'type': 'agent_message',
                'from_agent': from_agent_id,
                'task_id': task_id,
                'content': content,
                'timestamp': datetime.utcnow().isoformat()
            },
            room=f'agent_{to_agent_id}'
        )
        
        # Also send to any task room if task_id is provided
        if task_id:
            socket_metrics.message_sent()
            await self.emit(
                'task_event',
                {
                    'type': 'agent_message',
                    'task_id': task_id,
                    'from_agent': from_agent_id,
                    'to_agent': to_agent_id,
                    'content': content,
                    'timestamp': datetime.utcnow().isoformat()
                },
                room=f'task_{task_id}'
            )
    
    async def handle_task_message(self, sid, data, connection_data):
        """Process a task-related message."""
        agent_id = connection_data.get('agent_id')
        task_id = data.get('task_id')
        action = data.get('action')
        
        if not all([task_id, action]):
            await self.emit('error', {
                'type': 'validation',
                'message': 'Invalid task message format',
                'details': {
                    'required_fields': ['task_id', 'action']
                }
            }, room=sid)
            return
        
        # Subscribe to task events
        if action == 'subscribe':
            await self.enter_room(sid, f'task_{task_id}')
            
            # Add to task subscribers
            if task_id not in task_subscribers:
                task_subscribers[task_id] = set()
            task_subscribers[task_id].add(sid)
            
            # Send acknowledgment
            await self.emit('task_event', {
                'type': 'subscribed',
                'task_id': task_id,
                'timestamp': datetime.utcnow().isoformat()
            }, room=sid)
            
            # Fetch and send initial task state (to be implemented)
            # await self.emit('task_event', {...}, room=sid)
            
        # Unsubscribe from task events
        elif action == 'unsubscribe':
            await self.leave_room(sid, f'task_{task_id}')
            
            # Remove from task subscribers
            if task_id in task_subscribers and sid in task_subscribers[task_id]:
                task_subscribers[task_id].remove(sid)
                if not task_subscribers[task_id]:
                    del task_subscribers[task_id]
            
            # Send acknowledgment
            await self.emit('task_event', {
                'type': 'unsubscribed',
                'task_id': task_id,
                'timestamp': datetime.utcnow().isoformat()
            }, room=sid)
            
        # Update task status or context
        elif action in ['update_status', 'update_context']:
            # To be implemented with A2A service integration
            # Broadcast update to all task subscribers
            socket_metrics.message_sent()
            await self.emit(
                'task_event',
                {
                    'type': action,
                    'task_id': task_id,
                    'agent_id': agent_id,
                    'data': data.get('data', {}),
                    'timestamp': datetime.utcnow().isoformat()
                },
                room=f'task_{task_id}'
            )
            
        else:
            await self.emit('error', {
                'type': 'validation',
                'message': f'Unknown task action: {action}',
                'details': {
                    'supported_actions': ['subscribe', 'unsubscribe', 'update_status', 'update_context']
                }
            }, room=sid)
    
    async def on_join(self, sid, data):
        """Handle room join requests."""
        try:
            room_type = data.get('type', 'session')
            room_id = data.get('id')
            
            if not room_id:
                await self.emit('error', {
                    'type': 'validation',
                    'message': 'Missing room ID',
                    'details': {'required_fields': ['id']}
                }, room=sid)
                return
            
            # Determine room name based on type
            if room_type == 'session':
                room_name = f'session_{room_id}'
            elif room_type == 'agent':
                room_name = f'agent_{room_id}'
            elif room_type == 'task':
                room_name = f'task_{room_id}'
            else:
                await self.emit('error', {
                    'type': 'validation',
                    'message': f'Unknown room type: {room_type}',
                    'details': {'supported_types': ['session', 'agent', 'task']}
                }, room=sid)
                return
            
            # Join the room
            await self.enter_room(sid, room_name)
            
            # Update tracking collections
            if room_type == 'agent' and room_id:
                if room_id not in agent_rooms:
                    agent_rooms[room_id] = set()
                agent_rooms[room_id].add(sid)
            elif room_type == 'session' and room_id:
                if room_id not in session_rooms:
                    session_rooms[room_id] = set()
                session_rooms[room_id].add(sid)
            elif room_type == 'task' and room_id:
                if room_id not in task_subscribers:
                    task_subscribers[room_id] = set()
                task_subscribers[room_id].add(sid)
            
            # Send acknowledgment
            await self.emit('joined', {
                'room_type': room_type,
                'room_id': room_id,
                'timestamp': datetime.utcnow().isoformat()
            }, room=sid)
            
            logger.info(f"Client {sid} joined room {room_name}")
            
        except Exception as e:
            logger.error(f"Error handling room join: {e}", exc_info=True)
            await self.emit('error', {
                'type': 'server',
                'message': f'Failed to join room: {str(e)}'
            }, room=sid)
    
    async def on_leave(self, sid, data):
        """Handle room leave requests."""
        try:
            room_type = data.get('type', 'session')
            room_id = data.get('id')
            
            if not room_id:
                await self.emit('error', {
                    'type': 'validation',
                    'message': 'Missing room ID',
                    'details': {'required_fields': ['id']}
                }, room=sid)
                return
            
            # Determine room name based on type
            if room_type == 'session':
                room_name = f'session_{room_id}'
            elif room_type == 'agent':
                room_name = f'agent_{room_id}'
            elif room_type == 'task':
                room_name = f'task_{room_id}'
            else:
                await self.emit('error', {
                    'type': 'validation',
                    'message': f'Unknown room type: {room_type}',
                    'details': {'supported_types': ['session', 'agent', 'task']}
                }, room=sid)
                return
            
            # Leave the room
            await self.leave_room(sid, room_name)
            
            # Update tracking collections
            if room_type == 'agent' and room_id in agent_rooms and sid in agent_rooms[room_id]:
                agent_rooms[room_id].remove(sid)
                if not agent_rooms[room_id]:
                    del agent_rooms[room_id]
            elif room_type == 'session' and room_id in session_rooms and sid in session_rooms[room_id]:
                session_rooms[room_id].remove(sid)
                if not session_rooms[room_id]:
                    del session_rooms[room_id]
            elif room_type == 'task' and room_id in task_subscribers and sid in task_subscribers[room_id]:
                task_subscribers[room_id].remove(sid)
                if not task_subscribers[room_id]:
                    del task_subscribers[room_id]
            
            # Send acknowledgment
            await self.emit('left', {
                'room_type': room_type,
                'room_id': room_id,
                'timestamp': datetime.utcnow().isoformat()
            }, room=sid)
            
            logger.info(f"Client {sid} left room {room_name}")
            
        except Exception as e:
            logger.error(f"Error handling room leave: {e}", exc_info=True)
            await self.emit('error', {
                'type': 'server',
                'message': f'Failed to leave room: {str(e)}'
            }, room=sid)

# Register the ChatNamespace
# Define additional specialized namespaces for agent and task communications
class AgentNamespace(socketio.AsyncNamespace):
    async def on_connect(self, sid, environ):
        """Handle new Socket.IO connection for agents."""
        try:
            # Parse connection data
            connection_data = parse_connection_data(sid, environ)
            agent_id = connection_data.get('agent_id')
            session_id = connection_data.get('session_id')
            
            # Log agent connection with context
            logger_service.log_with_context(
                logger=logger,
                level="info",
                message=f"Agent Socket.IO connection established",
                context={
                    "socket_id": sid,
                    "agent_id": agent_id,
                    "session_id": session_id,
                    "remote_addr": connection_data.get('client_ip')
                }
            )
            
            # Store connection data
            active_connections[sid] = connection_data
            
            # Update metrics
            socket_metrics.connection_established()
            
            # Add to appropriate rooms - agent room is most important
            if agent_id:
                await self.enter_room(sid, f'agent_{agent_id}')
                if agent_id not in agent_rooms:
                    agent_rooms[agent_id] = set()
                agent_rooms[agent_id].add(sid)
            
            if session_id:
                await self.enter_room(sid, f'session_{session_id}')
                if session_id not in session_rooms:
                    session_rooms[session_id] = set()
                session_rooms[session_id].add(sid)
                
            # Notify agent of successful connection
            await self.emit('connect:status', {
                'connected': True,
                'agent_id': agent_id,
                'session_id': session_id,
                'socket_id': sid,
                'namespace': '/agents'
            }, room=sid)
            
            return True
        except Exception as e:
            logger.error(f"Error in Agent Socket.IO connect handler: {e}", exc_info=True)
            socket_metrics.connection_failed(error_type="server_errors")
            return False
    
    async def on_message(self, sid, data):
        """Handle agent message."""
        try:
            # Get connection data
            connection_data = active_connections.get(sid, {})
            agent_id = connection_data.get('agent_id')
            session_id = connection_data.get('session_id')
            
            # Update last activity timestamp
            if sid in active_connections:
                active_connections[sid]['last_activity'] = datetime.utcnow().isoformat()
            
            # Update metrics
            socket_metrics.message_received()
            
            # Log message receipt
            logger.info(f"Received message from agent {agent_id} in session {session_id}", extra={
                "socket_id": sid,
                "message_type": data.get('type'),
                "content_length": len(str(data.get('content', '')))
            })
            
            # Process message based on type
            msg_type = data.get('type', 'text')
            
            if msg_type == 'text':
                # Broadcast message to session
                await self.emit('message', {
                    'type': 'text',
                    'message': data.get('text', ''),
                    'agent_id': agent_id,
                    'timestamp': datetime.utcnow().isoformat()
                }, room=f'session_{session_id}')
                
                # Check if this message targets a specific agent and needs a response
                target_agent_id = data.get('toAgent')
                if target_agent_id:
                    logger.info(f"Message targets agent {target_agent_id}, generating agent response")
                    
                    # Import the generate_agent_response function
                    from ..services.socket_message_handler import generate_agent_response
                    
                    # Trigger agent response generation
                    asyncio.create_task(
                        generate_agent_response(
                            sio=sio,
                            session_id=session_id,
                            agent_id=target_agent_id,
                            message=data,
                            namespace=self.namespace
                        )
                    )
                    logger.info(f"Agent response generation task created for {target_agent_id}")
                
            elif msg_type == 'task_update':
                # Handle task updates
                task_id = data.get('task_id')
                if task_id:
                    await self.emit('task_event', {
                        'type': 'task_update',
                        'task_id': task_id,
                        'agent_id': agent_id,
                        'data': data.get('data', {}),
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=f'task_{task_id}')
            elif msg_type == 'a2a':
                # Handle agent-to-agent communication
                target_agent = data.get('to_agent')
                if target_agent:
                    await self.emit('a2a', {
                        'type': 'agent_message',
                        'from_agent': agent_id,
                        'content': data.get('content', {}),
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=f'agent_{target_agent}')
            
            # Return acknowledgment
            return {
                'status': 'received',
                'timestamp': datetime.utcnow().isoformat(),
                'message_id': data.get('id', str(uuid.uuid4()))
            }
            
        except Exception as e:
            logger.error(f"Error handling agent message: {e}", exc_info=True)
            return {
                'status': 'error',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }

class TaskNamespace(socketio.AsyncNamespace):
    async def on_connect(self, sid, environ):
        """Handle new Socket.IO connection for task subscribers."""
        try:
            # Parse connection data
            connection_data = parse_connection_data(sid, environ)
            
            # Store connection data
            active_connections[sid] = connection_data
            
            # Update metrics
            socket_metrics.connection_established()
            
            # Log connection
            logger_service.log_with_context(
                logger=logger,
                level="info",
                message=f"Task Socket.IO connection established",
                context={
                    "socket_id": sid,
                    "remote_addr": connection_data.get('client_ip')
                }
            )
            
            # Notify client of successful connection
            await self.emit('connect:status', {
                'connected': True,
                'socket_id': sid,
                'namespace': '/tasks'
            }, room=sid)
            
            return True
        except Exception as e:
            logger.error(f"Error in Task Socket.IO connect handler: {e}", exc_info=True)
            socket_metrics.connection_failed(error_type="server_errors")
            return False
    
    async def on_subscribe(self, sid, data):
        """Handle task subscription."""
        try:
            task_id = data.get('task_id')
            if not task_id:
                return {'status': 'error', 'message': 'Missing task ID'}
            
            # Join task room
            await self.enter_room(sid, f'task_{task_id}')
            
            # Update task subscribers
            if task_id not in task_subscribers:
                task_subscribers[task_id] = set()
            task_subscribers[task_id].add(sid)
            
            # Log subscription
            logger.info(f"Client {sid} subscribed to task {task_id}")
            
            # Return success
            return {'status': 'subscribed', 'task_id': task_id}
        except Exception as e:
            logger.error(f"Error in task subscription: {e}", exc_info=True)
            return {'status': 'error', 'message': str(e)}
    
    async def on_unsubscribe(self, sid, data):
        """Handle task unsubscription."""
        try:
            task_id = data.get('task_id')
            if not task_id:
                return {'status': 'error', 'message': 'Missing task ID'}
            
            # Leave task room
            await self.leave_room(sid, f'task_{task_id}')
            
            # Update task subscribers
            if task_id in task_subscribers and sid in task_subscribers[task_id]:
                task_subscribers[task_id].remove(sid)
                if not task_subscribers[task_id]:
                    del task_subscribers[task_id]
            
            # Log unsubscription
            logger.info(f"Client {sid} unsubscribed from task {task_id}")
            
            # Return success
            return {'status': 'unsubscribed', 'task_id': task_id}
        except Exception as e:
            logger.error(f"Error in task unsubscription: {e}", exc_info=True)
            return {'status': 'error', 'message': str(e)}

# Register namespaces
sio.register_namespace(ChatNamespace('/'))
sio.register_namespace(AgentNamespace('/agents'))
sio.register_namespace(TaskNamespace('/tasks'))

# Room management functions
async def join_session(sid: str, session_id: str, agent_id: Optional[str] = None, namespace: str = '/') -> None:
    """Add a socket to a session room and optional agent room."""
    try:
        # Get namespace object
        ns = sio.namespace_manager.get_namespace(namespace)
        if not ns:
            logger.error(f"Namespace {namespace} not found, using default")
            ns = sio.namespace_manager.get_namespace('/')
        
        # Join session room
        session_room = f"session_{session_id}"
        await ns.enter_room(sid, session_room)
        
        # Add to session tracking
        if session_id not in session_rooms:
            session_rooms[session_id] = set()
        session_rooms[session_id].add(sid)
        
        logger.info(f"Socket {sid} joined session room {session_room}")
        
        # Join agent room if provided
        if agent_id:
            agent_room = f"agent_{agent_id}"
            await ns.enter_room(sid, agent_room)
            
            # Add to agent tracking
            if agent_id not in agent_rooms:
                agent_rooms[agent_id] = set()
            agent_rooms[agent_id].add(sid)
            
            logger.info(f"Socket {sid} joined agent room {agent_room}")
    except Exception as e:
        logger.error(f"Error joining session: {e}", exc_info=True)
        raise

async def join_task(sid: str, task_id: str, namespace: str = '/tasks') -> None:
    """Add a socket to a task room."""
    try:
        # Get namespace object
        ns = sio.namespace_manager.get_namespace(namespace)
        if not ns:
            logger.error(f"Namespace {namespace} not found, using default")
            ns = sio.namespace_manager.get_namespace('/')
        
        # Join task room
        task_room = f"task_{task_id}"
        await ns.enter_room(sid, task_room)
        
        # Add to task tracking
        if task_id not in task_subscribers:
            task_subscribers[task_id] = set()
        task_subscribers[task_id].add(sid)
        
        logger.info(f"Socket {sid} joined task room {task_room}")
    except Exception as e:
        logger.error(f"Error joining task: {e}", exc_info=True)
        raise

async def leave_room(sid: str, room: str, namespace: str = '/') -> None:
    """Remove a socket from a room with proper cleanup."""
    try:
        # Get namespace object
        ns = sio.namespace_manager.get_namespace(namespace)
        if not ns:
            logger.error(f"Namespace {namespace} not found, using default")
            ns = sio.namespace_manager.get_namespace('/')
        
        # Leave room
        await ns.leave_room(sid, room)
        
        # Update tracking collections
        if room.startswith('session_'):
            session_id = room[8:]  # Remove 'session_' prefix
            if session_id in session_rooms and sid in session_rooms[session_id]:
                session_rooms[session_id].remove(sid)
                if not session_rooms[session_id]:
                    del session_rooms[session_id]
        elif room.startswith('agent_'):
            agent_id = room[6:]  # Remove 'agent_' prefix
            if agent_id in agent_rooms and sid in agent_rooms[agent_id]:
                agent_rooms[agent_id].remove(sid)
                if not agent_rooms[agent_id]:
                    del agent_rooms[agent_id]
        elif room.startswith('task_'):
            task_id = room[5:]  # Remove 'task_' prefix
            if task_id in task_subscribers and sid in task_subscribers[task_id]:
                task_subscribers[task_id].remove(sid)
                if not task_subscribers[task_id]:
                    del task_subscribers[task_id]
        
        logger.info(f"Socket {sid} left room {room}")
    except Exception as e:
        logger.error(f"Error leaving room: {e}", exc_info=True)
        raise

# Broadcast helper functions
async def broadcast_to_session(session_id: str, event: str, data: Dict[str, Any], namespace: str = '/') -> None:
    """Broadcast an event to all sockets in a session room."""
    try:
        room = f"session_{session_id}"
        await sio.emit(event, data, room=room, namespace=namespace)
        socket_metrics.message_sent()
        logger.debug(f"Broadcast {event} to session {session_id}")
    except Exception as e:
        logger.error(f"Error broadcasting to session: {e}", exc_info=True)
        raise

async def broadcast_to_agent(agent_id: str, event: str, data: Dict[str, Any], namespace: str = '/') -> None:
    """Broadcast an event to all sockets in an agent room."""
    try:
        room = f"agent_{agent_id}"
        await sio.emit(event, data, room=room, namespace=namespace)
        socket_metrics.message_sent()
        logger.debug(f"Broadcast {event} to agent {agent_id}")
    except Exception as e:
        logger.error(f"Error broadcasting to agent: {e}", exc_info=True)
        raise

async def broadcast_to_task(task_id: str, event: str, data: Dict[str, Any], namespace: str = '/') -> None:
    """Broadcast an event to all sockets in a task room."""
    try:
        room = f"task_{task_id}"
        await sio.emit(event, data, room=room, namespace=namespace)
        socket_metrics.message_sent()
        logger.debug(f"Broadcast {event} to task {task_id}")
    except Exception as e:
        logger.error(f"Error broadcasting to task: {e}", exc_info=True)
        raise

# Context sharing functions
async def share_context(
    context_id: str,
    session_id: str,
    source_agent_id: str,
    context_data: Dict[str, Any]
) -> None:
    """Share context with all agents in a session."""
    try:
        # Format the context update event
        context_event = {
            'type': 'context:update',
            'context_id': context_id,
            'session_id': session_id,
            'source_agent_id': source_agent_id,
            'context_data': context_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Use our broadcast helper
        await broadcast_to_session(session_id, 'context', context_event)
        
        logger.info(f"Shared context {context_id} from agent {source_agent_id} in session {session_id}")
        
    except Exception as e:
        logger.error(f"Error sharing context: {e}", exc_info=True)

# Task update broadcast function
async def broadcast_task_update(task_data: Dict[str, Any]) -> None:
    """Broadcast task updates to all subscribers."""
    try:
        task_id = task_data.get('id')
        
        if not task_id:
            logger.error("Cannot broadcast task update: missing task ID")
            return
        
        # Format the task update event
        task_event = {
            'type': 'task:update',
            'task_id': task_id,
            'task_data': task_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Use our broadcast helper
        await broadcast_to_task(task_id, 'task_event', task_event, namespace='/tasks')
        
        logger.info(f"Broadcast task update for task {task_id}")
        
    except Exception as e:
        logger.error(f"Error broadcasting task update: {e}", exc_info=True)

# Connection status check for monitoring
async def check_connections():
    """Periodically check connection status and clean up stale connections."""
    while True:
        try:
            now = datetime.utcnow()
            stale_connections = []
            
            # Check each connection for activity
            for sid, connection in active_connections.items():
                try:
                    # Skip if not connected
                    if not connection.get('is_connected', False):
                        continue
                    
                    # Check last activity time
                    last_activity_str = connection.get('last_activity')
                    if not last_activity_str:
                        continue
                        
                    last_activity = datetime.fromisoformat(last_activity_str)
                    inactive_seconds = (now - last_activity).total_seconds()
                    
                    # If inactive for too long, mark as stale
                    if inactive_seconds > 120:  # 2 minutes inactivity
                        logger.warning(f"Connection {sid} appears stale (inactive for {inactive_seconds:.1f}s)")
                        stale_connections.append(sid)
                except Exception as conn_err:
                    logger.error(f"Error checking connection {sid}: {conn_err}")
            
            # Process stale connections
            for sid in stale_connections:
                try:
                    # Send ping to check if still alive
                    await sio.emit('ping', {'timestamp': now.isoformat()}, room=sid, namespace='/')
                    logger.info(f"Sent ping to stale connection {sid}")
                except Exception as ping_err:
                    logger.error(f"Error pinging stale connection {sid}: {ping_err}")
                    
            # Sleep for interval
            await asyncio.sleep(60)  # Check every minute
            
        except Exception as e:
            logger.error(f"Error in connection monitoring: {e}", exc_info=True)
            await asyncio.sleep(60)  # Continue checking despite errors

# Metrics endpoint for monitoring
def get_socket_metrics():
    """Get current Socket.IO metrics."""
    return {
        **socket_metrics.get_metrics(),
        'agent_rooms_count': len(agent_rooms),
        'session_rooms_count': len(session_rooms),
        'task_subscribers_count': len(task_subscribers)
    }
    
# Helper function to get ASGI app for mounting in FastAPI
def get_socketio_app():
    """Get the Socket.IO ASGI app for mounting in FastAPI."""
    return socketio.ASGIApp(sio)

# Start background tasks
async def start_background_tasks():
    """Start background tasks for Socket.IO service."""
    asyncio.create_task(check_connections())
    logger.info("Started Socket.IO background tasks")

# Initialize the Socket.IO server
def initialize():
    """Initialize the Socket.IO server."""
    logger.info("Initializing Socket.IO server")
    
    # Initialize error handler with Socket.IO server
    socket_error_handler.initialize(sio)
    
    return get_socketio_app()