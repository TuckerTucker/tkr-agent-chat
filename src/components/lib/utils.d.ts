import { type ClassValue } from 'clsx';

/**
 * Merge class names with Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]): string;

/**
 * Check if a color is considered "light" based on its HSL values
 */
export function isLightColor(hslColor: string): boolean;

/**
 * Format a timestamp into a human-readable string
 */
export function formatMessageTime(timestamp: Date | string | number): string;

/**
 * Copy text to clipboard
 */
export function copyToClipboard(text: string): Promise<void>;
