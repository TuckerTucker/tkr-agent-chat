"""
Phil Connors Agent Entry Point for ADK Runner Integration

- Loads agent-specific .env file (e.g., .env.phil_connors)
- Instantiates PhilConnorsAgent
- Provides registration interface for ADK runner/session
"""
import os
from dotenv import load_dotenv # Import dotenv
from .agent import PhilConnorsAgent # Import renamed class

# Load agent-specific .env file (e.g., .env.phil_connors)
# This file should contain ONLY agent-specific keys like OPENWEATHER_API_KEY
agent_env_filename = ".env.phil_connors" 
agent_dotenv_path = os.path.join(os.path.dirname(__file__), '..', agent_env_filename) 
if os.path.exists(agent_dotenv_path):
    print(f"Loading agent-specific environment variables from: {agent_dotenv_path}")
    # Use override=False so global env vars (like GOOGLE_API_KEY loaded by main.py) take precedence
    load_dotenv(dotenv_path=agent_dotenv_path, override=False) 
else:
    print(f"Info: Agent-specific .env file ({agent_env_filename}) not found at {agent_dotenv_path}.")

def get_agent():
    """
    Factory function for ADK runner to obtain the agent instance.
    Ensures agent-specific environment variables are loaded first.

    Usage (ADK runner):
        from agents.phil_connors.src.index import get_agent
        agent = get_agent()
        # Register agent with runner/session system as needed
    """
    # Agent initialization happens here, it will now have access to env vars loaded above
    return PhilConnorsAgent() # Return instance of renamed class

# Example usage for manual testing
if __name__ == "__main__":
    # This block will also benefit from the load_dotenv above
    agent = get_agent()
    print(f"Phil Connors agent loaded: {agent.name} (tools: {agent.list_tools()})")
