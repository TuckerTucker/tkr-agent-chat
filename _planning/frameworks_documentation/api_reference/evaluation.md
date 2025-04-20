# Evaluation Module

The `google.adk.evaluation` module provides tools and frameworks for evaluating agent performance.

## Overview

This module contains components for testing and evaluating agents, primarily focused on automated testing and performance assessment. It helps developers validate agent behavior and measure performance across different scenarios.

## Classes

### AgentEvaluator
A utility class for evaluating agents, primarily designed for test case execution.

#### Static Methods

##### evaluate
```python
@staticmethod
def evaluate(
    agent_module: str,
    eval_dataset_file_path_or_dir: str,
    num_runs: int = 2,
    agent_name: str = None,
    initial_session_file: str = None
) -> None
```

Evaluates an agent using provided evaluation data.

**Parameters:**
- `agent_module`: Path to Python module containing the agent definition
  - Module must contain a 'root_agent' definition
- `eval_dataset_file_path_or_dir`: Path to evaluation dataset
  - Can be a single file or directory
  - Directory will be recursively searched for `.test.json` files
- `num_runs`: Number of evaluation runs (default: 2)
- `agent_name`: Name of the agent to evaluate
- `initial_session_file`: File containing initial session state for evaluations

##### find_config_for_test_file
```python
@staticmethod
def find_config_for_test_file(test_file: str) -> str
```

Locates the `test_config.json` file in the same directory as the test file.

**Parameters:**
- `test_file`: Path to the test file

## Usage Examples

```python
from google.adk.evaluation import AgentEvaluator

# Evaluate an agent using a single test file
AgentEvaluator.evaluate(
    agent_module="my_agent.py",
    eval_dataset_file_path_or_dir="tests/test_cases.test.json",
    num_runs=3
)

# Evaluate an agent using a directory of test files
AgentEvaluator.evaluate(
    agent_module="my_agent.py",
    eval_dataset_file_path_or_dir="tests/",
    agent_name="my_test_agent",
    initial_session_file="tests/initial_state.json"
)
```

## Test File Format

Test files should use the `.test.json` extension and follow this structure:

```json
{
  "test_cases": [
    {
      "name": "Test Case 1",
      "input": "User input to test",
      "expected_output": "Expected agent response",
      "metadata": {
        "category": "general",
        "difficulty": "easy"
      }
    }
  ]
}
```

## Best Practices

1. **Test Organization**
   - Use descriptive test case names
   - Organize tests by functionality
   - Include edge cases and error scenarios

2. **Test Data Management**
   - Keep test data separate from test logic
   - Version control test datasets
   - Document test data format

3. **Evaluation Strategy**
   - Run multiple evaluation passes
   - Test with different initial states
   - Include performance metrics

4. **Results Analysis**
   - Track success rates across runs
   - Monitor performance trends
   - Document failures for debugging

## Related Modules
- [Agents](agents.md): Agent implementation
- [Sessions](sessions.md): Session management
- [Events](events.md): Event handling
