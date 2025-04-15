import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, ErrorMessage, withErrorBoundary } from '../error-boundary';

// Mock console.error to prevent React error logs in test output
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalError;
});

describe('ErrorMessage', () => {
  test('renders basic error message', () => {
    render(
      <ErrorMessage 
        title="Test Error" 
        message="This is a test error message" 
      />
    );
    
    expect(screen.getByText('Test Error')).toBeInTheDocument();
    expect(screen.getByText('This is a test error message')).toBeInTheDocument();
  });
  
  test('renders with retry button', () => {
    const handleRetry = jest.fn();
    
    render(
      <ErrorMessage 
        title="Retry Error" 
        message="Error with retry" 
        onRetry={handleRetry}
      />
    );
    
    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
  
  test('renders with error details', () => {
    const details = {
      code: 'TEST_ERROR',
      context: {
        operation: 'test',
        timestamp: '2025-03-24T03:00:00Z'
      }
    };
    
    render(
      <ErrorMessage 
        title="Error with Details" 
        message="Error with additional details" 
        details={details}
      />
    );
    
    // Details are initially hidden
    const detailsToggle = screen.getByText('Show details');
    expect(detailsToggle).toBeInTheDocument();
    
    // Click to show details
    fireEvent.click(detailsToggle);
    
    // Detail content should be visible
    expect(screen.getByText(/"code": "TEST_ERROR"/)).toBeInTheDocument();
  });
  
  test('renders different error types with correct styling', () => {
    const { rerender } = render(
      <ErrorMessage 
        type="connection"
        title="Connection Error" 
        message="Network error occurred" 
      />
    );
    
    let errorElement = screen.getByRole('alert');
    expect(errorElement).toHaveClass('border-yellow-300');
    
    rerender(
      <ErrorMessage 
        type="message"
        title="Message Error" 
        message="Failed to send message" 
      />
    );
    
    errorElement = screen.getByRole('alert');
    expect(errorElement).toHaveClass('border-red-300');
    
    rerender(
      <ErrorMessage 
        type="tool"
        title="Tool Error" 
        message="Tool execution failed" 
      />
    );
    
    errorElement = screen.getByRole('alert');
    expect(errorElement).toHaveClass('border-orange-300');
  });

  test('renders dismissible error', () => {
    const handleDismiss = jest.fn();
    
    render(
      <ErrorMessage 
        title="Dismissible Error" 
        message="This error can be dismissed" 
        dismissible={true}
        onDismiss={handleDismiss}
      />
    );
    
    const dismissButton = screen.getByLabelText('Dismiss');
    expect(dismissButton).toBeInTheDocument();
    
    fireEvent.click(dismissButton);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorBoundary', () => {
  // Component that throws an error
  const BuggyComponent = () => {
    throw new Error('Test error');
    return <div>This will not render</div>;
  };
  
  // Component with a button that throws an error when clicked
  const ToggleBuggyComponent = () => {
    const [shouldThrow, setShouldThrow] = React.useState(false);
    
    if (shouldThrow) {
      throw new Error('Error thrown on click');
    }
    
    return (
      <button onClick={() => setShouldThrow(true)}>
        Throw Error
      </button>
    );
  };
  
  test('renders fallback UI when error occurs', () => {
    // Suppress React error boundary warning
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    render(
      <ErrorBoundary>
        <BuggyComponent />
      </ErrorBoundary>
    );
    
    // Default fallback should be rendered
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
    
    // Clean up
    console.error.mockRestore();
  });
  
  test('renders custom fallback component', () => {
    // Suppress React error boundary warning
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    const CustomFallback = ({ error, resetError }) => (
      <div>
        <h2>Custom Error UI</h2>
        <p>{error.message}</p>
        <button onClick={resetError}>Reset</button>
      </div>
    );
    
    render(
      <ErrorBoundary FallbackComponent={CustomFallback}>
        <BuggyComponent />
      </ErrorBoundary>
    );
    
    // Custom fallback should be rendered
    expect(screen.getByText('Custom Error UI')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    
    // Clean up
    console.error.mockRestore();
  });
  
  test('resets error state when button is clicked', () => {
    // Suppress React error boundary warning
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    const onReset = jest.fn();
    
    const { getByText } = render(
      <ErrorBoundary
        resetButtonText="Reset Application"
        onReset={onReset}
      >
        <BuggyComponent />
      </ErrorBoundary>
    );
    
    // Click reset button
    fireEvent.click(getByText('Reset Application'));
    
    // onReset should be called
    expect(onReset).toHaveBeenCalledTimes(1);
    
    // Clean up
    console.error.mockRestore();
  });
});

describe('withErrorBoundary', () => {
  const TestComponent = () => <div>Test Component</div>;
  const BuggyComponent = () => {
    throw new Error('Error in HOC wrapped component');
    return <div>This will not render</div>;
  };
  
  test('wraps component with error boundary', () => {
    const WrappedComponent = withErrorBoundary(TestComponent);
    
    // Should have proper display name
    expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)');
    
    // Render wrapped component
    const { getByText } = render(<WrappedComponent />);
    
    // Original component should render
    expect(getByText('Test Component')).toBeInTheDocument();
  });
  
  test('renders fallback when wrapped component errors', () => {
    // Suppress React error boundary warning 
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    const ErrorFallback = () => <div>Custom Fallback</div>;
    const WrappedBuggyComponent = withErrorBoundary(BuggyComponent, {
      fallback: <ErrorFallback />
    });
    
    // Render wrapped component that throws
    const { getByText } = render(<WrappedBuggyComponent />);
    
    // Fallback should be rendered
    expect(getByText('Custom Fallback')).toBeInTheDocument();
    
    // Clean up
    console.error.mockRestore();
  });
});