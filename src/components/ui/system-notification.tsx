import { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface SystemNotificationProps {
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  duration?: number; // Duration in milliseconds
  onClose?: () => void;
  className?: string;
}

export function SystemNotification({ 
  type = 'info', 
  message, 
  duration = 5000, 
  onClose,
  className 
}: SystemNotificationProps) {
  const [visible, setVisible] = useState(true);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    // Reset visibility when message changes
    setVisible(true);
    
    // Set a timer to close the notification
    if (duration > 0) {
      const timer = setTimeout(() => {
        setAnimating(true);
        setTimeout(() => {
          setVisible(false);
          setAnimating(false);
          if (onClose) onClose();
        }, 300); // Animation duration
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!visible) {
    return null;
  }

  const getTypeStyles = () => {
    switch (type) {
      case 'info':
        return 'bg-blue-100 dark:bg-blue-950 border-blue-500 text-blue-800 dark:text-blue-300';
      case 'success':
        return 'bg-green-100 dark:bg-green-950 border-green-500 text-green-800 dark:text-green-300';
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-950 border-yellow-500 text-yellow-800 dark:text-yellow-300';
      case 'error':
        return 'bg-red-100 dark:bg-red-950 border-red-500 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-900 border-gray-500 text-gray-800 dark:text-gray-300';
    }
  };

  const getTypeIcon = () => {
    switch (type) {
      case 'info':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        );
      case 'success':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        );
      default:
        return null;
    }
  };

  const handleClose = () => {
    setAnimating(true);
    setTimeout(() => {
      setVisible(false);
      setAnimating(false);
      if (onClose) onClose();
    }, 300); // Animation duration
  };

  return (
    <div
      className={cn(
        'system-notification flex items-center p-3 mb-3 border-l-4 rounded-r-md shadow-md',
        'transition-all duration-300 ease-in-out transform',
        animating ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0',
        getTypeStyles(),
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="mr-2 flex-shrink-0">{getTypeIcon()}</div>
      <div className="flex-grow">{message}</div>
      <button
        className="ml-auto p-1 hover:bg-opacity-20 hover:bg-black rounded-full"
        onClick={handleClose}
        aria-label="Close notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  );
}