import { Component, type ReactNode } from 'react';
import type { ErrorBoundaryProps, ErrorBoundaryState, ErrorMessageProps } from './error-boundary.d';

/**
 * Error Boundary component for catching and displaying errors in React components
 * Prevents the entire app from crashing when a child component throws an error
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error: Error): { hasError: true; error: Error } {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  resetError = (): void => {
    this.setState({ 
      hasError: false,
      error: null,
      errorInfo: null
    });
    
    if (this.props.onReset) {
      this.props.onReset();
    }
  }

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { 
      children, 
      fallback,
      FallbackComponent,
      resetButtonText = 'Try Again'
    } = this.props;

    if (hasError) {
      if (FallbackComponent) {
        return <FallbackComponent 
          error={error} 
          errorInfo={errorInfo} 
          resetError={this.resetError}
        />;
      }
      
      if (fallback) {
        return fallback;
      }

      return (
        <div className="p-4 border-red-300 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 my-4 max-w-full overflow-hidden">
          <div className="flex items-center mb-2">
            <svg 
              className="h-5 w-5 text-red-500 mr-2" 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor" 
              aria-hidden="true"
            >
              <path 
                fillRule="evenodd" 
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" 
                clipRule="evenodd" 
              />
            </svg>
            <h3 className="text-red-800 dark:text-red-400 font-medium">Something went wrong</h3>
          </div>
          <div className="text-sm text-red-700 dark:text-red-300 mb-3">
            {error && error.message ? error.message : 'An unexpected error occurred'}
          </div>
          
          {process.env.NODE_ENV !== 'production' && errorInfo && (
            <details className="mt-2 text-xs">
              <summary className="text-red-600 dark:text-red-400 cursor-pointer mb-1">
                Show error details
              </summary>
              <pre className="p-2 bg-red-100 dark:bg-red-900/40 rounded overflow-auto whitespace-pre-wrap">
                {errorInfo.componentStack}
              </pre>
            </details>
          )}
          
          <div className="mt-4">
            <button
              onClick={this.resetError}
              className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/50 text-red-800 dark:text-red-300 rounded-md transition-colors"
            >
              {resetButtonText}
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * A specialized error state component for displaying error messages
 * within the UI flow (not related to component errors)
 */
export function ErrorMessage({ 
  title = 'Error', 
  message, 
  onRetry,
  retryButtonText = 'Try Again',
  details,
  className,
  ...props
}: ErrorMessageProps): React.ReactElement {
  return (
    <div 
      className={`p-4 border-red-300 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 my-2 max-w-full overflow-hidden ${className}`}
      role="alert"
      aria-live="assertive"
      {...props}
    >
      <div className="flex items-center mb-2">
        <svg 
          className="h-5 w-5 text-red-500 mr-2" 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 20 20" 
          fill="currentColor" 
          aria-hidden="true"
        >
          <path 
            fillRule="evenodd" 
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" 
            clipRule="evenodd" 
          />
        </svg>
        <h3 className="text-red-800 dark:text-red-400 font-medium">{title}</h3>
      </div>
      <div className="text-sm text-red-700 dark:text-red-300 mb-2">
        {message}
      </div>
      
      {details && (
        <details className="mt-1 text-xs mb-2">
          <summary className="text-red-600 dark:text-red-400 cursor-pointer mb-1">
            Show details
          </summary>
          <pre className="p-2 bg-red-100 dark:bg-red-900/40 rounded overflow-auto whitespace-pre-wrap">
            {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
          </pre>
        </details>
      )}
      
      {onRetry && (
        <div className="mt-2">
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/50 text-red-800 dark:text-red-300 rounded-md transition-colors"
          >
            {retryButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Create an error boundary component with specific settings
 * This is a higher-order component (HOC) that wraps a component with an ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<ErrorBoundaryProps, 'children'> = {}
): React.ComponentType<P> {
  const WrappedComponent = (props: P): React.ReactElement => (
    <ErrorBoundary {...options}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  const displayName = Component.displayName || Component.name || 'Component';
  WrappedComponent.displayName = `withErrorBoundary(${displayName})`;
  
  return WrappedComponent;
}
