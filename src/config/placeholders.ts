/**
 * Configuration placeholder processing
 * 
 * Process placeholders in config (e.g., "YESTERDAY" -> actual yesterday date)
 * Supported placeholders:
 * - YESTERDAY: Yesterday's date
 * - TODAY: Today's date
 * - LAST_7_DAYS: Date range for last 7 days (startDate to endDate)
 * - LAST_30_DAYS: Date range for last 30 days (startDate to endDate)
 * - LAST_N_DAYS: Date range for last N days (format: LAST_N_DAYS:7)
 */

import { logger } from '../logger';
import { StandaloneConfig } from './types';
import { getYesterdayDate, getTodayDate, getLastNDaysDateRange } from '../utils/pixiv-date-utils';

/**
 * Process placeholders in config
 */
export function processConfigPlaceholders(config: StandaloneConfig): StandaloneConfig {
  const processed = JSON.parse(JSON.stringify(config)) as StandaloneConfig;
  
  for (const target of processed.targets) {
    // Process rankingDate placeholder
    if (target.rankingDate === 'YESTERDAY') {
      const yesterday = getYesterdayDate();
      target.rankingDate = yesterday;
      logger.debug(`Replaced rankingDate placeholder with: ${yesterday}`);
    }
    
    // Process endDate placeholder first (before startDate to avoid conflicts)
    if (target.endDate) {
      if (target.endDate === 'YESTERDAY') {
        target.endDate = getYesterdayDate();
        logger.debug(`Replaced endDate placeholder YESTERDAY with: ${target.endDate}`);
      } else if (target.endDate === 'TODAY') {
        target.endDate = getTodayDate();
        logger.debug(`Replaced endDate placeholder TODAY with: ${target.endDate}`);
      }
    }
    
    // Process startDate placeholder
    if (target.startDate) {
      const originalStartDate = target.startDate;
      if (target.startDate === 'YESTERDAY') {
        target.startDate = getYesterdayDate();
        logger.debug(`Replaced startDate placeholder YESTERDAY with: ${target.startDate}`);
      } else if (target.startDate === 'TODAY') {
        target.startDate = getTodayDate();
        logger.debug(`Replaced startDate placeholder TODAY with: ${target.startDate}`);
      } else if (target.startDate.startsWith('LAST_')) {
        // Handle LAST_7_DAYS, LAST_30_DAYS, or LAST_N_DAYS:N
        let days = 7;
        if (target.startDate === 'LAST_7_DAYS') {
          days = 7;
        } else if (target.startDate === 'LAST_30_DAYS') {
          days = 30;
        } else if (target.startDate.startsWith('LAST_N_DAYS:')) {
          const n = parseInt(target.startDate.split(':')[1], 10);
          if (!isNaN(n) && n > 0) {
            days = n;
          }
        }
        const dateRange = getLastNDaysDateRange(days);
        target.startDate = dateRange.startDate;
        // Only set endDate if it wasn't already processed (still a placeholder or not set)
        if (!target.endDate || target.endDate === 'YESTERDAY' || target.endDate === 'TODAY') {
          target.endDate = dateRange.endDate;
        }
        logger.debug(`Replaced startDate placeholder ${originalStartDate} with date range: ${dateRange.startDate} to ${dateRange.endDate}`);
      }
    }
  }
  
  return processed;
}

















































