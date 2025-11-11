/**
 * Type guards and type-safe utilities
 * Provides type-safe checks and assertions
 */

import { StandaloneConfig, TargetConfig } from '../config';

/**
 * Type guard to check if process has Electron-specific properties
 */
export interface ElectronProcess {
  type?: 'browser' | 'renderer' | 'worker';
  versions?: NodeJS.ProcessVersions & {
    electron?: string;
  };
  env?: NodeJS.ProcessEnv;
}

/**
 * Check if running in Electron environment (type-safe)
 */
export function isElectronEnvironment(): boolean {
  if (typeof process === 'undefined') {
    return false;
  }
  
  const proc = process as unknown as ElectronProcess;
  
  // Check for Electron version
  if (proc.versions?.electron !== undefined) {
    return true;
  }
  
  // Check for Electron-specific process.type
  if (proc.type === 'renderer' || proc.type === 'browser') {
    return true;
  }
  
  // Check for Electron environment variables
  if (process.env?.ELECTRON_IS_DEV !== undefined) {
    return true;
  }
  
  if (process.env?.ELECTRON_RUN_AS_NODE !== undefined && process.env.ELECTRON_RUN_AS_NODE !== '1') {
    return true;
  }
  
  return false;
}

/**
 * Type guard for valid target type
 */
export function isValidTargetType(value: unknown): value is 'illustration' | 'novel' {
  return value === 'illustration' || value === 'novel';
}

/**
 * Type guard for valid log level
 */
export function isValidLogLevel(value: unknown): value is 'debug' | 'info' | 'warn' | 'error' {
  return typeof value === 'string' && ['debug', 'info', 'warn', 'error'].includes(value);
}

/**
 * Type guard for valid organization mode
 */
export function isValidOrganizationMode(value: unknown): boolean {
  const validModes = [
    'flat',
    'byAuthor',
    'byTag',
    'byDate',
    'byDay',
    'byDownloadDate',
    'byDownloadDay',
    'byAuthorAndTag',
    'byDateAndAuthor',
    'byDayAndAuthor',
    'byDownloadDateAndAuthor',
    'byDownloadDayAndAuthor',
  ];
  return typeof value === 'string' && validModes.includes(value);
}

/**
 * Type guard to check if value is a valid date string (YYYY-MM-DD)
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Type guard to check if value is a valid number
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard to check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard to check if value is a valid array
 */
export function isValidArray<T>(value: unknown, itemGuard?: (item: unknown) => item is T): value is T[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (itemGuard) {
    return value.every(item => itemGuard(item));
  }
  return true;
}

/**
 * Type guard to check if value is a valid object
 */
export function isValidObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safe type assertion with runtime check
 */
export function assertType<T>(
  value: unknown,
  guard: (val: unknown) => val is T,
  errorMessage?: string
): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(errorMessage || `Value does not match expected type`);
  }
}

/**
 * Safe property access with type checking
 */
export function getProperty<T>(
  obj: unknown,
  key: string,
  guard?: (val: unknown) => val is T
): T | undefined {
  if (!isValidObject(obj) || !(key in obj)) {
    return undefined;
  }
  const value = obj[key];
  if (guard && !guard(value)) {
    return undefined;
  }
  return value as T;
}

/**
 * Safe array access
 */
export function getArrayItem<T>(
  arr: unknown,
  index: number,
  itemGuard?: (item: unknown) => item is T
): T | undefined {
  if (!Array.isArray(arr)) {
    return undefined;
  }
  if (index < 0 || index >= arr.length) {
    return undefined;
  }
  const item = arr[index];
  if (itemGuard && !itemGuard(item)) {
    return undefined;
  }
  return item as T;
}

