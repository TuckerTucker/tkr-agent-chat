"""
Socket.IO Connection Manager

This module provides enhanced connection management for Socket.IO connections,
including:
- JWT token validation
- Rate limiting
- Connection diagnostics
- Blacklisting/banning functionality
- Connection health monitoring

Integrates with existing socket_service.py to provide a comprehensive
connection management system for the Socket.IO server.
"""

import asyncio
import time
import jwt
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import socketio
from .logger_service import logger_service

# Get logger for connection manager
logger = logger_service.get_logger("socket.connection_manager")

class ConnectionManager:
    """
    Manages Socket.IO connections with advanced features like rate limiting,
    authentication, and connection diagnostics.
    """
    def __init__(self, sio: socketio.AsyncServer):
        """
        Initialize the connection manager.
        
        Args:
            sio: The Socket.IO server instance
        """
        self.sio = sio
        self.active_connections: Dict[str, Dict[str, Any]] = {}
        self.connections_by_ip: Dict[str, List[str]] = {}
        self.connection_attempts_by_ip: Dict[str, List[float]] = {}
        self.banned_ips: Dict[str, float] = {}
        self.suspicious_activity: Dict[str, Dict[str, Any]] = {}
        
        # Configuration
        self.rate_limit_window = 60  # 60 seconds
        self.rate_limit_max_connections = 20  # Max connections per IP in window
        self.ban_threshold = 50  # Number of suspicious activities before ban
        self.ban_duration = 3600  # Ban duration in seconds (1 hour)
        self.token_secret = "your-jwt-secret-key"  # TODO: Load from environment

    async def authenticate_connection(self, sid: str, environ: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Authenticate a new connection using JWT.
        
        Args:
            sid: Socket.IO session ID
            environ: WSGI environment dictionary
            
        Returns:
            Tuple of (success, failure_reason, auth_data)
        """
        # Get client IP
        client_ip = environ.get('REMOTE_ADDR', 'unknown')
        
        # Check if IP is banned
        if client_ip in self.banned_ips:
            ban_time = self.banned_ips[client_ip]
            if time.time() - ban_time < self.ban_duration:
                logger.warning(f"Rejected connection from banned IP: {client_ip}")
                return False, "IP is temporarily banned", None
            else:
                # Ban expired
                del self.banned_ips[client_ip]
        
        # Apply rate limiting
        if not self._check_rate_limit(client_ip):
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            return False, "Rate limit exceeded", None
        
        # Get auth token
        auth_header = environ.get('HTTP_AUTHORIZATION', '')
        auth_token = None
        
        if auth_header.startswith('Bearer '):
            auth_token = auth_header[7:]
        else:
            # Try to get token from query string
            query_string = environ.get('QUERY_STRING', '')
            for param in query_string.split('&'):
                if param.startswith('token='):
                    auth_token = param[6:]
                    break
        
        # Validate token if present
        auth_data = None
        if auth_token:
            try:
                auth_data = jwt.decode(auth_token, self.token_secret, algorithms=["HS256"])
                logger.info(f"Authenticated connection: {sid}")
            except jwt.ExpiredSignatureError:
                logger.warning(f"Expired token for connection: {sid}")
                return False, "Token expired", None
            except jwt.InvalidTokenError:
                logger.warning(f"Invalid token for connection: {sid}")
                return False, "Invalid token", None
        
        # Store connection info
        connection_info = {
            'sid': sid,
            'ip': client_ip,
            'connected_at': time.time(),
            'last_activity': time.time(),
            'user_agent': environ.get('HTTP_USER_AGENT', 'unknown'),
            'auth': auth_data,
            'namespace': environ.get('SOCKET_IO_NAMESPACE', '/'),
            'ping_count': 0,
            'messages_sent': 0,
            'messages_received': 0,
            'errors': 0
        }
        
        self.active_connections[sid] = connection_info
        
        # Track connections by IP
        if client_ip not in self.connections_by_ip:
            self.connections_by_ip[client_ip] = []
        self.connections_by_ip[client_ip].append(sid)
        
        return True, None, auth_data

    def register_connection_success(self, sid: str):
        """
        Register a successful connection.
        
        Args:
            sid: Socket.IO session ID
        """
        if sid in self.active_connections:
            self.active_connections[sid]['status'] = 'connected'
            self.active_connections[sid]['connected_at'] = time.time()
            logger.info(f"Connection established: {sid}")

    def register_connection_events(self):
        """
        Register Socket.IO event handlers for connection events.
        """
        @self.sio.event
        async def connect(sid, environ):
            try:
                # In development mode, bypass strict authentication
                if environ.get('HTTP_ORIGIN', '').startswith('http://localhost:') or \
                   environ.get('SERVER_NAME', '').startswith('localhost'):
                    logger.info(f"Allowing local development connection: {sid}")
                    
                    # Get client details for logging
                    client_ip = environ.get('REMOTE_ADDR', 'unknown')
                    
                    # Parse query string for session_id and agent_id
                    session_id = None
                    agent_id = None
                    query_string = environ.get('QUERY_STRING', '')
                    for param in query_string.split('&'):
                        if param.startswith('session_id='):
                            session_id = param[11:]
                        elif param.startswith('agent_id='):
                            agent_id = param[9:]
                    
                    # Log connection with details
                    logger_service.log_with_context(
                        logger=logger,
                        level="info",
                        message="Socket.IO local development connection established",
                        context={
                            "socket_id": sid,
                            "remote_addr": client_ip,
                            "user_agent": environ.get('HTTP_USER_AGENT'),
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "development_mode": True
                        }
                    )
                    
                    # Create minimal connection info
                    connection_info = {
                        'sid': sid,
                        'ip': client_ip,
                        'connected_at': time.time(),
                        'last_activity': time.time(),
                        'user_agent': environ.get('HTTP_USER_AGENT', 'unknown'),
                        'auth': {'session_id': session_id, 'agent_id': agent_id},
                        'namespace': environ.get('SOCKET_IO_NAMESPACE', '/'),
                        'status': 'connected',
                        'development_mode': True
                    }
                    
                    self.active_connections[sid] = connection_info
                    
                    # Track connections by IP
                    if client_ip not in self.connections_by_ip:
                        self.connections_by_ip[client_ip] = []
                    self.connections_by_ip[client_ip].append(sid)
                    
                    return True
                
                # Production authentication
                success, reason, auth_data = await self.authenticate_connection(sid, environ)
                if not success:
                    logger.warning(f"Connection rejected: {reason}")
                    # In development mode, consider allowing connections even with auth failures
                    if environ.get('HTTP_HOST', '').startswith('localhost:'):
                        logger.info(f"Allowing localhost connection despite auth failure: {reason}")
                        self.register_connection_success(sid)
                        return True
                    return False
                
                # Log connection with details
                logger_service.log_with_context(
                    logger=logger,
                    level="info",
                    message="Socket.IO connection established",
                    context={
                        "socket_id": sid,
                        "remote_addr": environ.get('REMOTE_ADDR'),
                        "user_agent": environ.get('HTTP_USER_AGENT'),
                        "auth": auth_data
                    }
                )
                
                self.register_connection_success(sid)
                return True
            except Exception as e:
                # Be resilient against connection errors - log and allow connection
                logger.error(f"Error during connection handling, allowing connection: {e}", exc_info=True)
                
                # Still register a minimal connection
                client_ip = environ.get('REMOTE_ADDR', 'unknown')
                self.active_connections[sid] = {
                    'sid': sid,
                    'ip': client_ip,
                    'connected_at': time.time(),
                    'last_activity': time.time(),
                    'status': 'connected',
                    'error_during_connect': str(e)
                }
                
                return True
        
        @self.sio.event
        async def disconnect(sid):
            connection = self.active_connections.get(sid)
            if connection:
                logger_service.log_with_context(
                    logger=logger,
                    level="info",
                    message="Socket.IO connection disconnected",
                    context={
                        "socket_id": sid,
                        "remote_addr": connection.get('ip'),
                        "connected_duration": time.time() - connection.get('connected_at', 0),
                        "messages_sent": connection.get('messages_sent', 0),
                        "messages_received": connection.get('messages_received', 0)
                    }
                )
                
                # Clean up tracking
                client_ip = connection.get('ip')
                if client_ip and client_ip in self.connections_by_ip:
                    if sid in self.connections_by_ip[client_ip]:
                        self.connections_by_ip[client_ip].remove(sid)
                    if not self.connections_by_ip[client_ip]:
                        del self.connections_by_ip[client_ip]
                
                # Remove from active connections
                del self.active_connections[sid]
        
        @self.sio.event
        async def ping(sid):
            """Update last activity time on ping."""
            if sid in self.active_connections:
                self.active_connections[sid]['last_activity'] = time.time()
                self.active_connections[sid]['ping_count'] += 1
                return {"status": "ok", "time": time.time()}

    async def start_monitoring(self):
        """
        Start background tasks for connection monitoring and cleanup.
        """
        try:
            logger.info("Starting connection cleanup task...")
            cleanup_task = asyncio.create_task(self._cleanup_stale_connections())
            logger.info("Connection cleanup task started successfully")
            
            logger.info("Starting connection monitoring task...")
            monitor_task = asyncio.create_task(self._monitor_connections())
            logger.info("Connection monitoring task started successfully")
            
            logger.info("Connection monitoring started")
            return True
        except Exception as e:
            logger.error(f"Failed to start connection monitoring: {e}", exc_info=True)
            # Don't raise the exception so we can continue startup
            return False

    async def _cleanup_stale_connections(self):
        """
        Periodically check for and clean up stale connections.
        """
        logger.info("Connection cleanup task started - will check every 30 seconds")
        while True:
            try:
                logger.debug("Running stale connection cleanup check")
                now = time.time()
                stale_sids = []
                
                for sid, conn in self.active_connections.items():
                    # If no activity for more than 2 minutes
                    if now - conn.get('last_activity', 0) > 120:
                        stale_sids.append(sid)
                
                # Disconnect stale connections
                for sid in stale_sids:
                    logger.warning(f"Disconnecting stale connection: {sid}")
                    await self.sio.disconnect(sid)
                
                # Also clean up expired bans
                expired_bans = []
                for ip, ban_time in self.banned_ips.items():
                    if now - ban_time > self.ban_duration:
                        expired_bans.append(ip)
                
                for ip in expired_bans:
                    del self.banned_ips[ip]
                    logger.info(f"Ban expired for IP: {ip}")
                
            except Exception as e:
                logger.error(f"Error in stale connection cleanup: {str(e)}")
            
            # Run every 30 seconds
            await asyncio.sleep(30)

    async def _monitor_connections(self):
        """
        Monitor active connections for health and statistics.
        """
        while True:
            try:
                # Calculate and log connection metrics
                total_connections = len(self.active_connections)
                connections_by_namespace = {}
                
                for conn in self.active_connections.values():
                    namespace = conn.get('namespace', '/')
                    if namespace not in connections_by_namespace:
                        connections_by_namespace[namespace] = 0
                    connections_by_namespace[namespace] += 1
                
                logger.info(f"Connection metrics - Total: {total_connections}, By namespace: {connections_by_namespace}")
                
                # Check for suspicious activity patterns
                self._analyze_activity_patterns()
                
            except Exception as e:
                logger.error(f"Error in connection monitoring: {str(e)}")
            
            # Run every 60 seconds
            await asyncio.sleep(60)

    def _check_rate_limit(self, client_ip: str) -> bool:
        """
        Check if a client IP has exceeded the rate limit for connections.
        
        Args:
            client_ip: Client IP address
            
        Returns:
            True if within rate limit, False otherwise
        """
        now = time.time()
        
        # Initialize if not exists
        if client_ip not in self.connection_attempts_by_ip:
            self.connection_attempts_by_ip[client_ip] = []
        
        # Add current attempt
        self.connection_attempts_by_ip[client_ip].append(now)
        
        # Remove attempts outside the window
        self.connection_attempts_by_ip[client_ip] = [
            t for t in self.connection_attempts_by_ip[client_ip] 
            if now - t <= self.rate_limit_window
        ]
        
        # Check against limit
        return len(self.connection_attempts_by_ip[client_ip]) <= self.rate_limit_max_connections

    def _analyze_activity_patterns(self):
        """
        Analyze activity patterns to detect suspicious behavior.
        """
        for client_ip, sids in self.connections_by_ip.items():
            # Skip IPs with only one connection
            if len(sids) <= 1:
                continue
            
            # Check for multiple rapid connections
            connections_last_minute = 0
            now = time.time()
            
            for sid in sids:
                conn = self.active_connections.get(sid)
                if conn and now - conn.get('connected_at', 0) <= 60:
                    connections_last_minute += 1
            
            # If suspicious pattern detected
            if connections_last_minute > 10:
                if client_ip not in self.suspicious_activity:
                    self.suspicious_activity[client_ip] = {
                        'count': 0,
                        'first_detected': now
                    }
                
                self.suspicious_activity[client_ip]['count'] += 1
                self.suspicious_activity[client_ip]['last_detected'] = now
                
                logger.warning(f"Suspicious activity detected from IP {client_ip}: {connections_last_minute} connections in last minute")
                
                # Check if ban threshold reached
                if self.suspicious_activity[client_ip]['count'] >= self.ban_threshold:
                    self._ban_ip(client_ip)

    def _ban_ip(self, client_ip: str):
        """
        Ban an IP address for excessive suspicious activity.
        
        Args:
            client_ip: IP address to ban
        """
        # Record ban time
        self.banned_ips[client_ip] = time.time()
        
        # Log the ban
        logger.warning(f"IP banned for suspicious activity: {client_ip}")
        
        # Disconnect all connections from this IP
        if client_ip in self.connections_by_ip:
            for sid in self.connections_by_ip[client_ip]:
                asyncio.create_task(self.sio.disconnect(sid))
            
            # Clear tracking for this IP
            self.connections_by_ip[client_ip] = []

    def update_activity(self, sid: str, activity_type: str):
        """
        Update activity tracking for a connection.
        
        Args:
            sid: Socket.IO session ID
            activity_type: Type of activity ('message_sent', 'message_received', 'error')
        """
        if sid not in self.active_connections:
            return
        
        self.active_connections[sid]['last_activity'] = time.time()
        
        if activity_type == 'message_sent':
            self.active_connections[sid]['messages_sent'] = self.active_connections[sid].get('messages_sent', 0) + 1
        elif activity_type == 'message_received':
            self.active_connections[sid]['messages_received'] = self.active_connections[sid].get('messages_received', 0) + 1
        elif activity_type == 'error':
            self.active_connections[sid]['errors'] = self.active_connections[sid].get('errors', 0) + 1

    def get_connection_info(self, sid: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a specific connection.
        
        Args:
            sid: Socket.IO session ID
            
        Returns:
            Connection information dictionary or None if not found
        """
        return self.active_connections.get(sid)

    def get_connections_by_agent(self, agent_id: str) -> List[str]:
        """
        Get all connections for a specific agent.
        
        Args:
            agent_id: Agent ID
            
        Returns:
            List of socket IDs for the agent
        """
        return [
            sid for sid, conn in self.active_connections.items()
            if conn.get('auth') and conn.get('auth').get('agent_id') == agent_id
        ]

    def get_connections_by_session(self, session_id: str) -> List[str]:
        """
        Get all connections for a specific session.
        
        Args:
            session_id: Session ID
            
        Returns:
            List of socket IDs in the session
        """
        return [
            sid for sid, conn in self.active_connections.items()
            if conn.get('auth') and conn.get('auth').get('session_id') == session_id
        ]

    def get_connection_metrics(self) -> Dict[str, Any]:
        """
        Get metrics about current connections.
        
        Returns:
            Dictionary with connection metrics
        """
        now = time.time()
        total_connections = len(self.active_connections)
        active_ips = len(self.connections_by_ip)
        banned_ips = len(self.banned_ips)
        
        connection_ages = [now - conn.get('connected_at', now) for conn in self.active_connections.values()]
        avg_connection_age = sum(connection_ages) / len(connection_ages) if connection_ages else 0
        
        messages_sent = sum(conn.get('messages_sent', 0) for conn in self.active_connections.values())
        messages_received = sum(conn.get('messages_received', 0) for conn in self.active_connections.values())
        
        return {
            'total_connections': total_connections,
            'unique_ips': active_ips,
            'banned_ips': banned_ips,
            'avg_connection_age_seconds': avg_connection_age,
            'messages_sent': messages_sent,
            'messages_received': messages_received,
            'suspicious_ips': len(self.suspicious_activity)
        }

# Singleton instance
_connection_manager = None

def get_connection_manager(sio: Optional[socketio.AsyncServer] = None) -> ConnectionManager:
    """
    Get the singleton connection manager instance.
    
    Args:
        sio: Socket.IO server instance (required on first call)
        
    Returns:
        ConnectionManager instance
        
    Raises:
        ValueError: If sio is not provided on first call
    """
    global _connection_manager
    
    if _connection_manager is None:
        if sio is None:
            raise ValueError("Socket.IO server instance must be provided on first call")
        _connection_manager = ConnectionManager(sio)
    
    return _connection_manager