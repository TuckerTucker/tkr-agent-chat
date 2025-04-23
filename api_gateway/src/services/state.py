"""
Shared state management for the API Gateway.
"""

import logging
from typing import Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class SharedState:
    def __init__(self):
        self.active_websockets: Set[WebSocket] = set()

    def add_websocket(self, websocket: WebSocket):
        """Add a WebSocket connection to active connections."""
        self.active_websockets.add(websocket)
        logger.debug(f"Added WebSocket to active connections. Total active: {len(self.active_websockets)}")

    def remove_websocket(self, websocket: WebSocket):
        """Remove a WebSocket connection from active connections."""
        if websocket in self.active_websockets:
            self.active_websockets.remove(websocket)
            logger.debug(f"Removed WebSocket from active connections. Remaining: {len(self.active_websockets)}")

    def clear_websockets(self):
        """Clear all active WebSocket connections."""
        count = len(self.active_websockets)
        self.active_websockets.clear()
        logger.info(f"Cleared {count} active WebSocket connections")

    def get_active_count(self) -> int:
        """Get the number of active WebSocket connections."""
        return len(self.active_websockets)

# Global instance
shared_state = SharedState()
