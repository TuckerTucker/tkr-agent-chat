"""
Agent Health Service.

Responsible for:
- Monitoring agent health status
- Detecting hung agents based on activity timeout
- Providing agent restart capabilities
- Collecting agent health metrics
"""

import os
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple

from .chat_service import chat_service
from .logger_service import logger_service
from ..models.error_responses import StandardErrorResponse, ErrorCodes, ErrorCategory, ErrorSeverity

# Configure logger
logger = logger_service.get_logger(__name__)

class AgentHealthService:
    """Service for monitoring and managing agent health."""
    
    def __init__(self):
        """Initialize the health service with default configuration."""
        # Default timeout in minutes (can be overridden by environment variables)
        self.agent_timeout_minutes = int(os.environ.get("AGENT_INACTIVITY_TIMEOUT_MINUTES", "30"))
        
        # Track restart attempts to prevent excessive restarts
        self.restart_attempts = {}  # agent_id -> {timestamp, count}
        
        # Max restarts per period to prevent restart loops
        self.max_restarts_per_hour = int(os.environ.get("MAX_AGENT_RESTARTS_PER_HOUR", "3"))
        
        # Track health check history
        self.health_check_history = {}  # agent_id -> list of health statuses
        self.max_history_per_agent = 10  # Keep last 10 health checks
        
        logger.info(f"AgentHealthService initialized with timeout: {self.agent_timeout_minutes} minutes")
    
    def check_agent_health(self, agent_id: str) -> Dict[str, Any]:
        """
        Check the health status of a specific agent.
        
        Args:
            agent_id: The ID of the agent to check
            
        Returns:
            Dictionary with health status information
            
        Raises:
            ValueError: If agent not found
        """
        agent = chat_service.get_agent(agent_id)
        if not agent:
            logger.warning(f"Agent {agent_id} not found during health check")
            raise ValueError(f"Agent {agent_id} not found")
        
        try:
            # Get health status from BaseAgent
            if hasattr(agent, "get_health_status") and callable(agent.get_health_status):
                health_status = agent.get_health_status()
                
                # Calculate elapsed time since last activity
                last_activity_time = None
                elapsed_time = None
                is_hung = False
                
                if health_status.get("last_activity"):
                    try:
                        last_activity_time = datetime.fromisoformat(health_status["last_activity"])
                        elapsed_time = (datetime.now() - last_activity_time).total_seconds() / 60
                        
                        # Check if agent is hung based on timeout
                        is_hung = elapsed_time > self.agent_timeout_minutes
                        
                        # Update health status with additional information
                        health_status["minutes_since_activity"] = round(elapsed_time, 2) if elapsed_time else None
                        health_status["is_hung"] = is_hung
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Error parsing last_activity for agent {agent_id}: {e}")
                
                # Store health check in history
                self._update_health_check_history(agent_id, health_status)
                
                return health_status
            else:
                logger.warning(f"Agent {agent_id} doesn't implement get_health_status method")
                return {
                    "id": agent_id,
                    "name": getattr(agent, "name", agent_id),
                    "status": "unknown",
                    "error": "Agent doesn't support health status reporting"
                }
        except Exception as e:
            logger.error(f"Error checking health for agent {agent_id}: {e}", exc_info=True)
            return {
                "id": agent_id,
                "name": getattr(agent, "name", agent_id),
                "status": "error",
                "error": str(e)
            }
    
    def check_all_agents_health(self) -> List[Dict[str, Any]]:
        """
        Check health status of all available agents.
        
        Returns:
            List of agent health status dictionaries
        """
        agents = chat_service.get_agents()
        health_statuses = []
        
        for agent in agents:
            agent_id = getattr(agent, "id", None)
            if not agent_id:
                continue
                
            try:
                health_status = self.check_agent_health(agent_id)
                health_statuses.append(health_status)
            except Exception as e:
                logger.error(f"Error checking health for agent {agent_id}: {e}")
                # Add basic error status
                health_statuses.append({
                    "id": agent_id,
                    "name": getattr(agent, "name", agent_id),
                    "status": "error",
                    "error": str(e)
                })
        
        return health_statuses
    
    def restart_agent(self, agent_id: str) -> Dict[str, Any]:
        """
        Attempt to restart a hung agent.
        
        Args:
            agent_id: ID of the agent to restart
            
        Returns:
            Dictionary with restart result
            
        Raises:
            ValueError: If agent not found
        """
        agent = chat_service.get_agent(agent_id)
        if not agent:
            logger.warning(f"Agent {agent_id} not found during restart attempt")
            raise ValueError(f"Agent {agent_id} not found")
        
        # Check if we've restarted this agent too many times recently
        if not self._can_restart_agent(agent_id):
            error_msg = f"Too many restart attempts for agent {agent_id}"
            logger.warning(error_msg)
            return {
                "id": agent_id,
                "success": False,
                "message": error_msg,
                "restart_attempts": self.restart_attempts.get(agent_id, {}).get("count", 0)
            }
        
        try:
            # Check if agent has reset_state method
            if hasattr(agent, "reset_state") and callable(agent.reset_state):
                # Record restart attempt
                self._record_restart_attempt(agent_id)
                
                # Perform the reset
                agent.reset_state()
                
                # Get updated health status
                health_status = self.check_agent_health(agent_id)
                
                logger.info(f"Successfully restarted agent {agent_id}")
                return {
                    "id": agent_id,
                    "success": True,
                    "message": "Agent successfully restarted",
                    "health_status": health_status
                }
            else:
                error_msg = f"Agent {agent_id} doesn't support reset_state method"
                logger.warning(error_msg)
                return {
                    "id": agent_id,
                    "success": False,
                    "message": error_msg
                }
        except Exception as e:
            logger.error(f"Error restarting agent {agent_id}: {e}", exc_info=True)
            return {
                "id": agent_id,
                "success": False,
                "message": f"Error restarting agent: {str(e)}"
            }
    
    def find_and_restart_hung_agents(self) -> List[Dict[str, Any]]:
        """
        Check all agents, identify hung ones, and restart them.
        
        Returns:
            List of results for any restart attempts
        """
        restart_results = []
        all_health_statuses = self.check_all_agents_health()
        
        for status in all_health_statuses:
            agent_id = status.get("id")
            
            # Check if agent is hung
            if status.get("is_hung", False) and status.get("status") != "error":
                logger.info(f"Detected hung agent {agent_id}, attempting restart")
                
                # Attempt restart
                restart_result = self.restart_agent(agent_id)
                restart_results.append(restart_result)
        
        return restart_results
    
    def _update_health_check_history(self, agent_id: str, health_status: Dict[str, Any]) -> None:
        """
        Update the health check history for an agent.
        
        Args:
            agent_id: Agent ID
            health_status: Current health status
        """
        if agent_id not in self.health_check_history:
            self.health_check_history[agent_id] = []
        
        # Add timestamp to health status
        health_status["timestamp"] = datetime.now().isoformat()
        
        # Add to history, maintaining maximum size
        self.health_check_history[agent_id].append(health_status)
        if len(self.health_check_history[agent_id]) > self.max_history_per_agent:
            self.health_check_history[agent_id] = self.health_check_history[agent_id][-self.max_history_per_agent:]
    
    def _can_restart_agent(self, agent_id: str) -> bool:
        """
        Check if an agent can be restarted based on recent restart history.
        
        Args:
            agent_id: Agent ID to check
            
        Returns:
            True if agent can be restarted, False otherwise
        """
        now = datetime.now()
        one_hour_ago = now - timedelta(hours=1)
        
        if agent_id not in self.restart_attempts:
            return True
        
        restart_info = self.restart_attempts.get(agent_id, {})
        last_restart = restart_info.get("timestamp")
        restart_count = restart_info.get("count", 0)
        
        # If last restart was more than an hour ago, reset counter
        if last_restart and datetime.fromisoformat(last_restart) < one_hour_ago:
            return True
        
        # Check if we've exceeded the maximum restarts per hour
        return restart_count < self.max_restarts_per_hour
    
    def _record_restart_attempt(self, agent_id: str) -> None:
        """
        Record a restart attempt for rate limiting.
        
        Args:
            agent_id: Agent ID that was restarted
        """
        now = datetime.now().isoformat()
        
        # Get current count if exists
        current_info = self.restart_attempts.get(agent_id, {"count": 0})
        current_count = current_info.get("count", 0)
        
        # Check if we need to reset the counter (if last restart was > 1 hour ago)
        last_restart = current_info.get("timestamp")
        if last_restart:
            one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()
            if last_restart < one_hour_ago:
                current_count = 0
        
        # Update restart tracking information
        self.restart_attempts[agent_id] = {
            "timestamp": now,
            "count": current_count + 1
        }
    
    def get_agent_health_history(self, agent_id: str) -> List[Dict[str, Any]]:
        """
        Get health check history for a specific agent.
        
        Args:
            agent_id: Agent ID to get history for
            
        Returns:
            List of historical health check results
        """
        return self.health_check_history.get(agent_id, [])

# Global instance
agent_health_service = AgentHealthService()