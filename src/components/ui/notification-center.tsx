import { useState, createContext, useContext, ReactNode } from 'react';
import { SystemNotification } from './system-notification';

// Define notification type
export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  duration?: number;
}

// Context for notifications
interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
  maxNotifications?: number;
}

export function NotificationProvider({ 
  children, 
  maxNotifications = 5 
}: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Add a new notification
  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = crypto.randomUUID();
    setNotifications(prev => {
      // Add new notification at the beginning, limit to max number
      const newNotifications = [
        { ...notification, id },
        ...prev,
      ].slice(0, maxNotifications);
      
      return newNotifications;
    });
    return id;
  };

  // Remove notification by ID
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  // Clear all notifications
  const clearNotifications = () => {
    setNotifications([]);
  };

  const value = {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationCenter />
    </NotificationContext.Provider>
  );
}

function NotificationCenter() {
  const { notifications, removeNotification } = useNotifications();

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex flex-col space-y-2 max-w-md">
      {notifications.map((notification) => (
        <SystemNotification
          key={notification.id}
          type={notification.type}
          message={notification.message}
          duration={notification.duration}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}