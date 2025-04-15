# Agent configuration for Chloe

AGENT_CONFIG = {
    "id": "chloe",
    "name": "Chloe",
    "description": "Chloe is a helpful AI agent for the TKR Multi-Agent Chat system, capable of echoing messages and scraping web content.",
    "color": "rgb(34 197 94)",  # Green
    "avatar": "/assets/agents/chloe.png",  # Public path to avatar image
    "version": "0.1.0", # Keep basic version
    "capabilities": ["web_scraper"], # Removed echo
    # Removed A2A specific fields: provider, documentationUrl, a2a_capabilities, authentication, defaultInputModes, defaultOutputModes, skills
}
