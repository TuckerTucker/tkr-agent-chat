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
print("DEBUG: Starting ADK import attempts...")
try:
    print("DEBUG: Attempting to import Agent directly from google.adk...")
    from google.adk import Agent as ADKAgentBase # Try importing directly from google.adk
    print("DEBUG: Successfully imported Agent from google.adk")
    ADK_AGENT_AVAILABLE = True
except ImportError as e1:
    print(f"DEBUG: Failed to import from google.adk directly: {str(e1)}")
    try:
        print("DEBUG: Attempting to import Agent from google.adk.agents...")
        from google.adk.agents import Agent as ADKAgentBase # Try the submodule if direct import fails
        print("DEBUG: Successfully imported Agent from google.adk.agents")
        ADK_AGENT_AVAILABLE = True
    except ImportError as e2:
        print(f"DEBUG: Failed to import from google.adk.agents: {str(e2)}")
        print("DEBUG: google.adk Agent class not found. Using dummy base class.")
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
        agent_id = config["id"]  # Use ID for ADK agent name (valid identifier)
        agent_display_name = config["name"]  # Keep display name separately
        model_name = config.get("model", "gemini-2.0-flash-exp") # Default model from quickstart
        agent_description = config["description"]
        
        # Add context awareness to system prompt
        context_prompt = """
        You have access to shared context from other agents in the conversation.
        This context will be included at the start of user messages in this format:
        
        CONTEXT FROM OTHER PARTICIPANTS:
        From [agent]: [message]
        ...
        
        User message: [actual user message]

        When you see context in a message:
        1. Read and understand the context before the user message
        2. Build upon what other agents have said
        3. Avoid repeating information already shared
        4. Provide consistent and complementary responses
        5. Focus primarily on the user message while considering the context
        """
        agent_instruction = f"{system_prompt}\n\n{context_prompt}"
        
        # Map our tool registry to the format ADK expects
        adk_tools = list(tool_registry.values()) if tool_registry else []

        # Call the parent ADKAgentBase initializer
        super().__init__(
            name=agent_id,
            model=model_name,
            description=agent_description,
            instruction=agent_instruction,
            tools=adk_tools
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
        self.avatar = config.get("avatar")  # Add avatar attribute if present in config

    # Keep our helper methods if still needed, otherwise remove/adapt
    def get_system_prompt(self, **template_vars) -> str:
        # Get shared context from the context service
        shared_context = []
        try:
            from api_gateway.src.services.context_service import context_service
            shared_context = context_service.get_shared_context(
                target_agent_id=self.id,
                session_id=template_vars.get("session_id")
            )
        except Exception as e:
            logging.warning(f"Failed to get shared context: {e}")

        # Add context to template vars
        if shared_context:
            template_vars["shared_context"] = "\n".join([
                f"Context from {ctx['source_agent_id']}: {ctx['content']['content']}"
                for ctx in shared_context
            ])
        else:
            template_vars["shared_context"] = "No shared context available."

        # Simple template substitution for system prompt
        prompt = self.system_prompt
        for k, v in template_vars.items():
            prompt = prompt.replace("{{" + k + "}}", str(v))
        return prompt

    def get_tool(self, name):
        return self.tools.get(name)

    def list_tools(self):
        return list(self.tools.keys())

    # Removed get_agent_card method as it's part of the A2A protocol
