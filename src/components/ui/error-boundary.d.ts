import { Component, ReactNode } from 'react';

export interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryButtonText?: string;
  details?: string;
  className?: string;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
  resetButtonText?: string;
  FallbackComponent?: React.ComponentType<any>;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export function ErrorMessage(props: ErrorMessageProps): React.ReactElement;
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps);
  static getDerivedStateFromError(error: Error): { hasError: true; error: Error };
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void;
  resetErrorBoundary(): void;
  render(): React.ReactNode;
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ErrorBoundaryProps, 'children'>
): React.ComponentType<P>;
