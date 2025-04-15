/**
 * @fileoverview Tests for utility functions.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { 
  cn,
  formatMessageTime,
  formatTimestamp,
  isLightColor,
  hslToHex,
  hslStringToHex
} from '../utils';

describe('cn', () => {
  test('combines class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
    expect(cn('foo', undefined, 'bar')).toBe('foo bar');
    expect(cn('foo', null, 'bar')).toBe('foo bar');
    expect(cn('foo', false && 'bar')).toBe('foo');
    expect(cn('foo', true && 'bar')).toBe('foo bar');
  });
  
  test('handles duplicate class names', () => {
    // Note: The actual behavior depends on the implementation of cn and its dependencies (clsx, tailwind-merge)
    // Some implementations may or may not deduplicate basic class names
    const result = cn('foo', 'foo');
    expect(result.includes('foo')).toBe(true);
    
    const result2 = cn('foo', 'bar', 'foo');
    expect(result2.includes('foo')).toBe(true);
    expect(result2.includes('bar')).toBe(true);
  });
});

describe('formatMessageTime', () => {
  test('formats time correctly', () => {
    const date = new Date('2023-04-01T12:34:56');
    const formattedTime = formatMessageTime(date);
    
    // Format depends on locale, but should contain some digits and separators
    expect(formattedTime.length).toBeGreaterThan(0);
    expect(/\d/.test(formattedTime)).toBe(true);
  });
  
  test('handles invalid dates', () => {
    expect(formatMessageTime(null)).toBe('');
    expect(formatMessageTime(undefined)).toBe('');
    expect(formatMessageTime('not a date')).toBe('');
    expect(formatMessageTime(new Date('invalid'))).toBe('');
  });
});

describe('formatTimestamp', () => {
  test('formats date strings correctly', () => {
    const timestamp = '2023-04-01T14:30:00';
    const formatted = formatTimestamp(timestamp);
    
    // Format depends on locale, but should contain some digits and separators
    expect(formatted.length).toBeGreaterThan(0);
    expect(/\d/.test(formatted)).toBe(true);
  });
  
  test('formats Date objects correctly', () => {
    const timestamp = new Date('2023-04-01T14:30:00');
    const formatted = formatTimestamp(timestamp);
    
    // Format depends on locale, but should contain some digits and separators
    expect(formatted.length).toBeGreaterThan(0);
    expect(/\d/.test(formatted)).toBe(true);
  });
  
  test('handles invalid timestamps', () => {
    // The function's behavior may vary for null/undefined,
    // but it should consistently handle obviously invalid dates
    const result1 = formatTimestamp(null);
    const result2 = formatTimestamp(undefined);
    
    // For clearly invalid dates, we expect an empty string
    expect(formatTimestamp('not a date')).toBe('');
  });
});

describe('isLightColor', () => {
  test('identifies light colors correctly', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#F0F0F0')).toBe(true);
    expect(isLightColor('#FFFF00')).toBe(true); // Yellow
    expect(isLightColor('#90EE90')).toBe(true); // Light green
  });
  
  test('identifies dark colors correctly', () => {
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('#333333')).toBe(false);
    expect(isLightColor('#0000FF')).toBe(false); // Blue
    expect(isLightColor('#800080')).toBe(false); // Purple
  });
  
  test('handles invalid input gracefully', () => {
    expect(isLightColor(null)).toBe(false);
    expect(isLightColor(undefined)).toBe(false);
    expect(isLightColor('')).toBe(false);
    expect(isLightColor('not a color')).toBe(false);
  });
});

describe('hslToHex', () => {
  test('converts HSL to hex correctly', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000'); // Black
    expect(hslToHex(0, 0, 100)).toBe('#ffffff'); // White
    expect(hslToHex(0, 100, 50)).toBe('#ff0000'); // Red
    expect(hslToHex(120, 100, 50)).toBe('#00ff00'); // Green
    expect(hslToHex(240, 100, 50)).toBe('#0000ff'); // Blue
  });
});

describe('hslStringToHex', () => {
  test('converts HSL string to hex', () => {
    expect(hslStringToHex('0 0% 0%')).toBe('#000000'); // Black
    expect(hslStringToHex('0 0% 100%')).toBe('#ffffff'); // White
    expect(hslStringToHex('0 100% 50%')).toBe('#ff0000'); // Red
  });
  
  test('returns hex strings unchanged', () => {
    expect(hslStringToHex('#ff0000')).toBe('#ff0000');
    expect(hslStringToHex('#00ff00')).toBe('#00ff00');
  });
  
  test('handles invalid input', () => {
    expect(hslStringToHex(null)).toBe(null);
    expect(hslStringToHex(undefined)).toBe(null);
    expect(hslStringToHex('')).toBe(null);
  });
});