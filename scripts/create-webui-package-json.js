#!/usr/bin/env node
/**
 * 在 dist/webui 目录创建 package.json 以明确指定 CommonJS 模块类型
 * 这是解决 ES 模块冲突的根本方案
 */

const fs = require('fs');
const path = require('path');

const webuiDistDir = path.join(__dirname, '..', 'dist', 'webui');
const webuiPackageJson = path.join(webuiDistDir, 'package.json');

if (!fs.existsSync(webuiDistDir)) {
  console.error('错误: dist/webui 目录不存在');
  process.exit(1);
}

const packageJsonContent = {
  "type": "commonjs",
  "name": "pixivflow-webui-backend",
  "version": "1.0.0",
  "description": "PixivFlow WebUI Backend - CommonJS module"
};

fs.writeFileSync(webuiPackageJson, JSON.stringify(packageJsonContent, null, 2));
console.log(`✓ 已创建 ${webuiPackageJson}`);

