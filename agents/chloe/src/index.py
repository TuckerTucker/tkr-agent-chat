"""
Chloe Agent Entry Point for ADK Runner Integration

- Instantiates ChloeAgent
- Provides registration interface for ADK runner/session
"""
# Removed os and dotenv imports as Chloe has no specific env vars currently
from .agent import ChloeAgent

# No agent-specific .env loading needed for Chloe at this time

def get_agent():
    """
    Factory function for ADK runner to obtain the agent instance.
    Ensures agent-specific environment variables are loaded first.

    Usage (ADK runner):
        from agents.chloe.src.index import get_agent
        agent = get_agent()
        # Register agent with runner/session system as needed
    """
    # Agent initialization happens here, it will now have access to env vars loaded above
    return ChloeAgent()

# Example usage for manual testing
if __name__ == "__main__":
    # This block will also benefit from the load_dotenv above
    agent = get_agent()
    print(f"Chloe agent loaded: {agent.name} (tools: {agent.list_tools()})")
