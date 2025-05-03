"""
Thread pool executor service for running CPU-bound tasks outside the async event loop.
"""

import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

class ThreadExecutorService:
    """
    Thread pool executor for running CPU-bound or blocking operations.
    This prevents blocking the main async event loop.
    """
    def __init__(self, max_workers=10):
        """
        Initialize the thread pool executor.
        
        Args:
            max_workers: Maximum number of worker threads in the pool
        """
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self._shutdown = False
        logger.info(f"ThreadExecutorService initialized with {max_workers} workers")
        
    def run_in_executor(self, func, *args):
        """
        Run a function in the thread executor.
        
        Args:
            func: The function to execute
            args: Arguments to pass to the function
            
        Returns:
            A concurrent.futures.Future representing the execution
        """
        if self._shutdown:
            raise RuntimeError("ThreadExecutorService has been shut down")
        
        return self.executor.submit(func, *args)
    
    async def run_async(self, func, *args):
        """
        Run a function in the thread executor and await its result.
        
        Args:
            func: The function to execute
            args: Arguments to pass to the function
            
        Returns:
            The result of the function
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self.executor, func, *args)
    
    def shutdown(self, wait=True):
        """
        Shutdown the thread executor.
        
        Args:
            wait: Whether to wait for scheduled tasks to complete
        """
        self._shutdown = True
        self.executor.shutdown(wait=wait)
        logger.info("ThreadExecutorService shut down")

# For backward compatibility
class SharedState:
    """
    Service provider for thread executor functionality.
    Maintained for backward compatibility.
    """
    def __init__(self):
        """Initialize with a thread executor service."""
        self._executor_service = ThreadExecutorService()
    
    def run_in_executor(self, func, *args):
        """
        Run a function in the thread executor.
        
        Args:
            func: The function to execute
            args: Arguments to pass to the function
            
        Returns:
            A concurrent.futures.Future representing the execution
        """
        return self._executor_service.run_in_executor(func, *args)
    
    # Backward-compatibility method - does nothing
    def clear_websockets(self):
        """No-op method kept for backward compatibility."""
        pass

# Create a singleton instance
shared_state = SharedState()