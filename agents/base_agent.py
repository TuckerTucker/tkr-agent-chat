"""
BaseAgent: Abstract base class for all agents.

- Loads config, overview, system prompt, and tool registry
- Provides interface for prompt and tool access
- Inherits from google.adk.agents.Agent
- Loads config, tool registry, system prompt
- Provides basic structure for ADK compatibility
"""

import logging
from typing import Dict, Any, List, Optional

# --- ADK Import ---
try:
    from google.adk.agents import Agent as ADKAgentBase # Rename to avoid conflict
    ADK_AGENT_AVAILABLE = True
except ImportError:
    logging.warning("google.adk.agents.Agent not found. Using dummy base class.")
    ADK_AGENT_AVAILABLE = False
    class ADKAgentBase: # Dummy class
         def __init__(self, name: str, model: Optional[str] = None, description: Optional[str] = None, 
                      instruction: Optional[str] = None, tools: Optional[List[Any]] = None, **kwargs):
             self.name = name
             self.model = model
             self.description = description
             self.instruction = instruction
             self.tools = tools or []
             self.sub_agents = [] # Ensure dummy also has sub_agents
             # Add dummy model_config for consistency if needed
             model_config = {} 

class BaseAgent(ADKAgentBase):
    """Our custom base agent, inheriting from ADK's Agent."""
    
    # Allow extra fields beyond what ADKAgentBase defines
    model_config = {"extra": "allow"} 

    def __init__(self, config: Dict[str, Any], tool_registry: Dict[str, Any], system_prompt: str, overview: str):
        
        # Extract required fields for ADKAgentBase.__init__ from config
        agent_name = config["name"]
        model_name = config.get("model", "gemini-2.0-flash-exp") # Default model from quickstart
        agent_description = config["description"]
        agent_instruction = system_prompt # Use system_prompt as instruction
        
        # Map our tool registry to the format ADK expects (list of tool functions/objects)
        # Assuming tool_registry maps name -> function for now
        adk_tools = list(tool_registry.values()) if tool_registry else []

        # Call the parent ADKAgentBase initializer
        super().__init__(
            name=agent_name,
            model=model_name,
            description=agent_description,
            instruction=agent_instruction,
            tools=adk_tools
            # Note: We are not passing sub_agents here, ADKAgentBase handles it
        )
        
        # Store our specific config and other attributes
        self.config = config
        self.id = config["id"] # Keep our internal ID
        self.color = config["color"]
        self.capabilities = config.get("capabilities", [])
        # self.tools is now inherited from ADKAgentBase
        self.system_prompt = system_prompt # Keep for potential direct use
        self.overview = overview
        # self.sub_agents is now inherited from ADKAgentBase

    # Keep our helper methods if still needed, otherwise remove/adapt
    def get_system_prompt(self, **template_vars) -> str:
        # Simple template substitution for system prompt
        prompt = self.system_prompt
        for k, v in template_vars.items():
            prompt = prompt.replace("{{" + k + "}}", v)
        return prompt

    def get_tool(self, name):
        return self.tools.get(name)

    def list_tools(self):
        return list(self.tools.keys())

    # Removed get_agent_card method as it's part of the A2A protocol
