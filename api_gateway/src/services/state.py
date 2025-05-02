"""
Shared state management for the API Gateway.
Provides thread-safe management of WebSocket connections and lock objects.
"""

import logging
import asyncio
import threading
from typing import Set, Dict, Any
from fastapi import WebSocket
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

    def clear(self):
        with self._lock:
            super().clear()
    
    def __iter__(self):
        with self._lock:
            # Create a copy to avoid modification during iteration
            return iter(list(super().__iter__()))
            
    def __len__(self):
        with self._lock:
            return super().__len__()

class SharedState:
    def __init__(self):
        # Use thread-safe set for active WebSockets
        self.active_websockets = ThreadSafeSet()
        
        # Maps WebSocket objects to their locks
        # Each connection gets its own lock to prevent concurrent access
        self._websocket_locks: Dict[WebSocket, asyncio.Lock] = {}
        self._locks_lock = threading.RLock()  # Lock for the locks dict itself
        
        # Executor for running blocking operations off the event loop
        self.executor = ThreadPoolExecutor(max_workers=10)

    def add_websocket(self, websocket: WebSocket):
        """Add a WebSocket connection to active connections."""
        self.active_websockets.add(websocket)
        
        # Create a lock for this websocket
        with self._locks_lock:
            if websocket not in self._websocket_locks:
                self._websocket_locks[websocket] = asyncio.Lock()
                
        # Log without including the websocket object directly
        logger.debug(f"Added WebSocket to active connections. Total active: {len(self.active_websockets)}")

    def remove_websocket(self, websocket: WebSocket):
        """Remove a WebSocket connection from active connections."""
        if websocket in self.active_websockets:
            self.active_websockets.remove(websocket)
            
            # Remove the lock for this websocket
            with self._locks_lock:
                if websocket in self._websocket_locks:
                    del self._websocket_locks[websocket]
                    
            # Log without including the websocket object directly
            logger.debug(f"Removed WebSocket from active connections. Remaining: {len(self.active_websockets)}")

    def clear_websockets(self):
        """Clear all active WebSocket connections."""
        count = len(self.active_websockets)
        
        # Get a copy of the set to work with
        websockets_to_remove = list(self.active_websockets)
        
        # Clear the active websockets
        self.active_websockets.clear()
        
        # Clear the locks too
        with self._locks_lock:
            for ws in websockets_to_remove:
                if ws in self._websocket_locks:
                    del self._websocket_locks[ws]
            
        logger.info(f"Cleared {count} active WebSocket connections")

    def get_active_count(self) -> int:
        """Get the number of active WebSocket connections."""
        return len(self.active_websockets)
        
    def get_websocket_lock(self, websocket: WebSocket) -> asyncio.Lock:
        """Get the lock for a specific websocket, creating it if needed."""
        with self._locks_lock:
            if websocket not in self._websocket_locks:
                self._websocket_locks[websocket] = asyncio.Lock()
            return self._websocket_locks[websocket]
            
    async def run_with_websocket_lock(self, websocket: WebSocket, func, *args, **kwargs) -> Any:
        """Run a function with the lock for a specific websocket."""
        lock = self.get_websocket_lock(websocket)
        async with lock:
            return await func(*args, **kwargs)

# Global instance
shared_state = SharedState()
