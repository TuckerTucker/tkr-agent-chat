import React from 'react';
import { createRoot } from 'react-dom/client';

import ChatInterface from '@/chat-interface';
import '@/app/globals.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(<ChatInterface />);