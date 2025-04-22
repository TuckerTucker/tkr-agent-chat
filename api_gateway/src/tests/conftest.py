import os
import sys
from pathlib import Path

# Add the src directory to Python path
src_dir = Path(__file__).parent.parent
sys.path.insert(0, str(src_dir))

# Import models to ensure they are registered with SQLAlchemy
from models.shared_context import SharedContext
from models.agent_cards import AgentCard
from models.chat_sessions import ChatSession
