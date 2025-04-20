# Agents Module

The `google.adk.agents` module provides the core agent implementations and base classes for the Agent Development Kit (ADK).

## Overview

This module contains the fundamental building blocks for creating AI agents, including base agent classes, agent configuration, lifecycle management, and event handling capabilities.

## Classes

### Agent
An alias of `LlmAgent`, representing the standard agent implementation.

### BaseAgent
Base class for all agents in Agent Development Kit.

#### Required Fields
- `name` (str): The agent's name. Must be a Python identifier and unique within the agent tree. Cannot be "user" (reserved).

#### Optional Fields
- `description` (str): Description of the agent's capability
- `parent_agent` (BaseAgent): The parent agent of this agent
- `sub_agents` (list[BaseAgent]): The sub-agents of this agent
- `before_agent_callback` (Callable): Callback invoked before agent run
- `after_agent_callback` (Callable): Callback invoked after agent run

#### Methods
- `find_agent(name)`: Finds an agent with the given name in this agent and its descendants
- `find_sub_agent(name)`: Finds an agent with the given name in this agent's descendants
- `run_async(parent_context)`: Entry method for text-based conversation
- `run_live(parent_context)`: Entry method for video/audio-based conversation

### LlmAgent
LLM-based Agent implementation with advanced configuration options.

#### Additional Fields
- `model` (Union[str, BaseLlm]): The model to use
- `instruction` (str): Instructions guiding the agent's behavior
- `global_instruction` (str): Instructions for all agents in the tree
- `tools` (list): Available tools for the agent
- `code_executor` (BaseCodeExecutor): Code execution capability
- `planner` (BasePlanner): Planning and execution strategy
- `generate_content_config` (GenerateContentConfig): Content generation settings
- `input_schema` (BaseModel): Input validation schema
- `output_schema` (BaseModel): Output validation schema
- `output_key` (str): Key for storing output in session state

### LoopAgent
A shell agent that runs its sub-agents in a loop until escalation or max iterations.

#### Additional Fields
- `max_iterations` (Optional[int]): Maximum number of loop iterations

### ParallelAgent
A shell agent that runs sub-agents in parallel for multiple perspectives or attempts.

### SequentialAgent
A shell agent that runs sub-agents in sequence.

## Usage Examples

```python
from google.adk.agents import Agent, BaseAgent

# Create a basic agent
agent = Agent(
    name="search_agent",
    model="gemini-2.0-flash-exp",
    description="Agent to perform web searches",
    instruction="You are a search expert."
)

# Create a sequential workflow
workflow = SequentialAgent(
    name="workflow",
    sub_agents=[
        Agent(name="research"),
        Agent(name="analyze"),
        Agent(name="summarize")
    ]
)
```

## Best Practices

1. **Agent Naming**
   - Use unique, descriptive names
   - Follow Python identifier rules
   - Avoid reserved names like "user"

2. **Agent Hierarchy**
   - Structure agents logically
   - Use appropriate agent types (Sequential, Parallel, Loop)
   - Consider parent-child relationships

3. **Configuration**
   - Set clear instructions
   - Configure appropriate tools
   - Use schemas for input/output validation

4. **Callbacks**
   - Implement callbacks for custom behavior
   - Handle errors appropriately
   - Maintain agent state when needed

## Related Modules
- [Models](models.md): Language model integration
- [Tools](tools.md): Tool integration
- [Runners](runners.md): Agent execution
- [Sessions](sessions.md): Conversation management
