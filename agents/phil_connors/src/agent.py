"""
ArchitectAgent: Core agent logic for Architect

- Loads config, overview, and system prompt
- Integrates tool registry
- Provides interface for prompt and tool access
"""

from .config import AGENT_CONFIG
from .tools import TOOL_REGISTRY
from .prompt import SYSTEM_PROMPT
from agents.base_agent import BaseAgent

class PhilConnorsAgent(BaseAgent): # Renamed class
    def __init__(self):
        overview = (
            "Phil Connors speacializes in getting the weather."
        )
        super().__init__(
            config=AGENT_CONFIG,
            tool_registry=TOOL_REGISTRY,
            system_prompt=SYSTEM_PROMPT,
            overview=overview,
        )
