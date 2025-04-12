"""
ChloeAgent: Core agent logic for Chloe

- Loads config, overview, and system prompt
- Integrates tool registry
- Provides interface for prompt and tool access
"""

from .config import AGENT_CONFIG
from .tools import TOOL_REGISTRY
from .prompt import SYSTEM_PROMPT
from agents.base_agent import BaseAgent

class ChloeAgent(BaseAgent):
    def __init__(self):
        overview = (
            "General-purpose assistant with expertise coordinating conversations between agents and users."
        )
        super().__init__(
            config=AGENT_CONFIG,
            tool_registry=TOOL_REGISTRY,
            system_prompt=SYSTEM_PROMPT,
            overview=overview,
        )
