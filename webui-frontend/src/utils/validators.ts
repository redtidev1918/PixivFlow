/**
 * Validation Utilities
 * Common validation functions for form inputs and data validation
 */

/**
 * Validate email address
 * @param email - Email address to validate
 * @returns True if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL
 * @param url - URL to validate
 * @returns True if valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate Pixiv ID
 * @param id - Pixiv ID to validate
 * @returns True if valid, false otherwise
 */
export function isValidPixivId(id: string | number): boolean {
  const idStr = String(id);
  return /^\d+$/.test(idStr) && parseInt(idStr, 10) > 0;
}

/**
 * Validate port number
 * @param port - Port number to validate
 * @returns True if valid, false otherwise
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Validate IP address (IPv4)
 * @param ip - IP address to validate
 * @returns True if valid, false otherwise
 */
export function isValidIPv4(ip: string): boolean {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Validate cron expression
 * @param cron - Cron expression to validate
 * @returns True if valid, false otherwise
 */
export function isValidCron(cron: string): boolean {
  // Basic cron validation (5 or 6 fields)
  const parts = cron.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

/**
 * Validate date string (YYYY-MM-DD format)
 * @param dateStr - Date string to validate
 * @returns True if valid, false otherwise
 */
export function isValidDateString(dateStr: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validate file extension
 * @param filename - Filename to check
 * @param allowedExtensions - Array of allowed extensions (e.g., ['.jpg', '.png'])
 * @returns True if valid, false otherwise
 */
export function hasValidExtension(filename: string, allowedExtensions: string[]): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return allowedExtensions.some(allowed => ext === allowed.toLowerCase());
}

/**
 * Validate range (min <= value <= max)
 * @param value - Value to check
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns True if valid, false otherwise
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Validate required field (not empty)
 * @param value - Value to check
 * @returns True if not empty, false otherwise
 */
export function isRequired(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Validate minimum length
 * @param value - String to check
 * @param minLength - Minimum length
 * @returns True if valid, false otherwise
 */
export function hasMinLength(value: string, minLength: number): boolean {
  return value.length >= minLength;
}

/**
 * Validate maximum length
 * @param value - String to check
 * @param maxLength - Maximum length
 * @returns True if valid, false otherwise
 */
export function hasMaxLength(value: string, maxLength: number): boolean {
  return value.length <= maxLength;
}

