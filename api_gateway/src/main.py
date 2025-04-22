"""
API Gateway for TKR Multi-Agent Chat System

Provides:
- REST endpoints for agent metadata and system info
- WebSocket endpoint for real-time agent communication
- Message routing between frontend and agents
- Agent status and metadata management
"""

import os
import logging
from typing import Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import agent factories
from agents.chloe.src.index import get_agent as get_chloe_agent
from agents.phil_connors.src.index import get_agent as get_phil_connors_agent # Updated path

# Import routes and services
from .routes import api, ws, agents, a2a, ws_a2a, context
from .services.chat_service import chat_service
from .services.a2a_service import A2AService
from .database import init_db, get_db
# from .services.adk_runner_service import adk_runner_service # Remove ADK runner service import
from dotenv import load_dotenv # Import dotenv

# Load environment variables from .env file in the project root
# This ensures GOOGLE_API_KEY is available when BaseAgent is initialized
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env') # Look in project root
load_dotenv(dotenv_path=dotenv_path) 

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG to see more details
    format='[%(asctime)s] %(levelname)s %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        # logging.FileHandler('api_gateway.log') # Optional: Keep file logging if desired
    ]
)

# Ensure root logger is also set to DEBUG
logging.getLogger().setLevel(logging.DEBUG)
logger = logging.getLogger(__name__)

# Check for necessary environment variables (e.g., Gemini API Key for ADK)
if not os.getenv("GOOGLE_API_KEY"):
     logger.warning("GOOGLE_API_KEY not found in environment variables or .env file. ADK features might fail.")

app = FastAPI(
    title="TKR Multi-Agent Chat API Gateway",
    description="API Gateway for multi-agent chat system",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_agents() -> Dict[str, object]:
    """
    Load all available agents using their factory functions.
    Returns a dictionary mapping agent IDs to agent instances.
    """
    try:
        # Use updated function name and agent ID key
        agents = { 
            "chloe": get_chloe_agent(),
            "phil_connors": get_phil_connors_agent() 
        }
        logger.info(f"Loaded {len(agents)} agents: {list(agents.keys())}")
        return agents
    except Exception as e:
        logger.error(f"Error loading agents: {e}")
        raise

@app.on_event("startup")
async def startup_event():
    """Initialize services and database on startup."""
    try:
        # Initialize Database
        await init_db()
        logger.info("Database initialized.")

        # Load agents into ChatService (ADK runner is now managed within ws.py)
        loaded_agents = load_agents()
        chat_service.set_agents(loaded_agents) # Set agents on the global instance
        logger.info("Chat service initialized with agents.")
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise

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

# WebSocket Routes
app.include_router(
    ws.router,
    prefix="/ws/v1",
    tags=["websocket"]
)

# A2A Protocol Routes
app.include_router(
    a2a.router,
    prefix="/api/v1",
    tags=["a2a"]
)

# A2A WebSocket Routes
app.include_router(
    ws_a2a.router,
    prefix="/ws/v1",
    tags=["a2a", "websocket"]
)

# Context Routes
app.include_router(
    context.router,
    tags=["context"]
)

# Health Check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "agents": list(chat_service.agent_instances.keys()),
        "features": ["a2a", "websocket", "agents"]
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
