/**
 * Pixiv date utilities for handling Japan Standard Time (JST) dates
 * Pixiv rankings are based on Japan time (JST, UTC+9)
 */

/**
 * Format a date in YYYY-MM-DD format using Japan Standard Time (JST)
 */
export function formatDateInJST(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in YYYY-MM-DD format (Japan timezone)
 * Pixiv rankings are based on Japan time (JST, UTC+9)
 */
export function getTodayDate(): string {
  return formatDateInJST(new Date());
}

/**
 * Get yesterday's date in YYYY-MM-DD format (Japan timezone)
 * Pixiv rankings are based on Japan time (JST, UTC+9)
 */
export function getYesterdayDate(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Get current date components in JST
  const todayParts = formatter.formatToParts(now);
  const year = parseInt(todayParts.find(p => p.type === 'year')!.value, 10);
  const month = parseInt(todayParts.find(p => p.type === 'month')!.value, 10) - 1; // 0-indexed
  const day = parseInt(todayParts.find(p => p.type === 'day')!.value, 10);
  
  // Create a date object in JST and subtract one day
  // We create a date at noon JST to avoid timezone edge cases
  const jstNoon = new Date(Date.UTC(year, month, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
  jstNoon.setUTCDate(jstNoon.getUTCDate() - 1);
  
  return formatDateInJST(jstNoon);
}

/**
 * Get this week's Monday date in YYYY-MM-DD format (Japan timezone)
 * Pixiv rankings are based on Japan time (JST, UTC+9)
 */
export function getThisWeekMonday(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  });
  
  // Get current date components in JST
  const todayParts = formatter.formatToParts(now);
  const year = parseInt(todayParts.find(p => p.type === 'year')!.value, 10);
  const month = parseInt(todayParts.find(p => p.type === 'month')!.value, 10) - 1; // 0-indexed
  const day = parseInt(todayParts.find(p => p.type === 'day')!.value, 10);
  const weekday = todayParts.find(p => p.type === 'weekday')!.value;
  
  // Calculate days to subtract to get Monday (Monday = 0, Sunday = 6)
  const weekdayMap: Record<string, number> = {
    'Monday': 0,
    'Tuesday': 1,
    'Wednesday': 2,
    'Thursday': 3,
    'Friday': 4,
    'Saturday': 5,
    'Sunday': 6,
  };
  const daysToSubtract = weekdayMap[weekday] || 0;
  
  // Create a date object in JST at noon to avoid timezone edge cases
  const jstNoon = new Date(Date.UTC(year, month, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
  jstNoon.setUTCDate(jstNoon.getUTCDate() - daysToSubtract);
  
  return formatDateInJST(jstNoon);
}

/**
 * Get last week's Monday date in YYYY-MM-DD format (Japan timezone)
 * Pixiv rankings are based on Japan time (JST, UTC+9)
 */
export function getLastWeekMonday(): string {
  const thisWeekMonday = getThisWeekMonday();
  const [year, month, day] = thisWeekMonday.split('-').map(Number);
  
  // Create a date object in JST at noon and subtract 7 days
  const jstNoon = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
  jstNoon.setUTCDate(jstNoon.getUTCDate() - 7);
  
  return formatDateInJST(jstNoon);
}

/**
 * Get date range for last N days in YYYY-MM-DD format (Japan timezone)
 * Returns { startDate, endDate } where endDate is yesterday
 * Pixiv rankings are based on Japan time (JST, UTC+9)
 */
export function getLastNDaysDateRange(days: number): { startDate: string; endDate: string } {
  const endDate = getYesterdayDate();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Parse endDate to get components
  const endParts = endDate.split('-');
  const year = parseInt(endParts[0], 10);
  const month = parseInt(endParts[1], 10) - 1; // 0-indexed
  const day = parseInt(endParts[2], 10);
  
  // Create a date object in JST and subtract N days
  const jstNoon = new Date(Date.UTC(year, month, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
  jstNoon.setUTCDate(jstNoon.getUTCDate() - (days - 1));
  
  // Format the start date
  const startParts = formatter.formatToParts(jstNoon);
  const startYear = startParts.find(p => p.type === 'year')!.value;
  const startMonth = startParts.find(p => p.type === 'month')!.value;
  const startDay = startParts.find(p => p.type === 'day')!.value;
  
  return {
    startDate: `${startYear}-${startMonth}-${startDay}`,
    endDate,
  };
}

