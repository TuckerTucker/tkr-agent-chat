import React from 'react';
import styles from './tool-result.module.css';

interface ErrorDetails {
  message: string;
  details?: any;
  stack?: string;
}

interface ToolResultProps {
  toolName: string;
  result?: any;
  error?: {
    message: string;
    details?: any;
  };
}

const ErrorDisplay: React.FC<{ error: ErrorDetails }> = ({ error }) => {
  const hasStack = error.stack || (error.details?.stack);
  const stack = error.stack || error.details?.stack;
  
  return (
    <div className={styles['error-content']}>
      <div className={styles['error-message']}>{error.message}</div>
      {error.details && !hasStack && (
        <pre className={styles['error-details']}>
          {typeof error.details === 'string' 
            ? error.details 
            : JSON.stringify(error.details, null, 2)}
        </pre>
      )}
      {hasStack && (
        <div className={styles['error-stack']}>
          <details>
            <summary>Stack Trace</summary>
            <pre>{stack}</pre>
          </details>
        </div>
      )}
    </div>
  );
};

export const ToolResult: React.FC<ToolResultProps> = ({ toolName, result, error }) => {
  if (error) {
    return (
      <div className={`${styles['tool-result']} ${styles.error}`}>
        <div className={styles['tool-header']}>
          <span className={styles['tool-name']}>{toolName}</span>
          <span className={styles['error-label']}>Error</span>
        </div>
        <ErrorDisplay error={error} />
      </div>
    );
  }

  return (
    <div className={styles['tool-result']}>
      <div className={styles['tool-header']}>
        <span className={styles['tool-name']}>{toolName}</span>
        <span className={styles['success-label']}>Success</span>
      </div>
      <div className={styles['result-content']}>
        {typeof result === 'string' ? (
          <div className={styles['result-text']}>{result}</div>
        ) : (
          <pre className={styles['result-json']}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};

export default ToolResult;
