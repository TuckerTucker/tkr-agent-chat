# ADK API Reference

This section contains detailed API documentation for each module in the Google Agent Development Kit (ADK). Each module is documented in its own file for easier navigation and maintenance.

## Available Modules

### [Agents](agents.md)
Core agent implementations and base classes. This module provides the fundamental building blocks for creating AI agents, including:
- Base agent classes
- Agent configuration
- Agent lifecycle management
- Agent callbacks and event handling

### [Artifacts](artifacts.md)
Components for handling data and outputs generated during agent execution:
- Output formats and types
- Data persistence
- Result handling
- File management

### [Code Executors](code_executors.md)
Components for executing code snippets and managing runtime environments:
- Code execution contexts
- Language runtime management
- Security sandboxing
- Output capture and formatting

### [Evaluation](evaluation.md)
Tools and frameworks for evaluating agent performance:
- Metrics collection
- Performance analysis
- Testing frameworks
- Benchmarking tools

### [Events](events.md)
Event handling mechanisms for agent lifecycle and communication:
- Event types and definitions
- Event handlers
- Event routing
- Subscription management

### [Examples](examples.md)
Sample implementations and usage demonstrations:
- Basic agent examples
- Advanced use cases
- Integration patterns
- Best practices

### [Memory](memory.md)
Components for managing agent memory and state:
- State management
- Persistence options
- Memory types
- Cache management

### [Models](models.md)
Integration with underlying language models:
- Model configuration
- Prompt management
- Response handling
- Model selection

### [Planners](planners.md)
Components responsible for task planning and decomposition:
- Task planning strategies
- Goal decomposition
- Action sequencing
- Plan optimization

### [Runners](runners.md)
Execution environments and orchestration for agents:
- Runtime environments
- Agent orchestration
- Resource management
- Execution monitoring

### [Sessions](sessions.md)
Managing interactions and conversations:
- Session management
- Context handling
- Conversation state
- History tracking

### [Tools](tools.md)
Integration with external tools and APIs:
- Tool registration
- API integration
- Tool execution
- Result handling

## Module Documentation Format

Each module's documentation follows a consistent format:

1. **Overview**: Brief description of the module's purpose and main features
2. **Classes**: Detailed documentation of each class in the module
3. **Functions**: Documentation of standalone functions
4. **Examples**: Code examples showing common usage patterns
5. **Best Practices**: Recommendations for using the module effectively
6. **Related Modules**: Links to related modules and functionality

## Version Information

This documentation corresponds to ADK version 1.0.0. For other versions, please refer to the [version history](https://github.com/google/adk/releases) in the ADK repository.

## See Also

- [ADK Overview](../adk_overview.md)
- [Quickstart Guide](../adk_quickstart.md)
- [ADK and A2A Relationship](../adk_a2a_relationship.md)
