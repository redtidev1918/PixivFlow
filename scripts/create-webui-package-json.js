#!/usr/bin/env node
/**
 * 在 dist/webui 目录创建 package.json 以明确指定 CommonJS 模块类型
 * 这是解决 ES 模块冲突的根本方案
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const webuiDistDir = path.join(distDir, 'webui');
const distPackageJson = path.join(distDir, 'package.json');
const webuiPackageJson = path.join(webuiDistDir, 'package.json');
const rootPackageJson = path.join(__dirname, '..', 'package.json');

// Read version from root package.json
let version = '1.0.0';
try {
  if (fs.existsSync(rootPackageJson)) {
    const rootPkg = JSON.parse(fs.readFileSync(rootPackageJson, 'utf-8'));
    version = rootPkg.version || version;
  }
} catch (err) {
  console.warn('警告: 无法读取根 package.json 的版本号，使用默认值', err.message);
}

if (!fs.existsSync(webuiDistDir)) {
  console.error('错误: dist/webui 目录不存在');
  process.exit(1);
}

const webuiPackageJsonContent = {
  "type": "commonjs",
  "name": "pixivflow-webui-backend",
  "version": version,
  "description": "PixivFlow WebUI Backend - CommonJS module"
};

fs.writeFileSync(webuiPackageJson, JSON.stringify(webuiPackageJsonContent, null, 2));
console.log(`✓ 已创建 ${webuiPackageJson}`);

// 为 dist 根目录创建 package.json，确保诸如 dist/logger.js 等文件在任何位置都被视为 CommonJS
// 同时包含版本信息以便运行时读取
const distPackageJsonContent = {
  "type": "commonjs",
  "name": "pixivflow",
  "version": version,
  "private": true
};

fs.writeFileSync(distPackageJson, JSON.stringify(distPackageJsonContent, null, 2));
console.log(`✓ 已创建 ${distPackageJson}`);

