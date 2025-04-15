import React, { useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Component for displaying various types of error messages with retry capability
 * 
 * @param {Object} props - Component props
 * @param {string} props.type - Error type: 'connection', 'message', 'tool', 'system'
 * @param {string} props.title - Error title
 * @param {string} props.message - Error message text
 * @param {Function} props.onRetry - Function to call when retry is clicked
 * @param {boolean} props.isRetrying - Whether a retry is in progress
 * @param {Object} props.details - Additional error details to display
 * @param {boolean} props.dismissible - Whether the error can be dismissed
 * @param {Function} props.onDismiss - Function to call when dismiss is clicked
 * @returns {JSX.Element} Error message component
 */
export function ErrorMessage({
  type = 'message',
  title,
  message,
  onRetry,
  isRetrying = false,
  details,
  dismissible = false,
  onDismiss,
  className,
  ...props
}) {
  const [showDetails, setShowDetails] = useState(false);
  
  // Define titles for common error types
  const defaultTitles = {
    connection: 'Connection Error',
    message: 'Message Failed',
    tool: 'Tool Execution Failed',
    system: 'System Error'
  };
  
  // Use provided title or default based on type
  const errorTitle = title || defaultTitles[type] || 'Error';
  
  // Define icons for different error types
  const icon = {
    connection: <ConnectionIcon className="h-5 w-5" />,
    message: <MessageIcon className="h-5 w-5" />,
    tool: <ToolIcon className="h-5 w-5" />,
    system: <AlertIcon className="h-5 w-5" />
  }[type] || <AlertIcon className="h-5 w-5" />;
  
  // Get appropriate styles based on type
  const styles = {
    connection: 'border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20',
    message: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
    tool: 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20',
    system: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
  }[type] || 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20';
  
  // Get appropriate text color based on type
  const textColor = {
    connection: 'text-yellow-800 dark:text-yellow-400',
    message: 'text-red-800 dark:text-red-400',
    tool: 'text-orange-800 dark:text-orange-400',
    system: 'text-red-800 dark:text-red-400'
  }[type] || 'text-red-800 dark:text-red-400';
  
  // Get appropriate button styles based on type
  const buttonStyles = {
    connection: 'bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-800/50 text-yellow-800 dark:text-yellow-300',
    message: 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/50 text-red-800 dark:text-red-300',
    tool: 'bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-800/50 text-orange-800 dark:text-orange-300',
    system: 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/50 text-red-800 dark:text-red-300'
  }[type] || 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/50 text-red-800 dark:text-red-300';
  
  // Format details if they exist
  const formattedDetails = details 
    ? (typeof details === 'string' 
      ? details 
      : JSON.stringify(details, null, 2))
    : null;
  
  return (
    <div 
      className={cn(`p-3 border rounded-md ${styles} my-2 max-w-full overflow-hidden`, className)}
      role="alert"
      aria-live="assertive"
      {...props}
    >
      <div className="flex items-center justify-between">
        {/* Title section with icon */}
        <div className="flex items-center">
          <span className={`mr-2 flex-shrink-0 ${textColor}`}>
            {icon}
          </span>
          <h3 className={`font-medium ${textColor}`}>{errorTitle}</h3>
        </div>
        
        {/* Dismiss button if dismissible */}
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex items-center justify-center h-8 w-8 transition-colors hover:bg-red-200 dark:hover:bg-red-800/40"
            aria-label="Dismiss"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
              <path 
                stroke="currentColor" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="2" 
                d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" 
              />
            </svg>
          </button>
        )}
      </div>
      
      {/* Error message text */}
      <div className={`text-sm mt-1 ${textColor.replace('800', '700').replace('400', '300')}`}>
        {message}
      </div>
      
      {/* Show details if they exist */}
      {formattedDetails && (
        <details 
          className="mt-2 text-xs"
          open={showDetails}
          onToggle={(e) => setShowDetails(e.target.open)}
        >
          <summary className={`${textColor} cursor-pointer mb-1`}>
            {showDetails ? 'Hide details' : 'Show details'}
          </summary>
          <pre className={`p-2 ${styles.replace('50', '100').replace('900/20', '900/40')} rounded overflow-auto whitespace-pre-wrap text-xs`}>
            {formattedDetails}
          </pre>
        </details>
      )}
      
      {/* Action buttons */}
      <div className="mt-2 flex gap-2">
        {onRetry && (
          <button
            disabled={isRetrying}
            onClick={onRetry}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center ${buttonStyles} ${
              isRetrying ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isRetrying && (
              <svg 
                className="animate-spin -ml-1 mr-2 h-4 w-4" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                ></circle>
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isRetrying ? 'Retrying...' : 'Try Again'}
          </button>
        )}
      </div>
    </div>
  );
}

// Icon components
function AlertIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function ConnectionIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
      />
    </svg>
  );
}

function MessageIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
      />
    </svg>
  );
}

function ToolIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}