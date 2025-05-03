"""
LEGACY MODULE - Replaced by Socket.IO implementation
This module is kept for backward compatibility only and should not be used
for new development. All WebSocket functionality has moved to socket_service.py
and socket_connection_manager.py.
"""

import logging
import asyncio
import threading
from typing import Set, Dict, Any
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

class ThreadSafeSet(set):
    """Thread-safe set implementation using a lock."""
    def __init__(self, *args, **kwargs):
        self._lock = threading.RLock()
        super().__init__(*args, **kwargs)
        
    def add(self, item):
        with self._lock:
            super().add(item)
            
    def remove(self, item):
        with self._lock:
            super().remove(item)
            
    def __contains__(self, item):
        with self._lock:
            return super().__contains__(item)
            
    def __len__(self):
        with self._lock:
            return super().__len__()
            
    def clear(self):
        with self._lock:
            super().clear()

class SharedState:
    """
    DEPRECATED: This class is kept for backward compatibility only.
    All WebSocket management has moved to Socket.IO implementation.
    """
    def __init__(self):
        self.active_websockets = ThreadSafeSet()
        self._websocket_locks = {}
        self._locks_lock = threading.RLock()  # Lock for the locks dict itself
        self.executor = ThreadPoolExecutor(max_workers=10)

    def add_websocket(self, websocket: Any):
        """Legacy method - not used with Socket.IO implementation"""
        logger.warning("SharedState.add_websocket called - this is deprecated")
        pass

    def remove_websocket(self, websocket: Any):
        """Legacy method - not used with Socket.IO implementation"""
        logger.warning("SharedState.remove_websocket called - this is deprecated")
        pass

    def get_websocket_lock(self, websocket: Any):
        """Legacy method - not used with Socket.IO implementation"""
        logger.warning("SharedState.get_websocket_lock called - this is deprecated")
        return asyncio.Lock()  # Return a dummy lock

    def clear_websockets(self):
        """Legacy method - not used with Socket.IO implementation"""
        logger.warning("SharedState.clear_websockets called - this is deprecated")
        self.active_websockets.clear()
        with self._locks_lock:
            self._websocket_locks.clear()
            
    def run_in_executor(self, func, *args):
        """Run a function in a thread executor"""
        return self.executor.submit(func, *args)

# Create a singleton instance
shared_state = SharedState()