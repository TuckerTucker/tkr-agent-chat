"""
Unit tests for Socket.IO Connection Manager

These tests verify the connection manager functionality including:
- Connection authentication
- Rate limiting
- Connection tracking
- Suspicious activity detection
- Ban management
"""

import asyncio
import pytest
import time
import jwt
from unittest.mock import AsyncMock, MagicMock, patch

from ...services.socket_connection_manager import (
    ConnectionManager,
    get_connection_manager
)

# Mark all tests as async to work with async functions
pytestmark = pytest.mark.asyncio

class TestConnectionManager:
    """Tests for Socket.IO Connection Manager"""
    
    async def test_singleton_pattern(self):
        """Test the singleton pattern for the connection manager"""
        # First call should require sio
        with pytest.raises(ValueError):
            get_connection_manager()
            
        # Create with proper sio
        mock_sio = MagicMock()
        manager1 = get_connection_manager(mock_sio)
        
        # Second call should return same instance
        manager2 = get_connection_manager()
        
        assert manager1 is manager2
        assert manager1.sio is mock_sio
    
    async def test_connection_authentication(self):
        """Test connection authentication with JWT"""
        # Setup
        mock_sio = MagicMock()
        manager = ConnectionManager(mock_sio)
        sid = "test-sid-auth"
        
        # Mock environ with token
        environ = {
            'REMOTE_ADDR': '192.168.1.1',
            'HTTP_USER_AGENT': 'Test Browser',
            'HTTP_AUTHORIZATION': 'Bearer valid-token',
            'QUERY_STRING': 'session_id=session-123'
        }
        
        # Mock JWT decode to return valid data
        with patch('jwt.decode', return_value={"user_id": "user-1", "agent_id": "agent-1"}):
            success, reason, auth_data = await manager.authenticate_connection(sid, environ)
        
        # Assert successful authentication
        assert success is True
        assert reason is None
        assert auth_data is not None
        assert auth_data["user_id"] == "user-1"
        assert auth_data["agent_id"] == "agent-1"
        
        # Verify connection tracking
        assert sid in manager.active_connections
        assert manager.active_connections[sid]['ip'] == '192.168.1.1'
        assert manager.active_connections[sid]['auth'] == auth_data
        
        # Test expired token
        environ['HTTP_AUTHORIZATION'] = 'Bearer expired-token'
        with patch('jwt.decode', side_effect=jwt.ExpiredSignatureError):
            success, reason, auth_data = await manager.authenticate_connection("expired-sid", environ)
        
        # Assert failed authentication
        assert success is False
        assert reason == "Token expired"
        assert auth_data is None
        
        # Test invalid token
        environ['HTTP_AUTHORIZATION'] = 'Bearer invalid-token'
        with patch('jwt.decode', side_effect=jwt.InvalidTokenError):
            success, reason, auth_data = await manager.authenticate_connection("invalid-sid", environ)
        
        # Assert failed authentication
        assert success is False
        assert reason == "Invalid token"
        assert auth_data is None
    
    async def test_rate_limiting(self):
        """Test connection rate limiting functionality"""
        # Setup
        mock_sio = MagicMock()
        manager = ConnectionManager(mock_sio)
        
        # Set a lower rate limit for testing
        manager.rate_limit_max_connections = 5
        manager.rate_limit_window = 10  # 10 seconds
        
        # Test with a new IP - should pass
        new_ip = "192.168.5.5"
        is_allowed = manager._check_rate_limit(new_ip)
        assert is_allowed is True
        
        # Make multiple connection attempts
        for i in range(5):
            manager._check_rate_limit(new_ip)
            
        # Next attempt should be rate limited
        is_allowed = manager._check_rate_limit(new_ip)
        assert is_allowed is False
        
        # Add attempt from a different IP - should pass
        different_ip = "192.168.5.6"
        is_allowed = manager._check_rate_limit(different_ip)
        assert is_allowed is True
        
        # Test with very old timestamps (should be allowed)
        manager.connection_attempts_by_ip[new_ip] = [time.time() - 20]  # Older than window
        is_allowed = manager._check_rate_limit(new_ip)
        assert is_allowed is True
    
    async def test_connection_tracking(self):
        """Test connection tracking functionality"""
        # Setup
        mock_sio = MagicMock()
        manager = ConnectionManager(mock_sio)
        
        # Create test connections
        sid1 = "test-sid-1"
        sid2 = "test-sid-2"
        
        # Add connections from same IP but different agents
        manager.active_connections[sid1] = {
            'sid': sid1,
            'ip': '192.168.1.10',
            'auth': {"agent_id": "agent-1", "session_id": "session-1"},
            'connected_at': time.time(),
            'last_activity': time.time()
        }
        
        manager.active_connections[sid2] = {
            'sid': sid2,
            'ip': '192.168.1.10',
            'auth': {"agent_id": "agent-2", "session_id": "session-1"},
            'connected_at': time.time(),
            'last_activity': time.time()
        }
        
        # Update IP tracking
        manager.connections_by_ip['192.168.1.10'] = [sid1, sid2]
        
        # Test get_connection_info
        conn_info = manager.get_connection_info(sid1)
        assert conn_info is not None
        assert conn_info['sid'] == sid1
        assert conn_info['auth']['agent_id'] == "agent-1"
        
        # Test get_connections_by_agent
        agent_conns = manager.get_connections_by_agent("agent-1")
        assert len(agent_conns) == 1
        assert sid1 in agent_conns
        
        agent_conns = manager.get_connections_by_agent("agent-2")
        assert len(agent_conns) == 1
        assert sid2 in agent_conns
        
        # Test get_connections_by_session
        session_conns = manager.get_connections_by_session("session-1")
        assert len(session_conns) == 2
        assert sid1 in session_conns
        assert sid2 in session_conns
        
        # Test update_activity
        manager.update_activity(sid1, "message_sent")
        manager.update_activity(sid1, "message_sent")
        manager.update_activity(sid2, "message_received")
        manager.update_activity(sid1, "error")
        
        assert manager.active_connections[sid1]['messages_sent'] == 2
        assert manager.active_connections[sid1]['errors'] == 1
        assert manager.active_connections[sid2]['messages_received'] == 1
        
        # Test get_connection_metrics
        metrics = manager.get_connection_metrics()
        assert metrics['total_connections'] == 2
        assert metrics['unique_ips'] == 1
        assert metrics['messages_sent'] == 2
        assert metrics['messages_received'] == 1
    
    @patch('socketio.AsyncServer.disconnect')
    async def test_cleanup_stale_connections(self, mock_disconnect):
        """Test cleanup of stale connections"""
        # Setup
        mock_sio = MagicMock()
        mock_sio.disconnect = AsyncMock()
        # Ensure disconnect returns a Future to avoid blocking
        mock_sio.disconnect.return_value = asyncio.Future()
        mock_sio.disconnect.return_value.set_result(None)
        
        manager = ConnectionManager(mock_sio)
        
        # Add active connection
        active_sid = "active-sid"
        manager.active_connections[active_sid] = {
            'sid': active_sid,
            'ip': '192.168.1.20',
            'connected_at': time.time(),
            'last_activity': time.time()  # Just now
        }
        
        # Add stale connection
        stale_sid = "stale-sid"
        manager.active_connections[stale_sid] = {
            'sid': stale_sid,
            'ip': '192.168.1.21',
            'connected_at': time.time() - 300,  # 5 minutes ago
            'last_activity': time.time() - 180  # 3 minutes ago = stale
        }
        
        # Add connections to IP tracking
        manager.connections_by_ip['192.168.1.20'] = [active_sid]
        manager.connections_by_ip['192.168.1.21'] = [stale_sid]
        
        # Run cleanup with timeout to prevent hanging
        try:
            await asyncio.wait_for(manager._cleanup_stale_connections(), timeout=1.0)
        except asyncio.TimeoutError:
            pytest.fail("Cleanup operation timed out")
        
        # Verify stale connection was cleaned up
        assert active_sid in manager.active_connections
        assert stale_sid not in manager.active_connections
        assert '192.168.1.20' in manager.connections_by_ip
        assert '192.168.1.21' not in manager.connections_by_ip
        
        # Verify disconnect was called for stale connection
        mock_sio.disconnect.assert_called_once_with(stale_sid)
    
    @patch('socketio.AsyncServer.disconnect')
    async def test_suspicious_activity(self, mock_disconnect):
        """Test suspicious activity detection and banning"""
        # Setup
        mock_sio = MagicMock()
        mock_sio.disconnect = AsyncMock()
        # Ensure disconnect returns a Future to avoid blocking
        mock_sio.disconnect.return_value = asyncio.Future()
        mock_sio.disconnect.return_value.set_result(None)
        
        manager = ConnectionManager(mock_sio)
        
        # Lower ban threshold for testing
        manager.ban_threshold = 1
        
        # Patch _ban_ip to avoid async issues
        original_ban_ip = manager._ban_ip
        async def mock_ban_ip(client_ip):
            manager.banned_ips[client_ip] = time.time() + manager.ban_duration
        manager._ban_ip = mock_ban_ip
        
        # Add multiple connections from same IP
        suspicious_ip = '192.168.1.100'
        now = time.time()
        
        # Create 15 connections from same IP in the last minute
        for i in range(15):
            sid = f"suspicious-sid-{i}"
            manager.active_connections[sid] = {
                'sid': sid,
                'ip': suspicious_ip,
                'connected_at': now - 30,  # 30 seconds ago
                'last_activity': now - 15,  # 15 seconds ago
                'user_agent': 'Suspicious Browser'
            }
        
        # Update IP tracking
        manager.connections_by_ip[suspicious_ip] = [f"suspicious-sid-{i}" for i in range(15)]
        
        # Run activity analysis with timeout
        try:
            await asyncio.wait_for(asyncio.sleep(0), timeout=0.1)  # Small yield to event loop
            manager._analyze_activity_patterns()
        except asyncio.TimeoutError:
            pytest.fail("Activity analysis timed out")
        
        # Verify suspicious activity was detected
        assert suspicious_ip in manager.suspicious_activity
        assert manager.suspicious_activity[suspicious_ip]['count'] == 1
        
        # Run analysis again to trigger ban with timeout
        try:
            await asyncio.wait_for(asyncio.sleep(0), timeout=0.1)  # Small yield to event loop
            manager._analyze_activity_patterns()
        except asyncio.TimeoutError:
            pytest.fail("Ban operation timed out")
        
        # Verify IP was banned
        assert suspicious_ip in manager.banned_ips
        
        # Verify all connections from banned IP were disconnected
        assert mock_sio.disconnect.call_count == 15
        
        # Test authentication with banned IP
        environ = {
            'REMOTE_ADDR': suspicious_ip,
            'HTTP_USER_AGENT': 'Test Browser'
        }
        
        # Add timeout protection
        try:
            success, reason, _ = await asyncio.wait_for(
                manager.authenticate_connection("banned-test-sid", environ), 
                timeout=1.0
            )
        except asyncio.TimeoutError:
            pytest.fail("Authentication timed out")
        
        # Should be rejected
        assert success is False
        assert reason == "IP is temporarily banned"
        
        # Test ban expiration
        # Set ban time to older than ban duration
        manager.banned_ips[suspicious_ip] = time.time() - (manager.ban_duration + 10)
        
        # Run cleanup to remove expired bans with timeout
        try:
            await asyncio.wait_for(manager._cleanup_stale_connections(), timeout=1.0)
        except asyncio.TimeoutError:
            pytest.fail("Cleanup operation timed out")
        
        # Verify ban was removed
        assert suspicious_ip not in manager.banned_ips
        
        # Should now allow connections again with timeout
        try:
            success, reason, _ = await asyncio.wait_for(
                manager.authenticate_connection("post-ban-sid", environ),
                timeout=1.0
            )
        except asyncio.TimeoutError:
            pytest.fail("Authentication timed out")
            
        assert success is True
        
        # Restore original method
        manager._ban_ip = original_ban_ip