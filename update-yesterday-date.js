#!/usr/bin/env node
/**
 * 自动更新配置文件中的昨天日期
 * 使用方法: node update-yesterday-date.js [配置文件路径]
 */

const fs = require('fs');
const path = require('path');

/**
 * Get yesterday's date in YYYY-MM-DD format (Japan timezone)
 * Pixiv rankings are based on Japan time (JST, UTC+9)
 */
function getYesterdayDate() {
  // Get current time in Japan timezone (JST = UTC+9)
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Get current date components in JST
  const todayParts = formatter.formatToParts(now);
  const year = parseInt(todayParts.find(p => p.type === 'year').value, 10);
  const month = parseInt(todayParts.find(p => p.type === 'month').value, 10) - 1; // 0-indexed
  const day = parseInt(todayParts.find(p => p.type === 'day').value, 10);
  
  // Create a date object in JST and subtract one day
  // We create a date at noon JST to avoid timezone edge cases
  const jstNoon = new Date(Date.UTC(year, month, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
  jstNoon.setUTCDate(jstNoon.getUTCDate() - 1);
  
  // Format the yesterday date
  const yesterdayParts = formatter.formatToParts(jstNoon);
  const yesterdayYear = yesterdayParts.find(p => p.type === 'year').value;
  const yesterdayMonth = yesterdayParts.find(p => p.type === 'month').value;
  const yesterdayDay = yesterdayParts.find(p => p.type === 'day').value;
  
  return `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
}

// Get config file path from command line argument or use default
const configPath = process.argv[2] || path.join(__dirname, 'config', 'standalone.config.novel-chinese.json');

if (!fs.existsSync(configPath)) {
  console.error(`配置文件不存在: ${configPath}`);
  process.exit(1);
}

// Read config file
const configContent = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configContent);

// Get yesterday's date
const yesterday = getYesterdayDate();

// Update date in config
let updated = false;
if (config.targets && Array.isArray(config.targets)) {
  for (const target of config.targets) {
    if (target.startDate) {
      target.startDate = yesterday;
      updated = true;
    }
    if (target.endDate) {
      target.endDate = yesterday;
      updated = true;
    }
  }
}

// Update _date comment if exists
if (config._date) {
  config._date = `昨天日期：${yesterday}`;
  updated = true;
}

if (updated) {
  // Write updated config back to file
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`✅ 已更新配置文件: ${configPath}`);
  console.log(`📅 昨天日期: ${yesterday}`);
} else {
  console.log(`ℹ️  配置文件无需更新: ${configPath}`);
}


