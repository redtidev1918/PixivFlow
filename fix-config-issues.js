#!/usr/bin/env node

/**
 * 配置修复脚本
 * 解决以下问题：
 * 1. 需要 Pixiv 刷新令牌
 * 2. 目标 limit 必须大于 0
 * 3. Token 刷新失败
 */

const fs = require('fs');
const path = require('path');

const configPath = process.argv[2] || path.join(__dirname, 'config/standalone.config.json');

console.log('🔧 开始修复配置问题...');
console.log(`配置文件: ${configPath}`);
console.log('');

// 检查配置文件是否存在
if (!fs.existsSync(configPath)) {
    console.error(`❌ 错误: 配置文件不存在: ${configPath}`);
    process.exit(1);
}

// 读取配置
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error(`❌ 错误: 无法解析配置文件: ${error.message}`);
    process.exit(1);
}

let fixed = false;

// 1. 检查并修复 limit 问题
console.log('📋 检查目标配置...');
if (config.targets && Array.isArray(config.targets)) {
    config.targets.forEach((target, index) => {
        if (target.limit !== undefined && target.limit < 1) {
            console.log(`⚠️  目标 ${index + 1}: limit=${target.limit} (无效，必须 > 0)`);
            // 修复为默认值 10
            target.limit = 10;
            fixed = true;
            console.log(`✅ 目标 ${index + 1}: 已修复 limit 为 10`);
        } else if (target.limit === undefined) {
            console.log(`⚠️  目标 ${index + 1}: limit 未设置`);
            target.limit = 10;
            fixed = true;
            console.log(`✅ 目标 ${index + 1}: 已设置 limit 为 10`);
        }
    });
}

if (fixed) {
    // 创建备份
    const backupPath = configPath + '.backup.' + Date.now();
    fs.copyFileSync(configPath, backupPath);
    console.log(`📦 已创建备份: ${backupPath}`);
    
    // 保存修复后的配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    console.log('✅ 配置文件已更新');
} else {
    console.log('✅ 所有目标的 limit 配置正常');
}

console.log('');
console.log('🔑 检查 Pixiv 刷新令牌...');

// 2. 检查 refresh token
function isPlaceholderToken(token) {
    if (!token || typeof token !== 'string') return true;
    const trimmed = token.trim();
    return trimmed === '' || 
           trimmed === 'YOUR_REFRESH_TOKEN' || 
           trimmed.toLowerCase() === 'your_refresh_token' ||
           trimmed === '***' ||
           trimmed.length < 10;
}

if (!config.pixiv || !config.pixiv.refreshToken || isPlaceholderToken(config.pixiv.refreshToken)) {
    console.log('❌ 错误: 需要有效的 Pixiv 刷新令牌');
    console.log('');
    console.log('请运行以下命令之一来获取刷新令牌:');
    console.log('  1. pixivflow login          # 交互式登录（推荐）');
    console.log('  2. npm run login            # 如果从源码安装');
    console.log('');
    console.log('登录成功后，refresh token 会自动更新到配置文件中。');
    process.exit(1);
} else {
    console.log('✅ Pixiv 刷新令牌已配置');
}

console.log('');
console.log('✅ 配置检查完成！');
console.log('');
console.log('如果仍有问题，请：');
console.log('  1. 运行 \'pixivflow login\' 获取有效的刷新令牌');
console.log('  2. 检查配置文件中的所有目标，确保 limit > 0');
console.log('  3. 如果使用 WebUI，请在配置页面检查并修复目标 6 的 limit 设置');

