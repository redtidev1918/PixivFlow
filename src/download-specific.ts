/**
 * 特定下载脚本（已废弃）
 * 
 * ⚠️ 注意：此脚本已不再需要！
 * 
 * 现在可以通过配置文件 + 通用 download 命令来实现相同功能：
 * 
 * 1. 使用示例配置文件：
 *    cp config/specific-download.example.json config/standalone.config.json
 * 
 * 2. 运行通用下载命令：
 *    pixivflow download
 *    (如果有源码，也可以使用: npm run download)
 * 
 * 这样做的好处：
 * - 不需要单独的脚本
 * - 配置更灵活，可以随时修改
 * - 代码更简洁，维护成本更低
 * 
 * 如果你仍然想使用此脚本（向后兼容），它会调用通用的 download 命令。
 */

import { spawn } from 'child_process';
import * as path from 'path';

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                                                                ║');
console.log('║        ⚠️  此脚本已废弃，建议使用配置文件方式                  ║');
console.log('║                                                                ║');
console.log('║        使用方法：                                                ║');
console.log('║        1. cp config/specific-download.example.json              ║');
console.log('║           config/standalone.config.json                         ║');
console.log('║        2. pixivflow download                                     ║');
console.log('║                                                                ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// 为了向后兼容，调用通用的 download 命令
const scriptPath = path.join(__dirname, 'index.js');
const child = spawn('node', [scriptPath, 'download'], {
  stdio: 'inherit',
  cwd: process.cwd()
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});

