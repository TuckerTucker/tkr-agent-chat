# Planners Module

The `google.adk.planners` module provides components for task planning and decomposition.

## Overview

This module contains planners that allow agents to generate and execute plans for handling queries. It includes both built-in planners that leverage model capabilities and custom planning implementations.

## Classes

### BasePlanner
Abstract base class for all planners.

#### Abstract Methods
- `build_planning_instruction(readonly_context, llm_request)`: Builds system instruction
  - Parameters:
    - `readonly_context`: Readonly invocation context
    - `llm_request`: LLM request (readonly)
  - Returns: Optional[str] planning instruction

- `process_planning_response(callback_context, response_parts)`: Processes LLM response
  - Parameters:
    - `callback_context`: Callback context
    - `response_parts`: LLM response parts (readonly)
  - Returns: Optional[List[Part]] processed response

### BuiltInPlanner
Planner that uses model's built-in thinking features.

#### Constructor Parameters
- `thinking_config`: Configuration for model's thinking features
  - Note: Error if model doesn't support thinking features

#### Methods
- `apply_thinking_config(llm_request)`: Applies thinking config to request
- `build_planning_instruction`: Implements BasePlanner method
- `process_planning_response`: Implements BasePlanner method

### PlanReActPlanner
Plan-Re-Act planner that enforces plan generation before actions/observations.

#### Features
- Does not require built-in thinking features
- Constrains LLM to generate plans first
- Supports action and observation phases

#### Methods
- `build_planning_instruction`: Implements BasePlanner method
- `process_planning_response`: Implements BasePlanner method

## Usage Examples

```python
from google.adk.planners import BuiltInPlanner, PlanReActPlanner
from google.adk.models.types import ThinkingConfig

# Using built-in planner
planner = BuiltInPlanner(
    thinking_config=ThinkingConfig(
        include_thoughts=True
    )
)

# Using Plan-Re-Act planner
planner = PlanReActPlanner()

# Example planning flow
instruction = planner.build_planning_instruction(context, request)
if instruction:
    # Add instruction to request
    request.system_instruction = instruction

# Process response
processed_parts = planner.process_planning_response(
    callback_context,
    response_parts
)
```

## Planning Patterns

### Built-in Thinking
```python
{
    "thinking_config": {
        "include_thoughts": True,
        # Additional model-specific config
    }
}
```

### Plan-Re-Act Pattern
1. Plan Phase: Generate action plan
2. Action Phase: Execute planned actions
3. Observation Phase: Process results
4. Repeat if needed

## Best Practices

1. **Plan Generation**
   - Keep plans focused and specific
   - Break down complex tasks
   - Include success criteria
   - Handle plan failures

2. **Plan Execution**
   - Monitor progress
   - Handle unexpected results
   - Adapt plans as needed
   - Log planning steps

3. **Plan Optimization**
   - Reuse successful patterns
   - Learn from failures
   - Optimize for efficiency
   - Balance detail vs. flexibility

4. **Error Handling**
   - Handle planning failures
   - Provide fallback options
   - Monitor resource usage
   - Implement timeouts

## Related Modules
- [Agents](agents.md): Agent implementation
- [Models](models.md): Model integration
- [Tools](tools.md): Tool integration
