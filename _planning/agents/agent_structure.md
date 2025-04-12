# ADK Agent Structure and Implementation Guide

This document provides a comprehensive guide for designing, implementing, and integrating agents using the Agent Development Kit (ADK) in the TKR Agents platform.

---

## 1. What is an ADK Agent?

An ADK agent is a modular, extensible Python class that encapsulates conversational logic, tool usage, and integration with the ADK runner/session system. Agents can be LLM-based, rule-based, or hybrid, and are designed to be self-contained, testable, and easily integrated into a multi-agent network.

---

## 2. Recommended Directory Structure

Each agent should reside in its own directory, following this convention:

```
agent_name/
├── README.md                # Agent documentation and usage
├── pyproject.toml           # Python package metadata (or setup.py)
├── src/
│   ├── agent.py             # Core agent logic (inherits from ADK BaseAgent/LlmAgent)
│   ├── config.py            # Agent config: id, name, description, color, capabilities, etc.
│   ├── index.py             # Entry point/factory for agent instantiation
│   ├── prompt.py            # Modular prompt templates and logic
│   ├── tools/
│   │   ├── __init__.py
│   │   └── ...              # Individual tool implementations (Python modules/classes)
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_agent.py    # Unit tests for agent and tools
│   └── assets/              # Static assets (optional, e.g., icons, data)
```

---

## 3. Agent Configuration and Metadata

Each agent should provide a `config.py` file with a dictionary or dataclass specifying:

- `id`: Unique agent identifier (string)
- `name`: Display name (string)
- `description`: Short description of the agent (string)
- `color`: UI theming color (hex or CSS string)
- `capabilities`: List of supported features/tools (list of strings)
- (Optional) `icon_path`, `version`, etc.

Example (`src/config.py`):
```python
AGENT_CONFIG = {
    "id": "chloe",
    "name": "Chloe",
    "description": "Friendly assistant agent",
    "color": "#22C55E",
    "capabilities": ["chat", "web_search", "calculator"]
}
```

---

## 4. Core Agent Logic

The main agent implementation should inherit from the appropriate ADK base class (e.g., `BaseAgent`, `LlmAgent`) and implement required methods for message handling, tool invocation, and event processing.

Example (`src/agent.py`):
```python
from google.adk.agents import LlmAgent
from .config import AGENT_CONFIG
from .prompt import get_prompt
from .tools import get_tools

class ChloeAgent(LlmAgent):
    def __init__(self):
        super().__init__(
            name=AGENT_CONFIG["id"],
            description=AGENT_CONFIG["description"],
            instruction=get_prompt(),
            tools=get_tools(),
            # Add other ADK fields as needed
        )
```

---

## 5. Entry Point / Factory

Provide an `index.py` with a factory function to instantiate and configure the agent, wiring up dependencies as needed.

Example (`src/index.py`):
```python
from .agent import ChloeAgent

def create_agent():
    return ChloeAgent()
```

---

## 6. Prompt Logic

Prompts and instructions should be modular and file-based. Use `prompt.py` to define templates or logic for generating agent instructions.

Example (`src/prompt.py`):
```python
def get_prompt():
    return "You are Chloe, a helpful assistant. Respond conversationally and helpfully."
```

---

## 7. Tool Integration

Each agent should have a `tools/` directory with individual tool implementations. Tools are registered with the agent via the `tools` property.

Example (`src/tools/__init__.py`):
```python
from .calculator import CalculatorTool
from .web_search import WebSearchTool

def get_tools():
    return [CalculatorTool(), WebSearchTool()]
```

---

## 8. Testing and Assets

- Place unit tests for agent logic and tools in `tests/`.
- Use `assets/` for static files (e.g., icons, data) if needed.

---

## 9. Integration with ADK Runner and UI

- Agents are registered with the ADK runner/session system, which manages message routing, event history, and state.
- The API Gateway or middleware exposes agent metadata and chat endpoints to the React UI.
- Agent responses, tool events, and metadata are surfaced to the UI via REST/WebSocket.

---

## 10. Example Agent Skeleton

A minimal agent directory might look like:

```
chloe/
├── README.md
├── pyproject.toml
└── src/
    ├── agent.py
    ├── config.py
    ├── index.py
    ├── prompt.py
    ├── tools/
    │   ├── __init__.py
    │   └── calculator.py
    ├── tests/
    │   └── test_agent.py
    └── assets/
```

---

## 11. Best Practices

- Keep each agent self-contained and modular.
- Use clear, documented configuration for UI integration.
- Write unit tests for all core logic and tools.
- Document agent capabilities and usage in README.md.
- Prefer composition (tools, prompts) over inheritance for extensibility.

---

## 12. MCP Tool Implementation Recommendations

### MCP Server Architecture

**Option 1: MCP Server Per Agent**
- **Pros:** 
  - Agents are fully self-contained and independently deployable.
  - No risk of tool name collisions between agents.
  - Easier to scale or restart agents individually.
- **Cons:** 
  - More processes to manage.
  - Slightly higher resource usage.
  - More complex service discovery if many agents are running.

**Option 2: Shared MCP Server Per Process/Service**
- **Pros:** 
  - Fewer processes to manage.
  - Easier to coordinate shared resources or cross-agent tools.
  - Simpler for small deployments.
- **Cons:** 
  - Agents are less isolated; tool name collisions possible.
  - Harder to independently update or restart agents.
  - More complex code for dynamic tool registration/unregistration.

**Recommendation:**  
For maximum modularity and alignment with the agent-per-directory philosophy, prefer an MCP server per agent. This keeps agents self-contained and avoids cross-agent interference. For lightweight or tightly-coupled agents, a shared server may be considered.

---

### Tool Interface Design

**Stateless Function**
- **Pros:** Simple, easy to test, no side effects.
- **Cons:** Cannot maintain state between invocations.

**Class (Instantiated Per Call)**
- **Pros:** Can encapsulate logic, easy to extend, supports dependency injection.
- **Cons:** Still stateless unless state is persisted externally.

**Persistent Object (Singleton/Long-Lived)**
- **Pros:** Can maintain state across invocations (e.g., cache, session).
- **Cons:** Harder to test, risk of stale state or concurrency issues.

**Recommendation:**  
Default to stateless functions or lightweight classes for most tools. Use persistent objects only when stateful behavior is required (e.g., caching, session context), and document state management clearly.

---

### Tool Discovery and Registration

- Tools should be auto-registered by scanning the tools/ directory at agent startup.
- Use naming conventions or decorators to mark tool entry points.
- Registration should be explicit in code only for advanced use cases.

---

### Error Handling, Logging, and Testing

**Error Handling**
- Catch and handle all exceptions within tool logic.
- Return structured error responses via MCP protocol (e.g., error code, message).
- Avoid leaking stack traces or sensitive info to the client.

**Logging**
- Log tool invocations, errors, and important events using Python's logging module.
- Use per-agent log files or structured logging for easier debugging.

**Testing**
- Write unit tests for each tool in tools/tests/ or tests/.
- Test both normal and error cases.
- Use mocks for external dependencies.

**Summary Table:**

| Aspect         | Recommendation                                      |
|----------------|-----------------------------------------------------|
| MCP Server     | Prefer per-agent server for modularity              |
| Tool Interface | Stateless function or class; persistent if needed   |
| Discovery      | Auto-register from tools/ directory                 |
| Error Handling | Structured errors, no stack trace leaks             |
| Logging        | Use logging module, per-agent logs                  |
| Testing        | Unit tests for all tools, cover errors and edge cases|

---

## 13. References

- [ADK Overview](adk_overview.md)
- [ADK Main Documentation](agent_development_kit_documentation.md)
