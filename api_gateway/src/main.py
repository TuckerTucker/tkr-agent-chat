"""
API Gateway for TKR Multi-Agent Chat System

Provides:
- REST endpoints for agent metadata and system info
- Socket.IO endpoints for real-time agent communication
- Message routing between frontend and agents
- Agent status and metadata management
"""

import os
import sys
import uuid
import signal
import logging
import asyncio
from datetime import datetime
from typing import Dict
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

# Import agent factories
from agents.chloe.src.index import get_agent as get_chloe_agent
from agents.phil_connors.src.index import get_agent as get_phil_connors_agent

# Import routes and services
from .routes import api, agents, a2a, context
from .services.chat_service import chat_service
from .services.a2a_service import A2AService
from .services.state import shared_state  # Legacy module, but still used for executor
from .services.logger_service import logger_service
from .services.error_service import error_service
from .services.context_service import context_service
from .services.agent_health_service import agent_health_service
from .services import socket_service  # Import Socket.IO service
from .models.error_responses import StandardErrorResponse, ErrorCodes, ErrorCategory, ErrorSeverity
from .db_factory import init_database, get_database_info  # Import database factory
from dotenv import load_dotenv

# Load environment variables from .env file in the project root
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path) 

# Generate a unique run ID for this server instance
run_timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
run_id = os.getenv("TKR_RUN_ID", run_timestamp)
# Set it in the environment so that all components can access it
os.environ["TKR_RUN_ID"] = run_id

# Configure logging using our centralized logger service
log_level = os.getenv("LOG_LEVEL", "debug")
log_dir = os.getenv("TKR_LOG_DIR")  # Use env variable or default
log_filename = os.getenv("TKR_LOG_FILENAME", "api_gateway.log")
max_file_size_mb = int(os.getenv("TKR_LOG_MAX_SIZE_MB", "10"))
backup_count = int(os.getenv("TKR_LOG_BACKUP_COUNT", "5"))
console_output = os.getenv("TKR_LOG_CONSOLE", "true").lower() == "true"

logger_service.configure_root_logger(
    log_level=log_level,
    console_output=console_output,
    file_output=True,
    log_filename=log_filename,
    log_dir=log_dir,
    max_file_size_mb=max_file_size_mb,
    backup_count=backup_count
)

# Get a logger for this module
logger = logger_service.get_logger(__name__)

# Check for necessary environment variables
if not os.getenv("GOOGLE_API_KEY"):
     logger.warning("GOOGLE_API_KEY not found in environment variables or .env file. ADK features might fail.")

# Signal handlers for graceful shutdown
def signal_handler(sig, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {sig}, shutting down gracefully...")
    
    # Clear any ADK sessions
    try:
        logger.info("Clearing all ADK sessions...")
        sessions_count = chat_service.get_active_session_count()
        chat_service.clear_all_sessions()
        logger.info(f"Successfully cleared {sessions_count} ADK sessions")
    except Exception as e:
        logger.error(f"Error clearing ADK sessions: {e}")
    
    logger.info("Cleanup complete, exiting...")
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

app = FastAPI(
    title="TKR Multi-Agent Chat API Gateway",
    description="API Gateway for multi-agent chat system",
    version="0.1.0"
)

# CORS configuration - using a custom class to exclude Socket.IO routes
class CustomCORSMiddleware(CORSMiddleware):
    """Custom CORS middleware that excludes Socket.IO routes"""
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
            
        # Skip CORS handling for Socket.IO routes to prevent duplicate headers
        path = scope.get("path", "")
        if path.startswith("/socket.io"):
            return await self.app(scope, receive, send)
            
        # For all other routes, apply normal CORS handling
        return await super().__call__(scope, receive, send)

# Add our custom CORS middleware
app.add_middleware(
    CustomCORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Explicitly allow frontend origin
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"]
)

# Global exception handlers for standardized error responses
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with standardized format."""
    # Create a standardized error response
    error = StandardErrorResponse(
        error_code=ErrorCodes.VALIDATION_ERROR,
        message="Request validation error",
        category=ErrorCategory.VALIDATION,
        severity=ErrorSeverity.ERROR,
        details={
            "errors": exc.errors(),
            "body": exc.body,
            "path": str(request.url.path)
        },
        request_id=str(request.state.request_id if hasattr(request.state, 'request_id') else None)
    )
    
    # Log the error
    error_service.log_error(
        error=error,
        level="warning",
        context_id=error.request_id
    )
    
    # Return a standardized response
    return JSONResponse(
        status_code=400,
        content=error.dict()
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions with standardized format."""
    # Create a standardized error response
    error = StandardErrorResponse(
        error_code=ErrorCodes.INTERNAL_ERROR,
        message=f"Internal server error: {str(exc)}",
        category=ErrorCategory.GENERAL,
        severity=ErrorSeverity.ERROR,
        details={
            "path": str(request.url.path),
            "method": request.method,
            "exception_type": type(exc).__name__
        },
        request_id=str(request.state.request_id if hasattr(request.state, 'request_id') else None)
    )
    
    # Log the error with traceback
    error_service.log_error(
        error=exc,
        level="error",
        include_traceback=True,
        context_id=error.request_id,
        extra={
            "path": str(request.url.path),
            "method": request.method
        }
    )
    
    # Return a standardized response
    return JSONResponse(
        status_code=500,
        content=error.dict()
    )

# Request ID middleware to track all requests
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add a unique request ID to all requests for tracking."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    
    # Log the incoming request at DEBUG level
    logger_service.log_with_context(
        logger=logger,
        level="debug",
        message=f"Request: {request.method} {request.url.path}",
        context={
            "request_id": request_id,
            "method": request.method,
            "path": str(request.url.path),
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent")
        }
    )
    
    # Process the request
    try:
        response = await call_next(request)
        # Add the request ID to the response headers
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as e:
        # Let the exception middleware handle it
        raise

def load_agents() -> Dict[str, object]:
    """
    Load all available agents using their factory functions.
    Returns a dictionary mapping agent IDs to agent instances.
    """
    try:
        agents = { 
            "chloe": get_chloe_agent(),
            "phil_connors": get_phil_connors_agent() 
        }
        logger.info(f"Loaded {len(agents)} agents: {list(agents.keys())}")
        return agents
    except Exception as e:
        logger.error(f"Error loading agents: {e}")
        raise

async def context_cleanup_task():
    """Background task to periodically clean up expired contexts."""
    try:
        cleanup_interval = int(os.environ.get("CONTEXT_CLEANUP_INTERVAL_SECONDS", "300"))  # Default: 5 minutes
        batch_size = int(os.environ.get("CONTEXT_CLEANUP_BATCH_SIZE", "100"))
        
        logger.info(f"Starting context cleanup background task (interval: {cleanup_interval}s, batch_size: {batch_size})")
        
        while True:
            try:
                removed_count = context_service.batch_cleanup_contexts(batch_size=batch_size)
                if removed_count > 0:
                    logger.info(f"Background task removed {removed_count} expired contexts")
            except Exception as e:
                logger.error(f"Error in context cleanup task: {e}")
                
            # Sleep until next cleanup cycle
            await asyncio.sleep(cleanup_interval)
    except Exception as e:
        logger.error(f"Fatal error in context cleanup task: {e}")
        # Task will exit, but we'll restart it in startup_event

async def message_cleanup_task():
    """Background task to periodically trim old messages from active sessions."""
    try:
        # Configure from environment variables or use defaults
        interval_minutes = int(os.environ.get("MESSAGE_CLEANUP_INTERVAL_MINUTES", "30"))  # Every 30 minutes
        max_messages = int(os.environ.get("MAX_SESSION_MESSAGES", "500"))  # Keep last 500 messages
        
        logger.info(f"Starting message cleanup task (interval: {interval_minutes} min, max messages: {max_messages})")
        
        while True:
            try:
                # Get all active sessions
                sessions = chat_service.get_sessions()
                cleaned_count = 0
                
                # Process each session
                for session in sessions:
                    session_id = session['id']
                    from .db_factory import trim_session_messages
                    deleted = trim_session_messages(session_id, max_messages)
                    if deleted > 0:
                        cleaned_count += deleted
                        
                if cleaned_count > 0:
                    logger.info(f"Background task trimmed {cleaned_count} messages from {len(sessions)} sessions")
            except Exception as e:
                logger.error(f"Error in message cleanup task: {e}")
                
            # Sleep until next cleanup cycle
            await asyncio.sleep(interval_minutes * 60)
    except Exception as e:
        logger.error(f"Fatal error in message cleanup task: {e}")
        # Task will exit, but we'll restart it in startup_event

async def inactive_session_cleanup_task():
    """Background task to periodically clear inactive ADK sessions."""
    try:
        # Configure from environment variables or use defaults
        interval_minutes = int(os.environ.get("SESSION_CLEANUP_INTERVAL_MINUTES", "60"))  # Every 60 minutes
        max_inactivity_minutes = int(os.environ.get("MAX_SESSION_INACTIVITY_MINUTES", "120"))  # 2 hours
        
        logger.info(f"Starting session cleanup task (interval: {interval_minutes} min, inactivity timeout: {max_inactivity_minutes} min)")
        
        while True:
            try:
                # Check last activity for all sessions
                now = datetime.utcnow()
                inactive_sessions = []
                
                # Get all active ADK sessions
                for session_id, session in list(chat_service.active_adk_sessions.items()):
                    try:
                        # Look for a last_activity property
                        last_activity = getattr(session, 'last_activity', None)
                        
                        # If no last_activity, check if we can get it from session metadata
                        if not last_activity and hasattr(session, 'metadata'):
                            last_activity = session.metadata.get('last_activity')
                            
                        # If we still don't have last_activity, skip this session
                        if not last_activity:
                            continue
                            
                        # Check if session has been inactive too long
                        if isinstance(last_activity, str):
                            # Parse ISO format string to datetime
                            last_activity = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
                            
                        idle_minutes = (now - last_activity).total_seconds() / 60
                        if idle_minutes > max_inactivity_minutes:
                            inactive_sessions.append(session_id)
                    except Exception as e:
                        logger.error(f"Error checking session {session_id} activity: {e}")
                        
                # Clear inactive sessions
                for session_id in inactive_sessions:
                    try:
                        chat_service.clear_adk_session(session_id)
                    except Exception as e:
                        logger.error(f"Error clearing inactive session {session_id}: {e}")
                        
                if inactive_sessions:
                    logger.info(f"Cleared {len(inactive_sessions)} inactive sessions")
            except Exception as e:
                logger.error(f"Error in session cleanup task: {e}")
                
            # Sleep until next cleanup cycle
            await asyncio.sleep(interval_minutes * 60)
    except Exception as e:
        logger.error(f"Fatal error in session cleanup task: {e}")
        # Task will exit, but we'll restart it in startup_event

async def agent_health_monitoring_task():
    """Background task to periodically check agent health and restart hung agents."""
    try:
        # Configure from environment variables or use defaults
        interval_minutes = int(os.environ.get("AGENT_HEALTH_CHECK_INTERVAL_MINUTES", "5"))  # Every 5 minutes
        auto_restart = os.environ.get("AUTO_RESTART_HUNG_AGENTS", "true").lower() == "true"
        
        logger.info(f"Starting agent health monitoring task (interval: {interval_minutes} min, auto-restart: {auto_restart})")
        
        while True:
            try:
                # Check health of all agents
                health_statuses = agent_health_service.check_all_agents_health()
                
                # Log health status summary
                hung_agents = [status for status in health_statuses if status.get("is_hung", False)]
                error_agents = [status for status in health_statuses if status.get("status") == "error"]
                
                if hung_agents or error_agents:
                    logger.warning(f"Agent health check: {len(hung_agents)} hung, {len(error_agents)} with errors")
                    
                    # Record problematic agents with details
                    for agent in hung_agents:
                        agent_id = agent.get("id")
                        minutes = agent.get("minutes_since_activity")
                        logger.warning(f"Hung agent: {agent_id} - {minutes:.1f} minutes since last activity")
                    
                    for agent in error_agents:
                        agent_id = agent.get("id")
                        error = agent.get("last_error", "Unknown error")
                        logger.warning(f"Agent in error state: {agent_id} - {error}")
                    
                    # Auto-restart hung agents if enabled
                    if auto_restart and (hung_agents or error_agents):
                        restart_results = agent_health_service.find_and_restart_hung_agents()
                        
                        # Log restart results
                        success_count = len([r for r in restart_results if r.get("success", False)])
                        fail_count = len(restart_results) - success_count
                        
                        if restart_results:
                            logger.info(f"Auto-restart results: {success_count} successful, {fail_count} failed")
                else:
                    logger.debug(f"Agent health check: All {len(health_statuses)} agents healthy")
                
            except Exception as e:
                logger.error(f"Error in agent health monitoring task: {e}")
                
            # Sleep until next monitoring cycle
            await asyncio.sleep(interval_minutes * 60)
    except Exception as e:
        logger.error(f"Fatal error in agent health monitoring task: {e}")
        # Task will exit, but we'll restart it in startup_event

@app.on_event("startup")
async def startup_event():
    """Initialize services and database on startup."""
    try:
        logger.info("=== STARTUP SEQUENCE BEGINNING ===")
        
        # Initialize LMDB Database
        logger.info("STEP 1: Initializing LMDB database...")
        init_database()
        db_info = get_database_info()
        logger.info(f"LMDB database initialized: implementation={db_info['implementation']}, path={db_info['path']}")

        # Load agents into ChatService
        logger.info("STEP 2: Loading agents into ChatService...")
        loaded_agents = load_agents()
        chat_service.set_agents(loaded_agents)
        logger.info(f"Chat service initialized with {len(loaded_agents)} agents: {list(loaded_agents.keys())}")
        
        # Start background cleanup tasks
        logger.info("STEP 3: Starting background cleanup tasks...")
        
        logger.info("3.1: Starting context cleanup task...")
        asyncio.create_task(context_cleanup_task())
        logger.info("Context cleanup background task started")
        
        logger.info("3.2: Starting message cleanup task...")
        asyncio.create_task(message_cleanup_task())
        logger.info("Message cleanup background task started")
        
        logger.info("3.3: Starting inactive session cleanup task...")
        asyncio.create_task(inactive_session_cleanup_task())
        logger.info("Session cleanup background task started")
        
        logger.info("3.4: Starting agent health monitoring task...")
        asyncio.create_task(agent_health_monitoring_task())
        logger.info("Agent health monitoring background task started")
        
        # Initialize Socket.IO connection manager
        logger.info("STEP 4: Initializing Socket.IO connection manager...")
        from .services.socket_connection_manager import get_connection_manager
        connection_manager = get_connection_manager(socket_service.sio)
        logger.info("4.1: Registering connection events...")
        connection_manager.register_connection_events()
        logger.info("4.2: Starting connection monitoring...")
        asyncio.create_task(connection_manager.start_monitoring())
        logger.info("Socket.IO connection manager initialized")
        
        # Start Socket.IO background tasks
        logger.info("STEP 5: Starting Socket.IO background tasks...")
        await socket_service.start_background_tasks()
        logger.info("Socket.IO background tasks started")
        
        logger.info("=== STARTUP SEQUENCE COMPLETED ===")
    except Exception as e:
        logger.error(f"Startup error: {e}", exc_info=True)
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown."""
    try:
        # Clear ADK sessions
        session_count = chat_service.get_active_session_count()
        if session_count > 0:
            logger.info(f"Shutdown: Clearing {session_count} ADK sessions...")
            chat_service.clear_all_sessions()
            logger.info("Shutdown: ADK sessions cleared")
            
        # Clean up Socket.IO connections
        logger.info("Shutdown: Cleaning up Socket.IO connections...")
        try:
            # Get active connection count from metrics
            socket_metrics = socket_service.get_socket_metrics()
            active_count = socket_metrics.get("active_connections", 0)
            logger.info(f"Shutdown: Closing {active_count} Socket.IO connections...")
            # Socket.IO will handle disconnections automatically
        except Exception as e:
            logger.error(f"Error cleaning up Socket.IO connections: {e}")
        
        logger.info("Cleanup completed during shutdown")
    except Exception as e:
        logger.error(f"Error during shutdown cleanup: {e}", exc_info=True)

# API Routes
app.include_router(
    api.router,
    prefix="/api/v1",
    tags=["api"]
)

# Agent Management Routes
app.include_router(
    agents.router,
    prefix="/api/v1/agents",
    tags=["agents"]
)

# A2A Protocol Routes
app.include_router(
    a2a.router,
    prefix="/api/v1",
    tags=["a2a"]
)

# Context Routes
app.include_router(
    context.router,
    tags=["context"]
)

# Mount Socket.IO app - Socket.IO handles its own CORS to avoid duplicate headers
socketio_app = socket_service.initialize()
app.mount('/socket.io', socketio_app)
logger.info("Socket.IO server mounted at /socket.io - CORS handled by Socket.IO itself")

# Health Check
@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint with system status information."""
    # Get basic agent health information
    agent_statuses = {}
    try:
        health_statuses = agent_health_service.check_all_agents_health()
        hung_count = len([a for a in health_statuses if a.get("is_hung", False)])
        error_count = len([a for a in health_statuses if a.get("status") == "error"])
        
        # Create status summary
        for agent in health_statuses:
            agent_id = agent.get("id")
            agent_statuses[agent_id] = {
                "status": agent.get("status", "unknown"),
                "is_hung": agent.get("is_hung", False),
                "last_activity_minutes_ago": agent.get("minutes_since_activity")
            }
    except Exception as e:
        logger.error(f"Error getting agent health data for health check: {e}")
        hung_count = -1
        error_count = -1
    
    # Get Socket.IO metrics
    socket_io_metrics = socket_service.get_socket_metrics()
    
    # Create a JSON-serializable response
    return {
        "status": "healthy",
        "version": "0.1.0",
        "timestamp": datetime.utcnow().isoformat(),
        "run_id": os.environ.get("TKR_RUN_ID", ""),
        "logging": {
            "log_level": os.environ.get("LOG_LEVEL", "debug"),
            "log_dir": os.environ.get("TKR_LOG_DIR", "logs"),
            "run_log_dir": os.path.join(os.environ.get("TKR_LOG_DIR", "logs"), os.environ.get("TKR_RUN_ID", ""))
        },
        "agents": {
            "count": len(chat_service.agent_instances),
            "names": list(chat_service.agent_instances.keys()),
            "hung_count": hung_count,
            "error_count": error_count,
            "statuses": agent_statuses
        },
        "features": ["a2a", "socket.io", "agents", "agent_health_monitoring"],
        "active_adk_sessions": len(chat_service.active_adk_sessions),
        "socket_io": socket_io_metrics,
        "database": get_database_info()
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
