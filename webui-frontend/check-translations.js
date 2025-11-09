/**
 * Translation Completeness Checker
 * Compares zh-CN and en-US translation files to find missing keys
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const zhCN = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/locales/zh-CN.json'), 'utf8'));
const enUS = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/locales/en-US.json'), 'utf8'));

function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const zhKeys = getAllKeys(zhCN);
const enKeys = getAllKeys(enUS);

const zhSet = new Set(zhKeys);
const enSet = new Set(enKeys);

const missingInEn = zhKeys.filter(key => !enSet.has(key));
const missingInZh = enKeys.filter(key => !zhSet.has(key));

console.log('='.repeat(80));
console.log('Translation Completeness Report');
console.log('='.repeat(80));
console.log(`\nTotal keys in zh-CN: ${zhKeys.length}`);
console.log(`Total keys in en-US: ${enKeys.length}`);

if (missingInEn.length > 0) {
  console.log(`\n❌ Missing in en-US (${missingInEn.length} keys):`);
  missingInEn.forEach(key => console.log(`  - ${key}`));
} else {
  console.log('\n✅ All zh-CN keys are present in en-US');
}

if (missingInZh.length > 0) {
  console.log(`\n❌ Missing in zh-CN (${missingInZh.length} keys):`);
  missingInZh.forEach(key => console.log(`  - ${key}`));
} else {
  console.log('\n✅ All en-US keys are present in zh-CN');
}

if (missingInEn.length === 0 && missingInZh.length === 0) {
  console.log('\n🎉 All translations are complete!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some translations are missing. Please update the translation files.');
  process.exit(1);
}

