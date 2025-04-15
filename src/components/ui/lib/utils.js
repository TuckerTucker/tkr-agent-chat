import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge
 * @param {...string} inputs - Class names to combine
 * @returns {string} - Combined and deduped class names
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Convert HSL values to hex color
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hex color string
 */
export function hslToHex(h, s, l) {
  // Normalize saturation and lightness to fractions
  s /= 100;
  l /= 100;
  
  // Calculate RGB values
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  
  let r, g, b;
  if (0 <= h && h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (60 <= h && h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (120 <= h && h < 180) {
    [r, g, b] = [0, c, x];
  } else if (180 <= h && h < 240) {
    [r, g, b] = [0, x, c];
  } else if (240 <= h && h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }
  
  // Convert to hex values
  const toHex = (value) => {
    const hex = Math.round((value + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Parse a color string in HSL format (e.g. "360 100% 50%")
 * @param {string} hslString - HSL color string (e.g. "360 100% 50%")
 * @returns {Object} Object with h, s, l properties
 */
export function parseHslString(hslString) {
  if (!hslString) return { h: 0, s: 0, l: 0 };
  
  try {
    const parts = hslString.trim().split(' ');
    if (parts.length < 3) return { h: 0, s: 0, l: 0 };
    
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1].replace('%', ''));
    const l = parseFloat(parts[2].replace('%', ''));
    
    return { h, s, l };
  } catch (err) {
    console.error('Error parsing HSL string:', err);
    return { h: 0, s: 0, l: 0 };
  }
}

/**
 * Convert HSL string to hex color
 * @param {string} hslString - HSL color string (e.g. "360 100% 50%")
 * @returns {string} Hex color string
 */
export function hslStringToHex(hslString) {
  if (!hslString) return null;
  
  // If already in hex format, return as is
  if (hslString.startsWith('#')) {
    return hslString;
  }
  
  const { h, s, l } = parseHslString(hslString);
  return hslToHex(h, s, l);
}

/**
 * Determine if a color is light or dark for text contrast
 * Works with both hex (#RRGGBB) and HSL (h s% l%) formats
 * @param {string} color - The color in hex or HSL format
 * @returns {boolean} True if the color is light, false if dark
 */
export function isLightColor(color) {
  if (!color) return false;
  
  let r, g, b;
  
  if (color.startsWith('#')) {
    // Handle hex color
    const cleanColor = color.replace('#', '');
    r = parseInt(cleanColor.substr(0, 2), 16);
    g = parseInt(cleanColor.substr(2, 2), 16);
    b = parseInt(cleanColor.substr(4, 2), 16);
  } else {
    // Handle HSL color
    const hexColor = hslStringToHex(color);
    if (!hexColor) return false;
    
    const cleanColor = hexColor.replace('#', '');
    r = parseInt(cleanColor.substr(0, 2), 16);
    g = parseInt(cleanColor.substr(2, 2), 16);
    b = parseInt(cleanColor.substr(4, 2), 16);
  }
  
  // Calculate brightness using the formula: (0.299*R + 0.587*G + 0.114*B)
  const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return true if the color is light (brightness > 0.5)
  return brightness > 0.5;
}

/**
 * Format a timestamp for display in messages
 * @param {Date} date - Date object
 * @returns {string} Formatted time string
 */
export function formatMessageTime(date) {
  if (!date || !(date instanceof Date) || isNaN(date)) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a timestamp for display
 * @param {Date|string} timestamp - The timestamp to format
 * @returns {string} Formatted timestamp string
 */
export function formatTimestamp(timestamp) {
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', timestamp);
      return '';
    }
    
    // If the timestamp is from today, just show the time
    const isToday = new Date().toDateString() === date.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Otherwise show date and time
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
}

/**
 * Generate a unique ID for components
 * @returns {string} Unique ID
 */
export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Create a standalone fake agent for testing
 * @param {string} id - Agent ID
 * @param {string} name - Agent name
 * @param {Object} [metadata] - Additional metadata
 * @returns {Object} Mock agent object
 */
export function createMockAgent(id, name, metadata = {}) {
  return {
    id,
    name,
    displayName: name.toLowerCase(),
    description: metadata.description || `${name} agent`,
    capabilities: metadata.capabilities || ['text-chat'],
    avatar: metadata.avatar || null,
    primaryColor: metadata.primaryColor || '#4f46e5',
    secondaryColor: metadata.secondaryColor || '#3730a3',
    ...metadata
  };
}

/**
 * Copy text to clipboard with fallbacks
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch (err) {
    console.error('Failed to copy text:', err);
    return false;
  }
}

/**
 * Download content as a file
 * @param {string} content - Content to download
 * @param {string} fileName - Name of the file
 * @param {string} contentType - MIME type of the content
 */
export function downloadAsFile(content, fileName, contentType = 'text/plain') {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download message content as a file
 * @param {Object} message - Message object to download
 */
export function downloadMessage(message) {
  try {
    if (!message || !message.content) {
      console.error('Invalid message for download');
      return;
    }
    
    // Create a filename based on the agent name and timestamp
    const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
    const dateString = timestamp.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
    
    let sender = 'user';
    if (message.sender === 'agent' && message.metadata && message.metadata.agentName) {
      sender = message.metadata.agentName.toLowerCase();
    }
    
    const fileName = `${sender}_message_${dateString}.txt`;
    
    // Download the content
    downloadAsFile(message.content, fileName);
  } catch (error) {
    console.error('Error downloading message:', error);
  }
}