import i18n from '../i18n/config';

/**
 * Get locale string based on current i18n language
 * @returns 'zh-CN' or 'en-US'
 */
export function getLocale(): string {
  return i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
}

/**
 * Format date to localized string
 * @param date - Date string or Date object
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatDate(
  date: string | Date | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '-';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return String(date);
    
    const locale = getLocale();
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...options,
    };
    
    return dateObj.toLocaleString(locale, defaultOptions);
  } catch {
    return String(date);
  }
}

/**
 * Format date to localized date string (without time)
 * @param date - Date string or Date object
 * @returns Formatted date string
 */
export function formatDateOnly(date: string | Date | undefined | null): string {
  return formatDate(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Format date to localized time string (without date)
 * @param date - Date string or Date object
 * @returns Formatted time string
 */
export function formatTimeOnly(date: string | Date | undefined | null): string {
  return formatDate(date, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

