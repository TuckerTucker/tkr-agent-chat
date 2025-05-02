# TKR Agent Chat Testing Guide

This document provides an overview of the testing framework and guidelines for the TKR Agent Chat application.

## Testing Architecture

Our testing suite is divided into several categories:

1. **Frontend Unit Tests** - Testing React components and services
2. **Backend Unit Tests** - Testing FastAPI routes and services
3. **Integration Tests** - Testing interactions between components
4. **Load/Performance Tests** - Testing system under load

## Running Tests

### All Tests

To run all tests in the project:

```bash
npm run test:all
```

### Frontend Tests

Frontend tests use Vitest and React Testing Library:

```bash
# Run all frontend tests
npm test

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage

# Visual UI for test results
npm run test:ui
```

### Backend Tests

Backend tests use pytest:

```bash
# Run all backend tests
npm run test:backend

# Run specific test files
cd api_gateway
python -m pytest src/tests/routes/test_ws_routes.py -v
```

### Load Testing

We provide a simple load testing script for WebSocket performance:

```bash
# Run with default settings (20 connections for 30 seconds)
npm run test:load

# Custom configuration
cd api_gateway
python load_test.py --connections=50 --duration=60
```

## Test Organization

### Frontend Tests

- Component tests are located in `src/components/**/**.test.{ts,tsx,js,jsx}`
- Service tests are located in `src/services/__tests__/`
- Hooks tests are located in `src/hooks/__tests__/`

### Backend Tests

- Route tests are located in `api_gateway/src/tests/routes/`
- Service tests are located in `api_gateway/src/tests/services/`

## Mock Structure

### WebSocket Mocking

For frontend tests, we mock the WebSocket API in `src/test/setup.ts`. This provides a consistent way to test WebSocket connections without making actual network requests.

Example usage in tests:

```typescript
// Get the mock WebSocket instance
const mockWebSocket = global.WebSocket.instances[0];

// Simulate receiving a message
mockWebSocket.mockReceiveMessage({
  message: "Hello from the server",
  turn_complete: false
});

// Check what was sent
expect(mockWebSocket.send).toHaveBeenCalledWith(expect.stringContaining("Hello"));
```

### Backend Mocking

For backend tests, we use pytest fixtures defined in `api_gateway/conftest.py` to mock various components:

- `mock_websocket` - Mocks a FastAPI WebSocket connection
- `mock_adk_session_service` - Mocks the ADK session service
- `mock_db` - Mocks the database operations
- `mock_agent` - Creates a mock agent object

## Adding New Tests

### Frontend Component Tests

1. Create a file named `ComponentName.test.tsx` next to the component
2. Use React Testing Library to render and interact with the component
3. Write assertions with vitest's expect

Example:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Backend Route Tests

1. Create a file named `test_route_name.py` in `api_gateway/src/tests/routes/`
2. Use pytest fixtures for mocking dependencies
3. Test both success and error scenarios

Example:

```python
import pytest
from fastapi import HTTPException

async def test_get_agent_endpoint(client, mock_agent):
    # Test success case
    response = client.get(f"/api/v1/agents/{mock_agent.id}")
    assert response.status_code == 200
    assert response.json()["id"] == mock_agent.id
    
    # Test error case
    response = client.get("/api/v1/agents/nonexistent")
    assert response.status_code == 404
```

## Coverage Goals

We aim for the following test coverage:

- Frontend: 80% code coverage
- Backend: 90% code coverage
- Critical WebSocket components: 95% code coverage

## Continuous Integration

Tests are automatically run in the CI pipeline on:
- Pull requests to main branch
- Direct commits to main branch

The pipeline will fail if any tests fail or if coverage drops below the targets.

## Best Practices

1. **Test behavior, not implementation** - Focus on what the code does, not how it does it
2. **Use descriptive test names** - Tests should read like documentation
3. **Isolate tests** - Each test should run independently 
4. **Mock external dependencies** - Don't rely on external services in unit tests
5. **Test edge cases** - Include error scenarios and boundary conditions
6. **Keep tests fast** - Tests should run quickly to enable frequent execution