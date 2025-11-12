#!/usr/bin/env node

import { startWebUI } from './server/server';
import path from 'path';
import fs from 'fs';

import { PORTS } from './ports';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : PORTS.PROD_API;
const host = process.env.HOST || 'localhost';

/**
 * 获取静态文件路径
 * 仅从环境变量 STATIC_PATH 获取，不再自动查找前端构建产物
 * 前端应作为独立项目部署，通过环境变量或反向代理配置
 */
function getStaticPath(): string | undefined {
  if (process.env.STATIC_PATH) {
    const envPath = path.resolve(process.env.STATIC_PATH);
    if (fs.existsSync(envPath)) {
      const indexPath = path.join(envPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return envPath;
      }
    }
  }
  return undefined;
}

const staticPath = getStaticPath();

// 调试日志
console.log('[WebUI] Starting API server...');
console.log('[WebUI] PORT:', port);
console.log('[WebUI] HOST:', host);
console.log('[WebUI] STATIC_PATH:', staticPath || '(not configured)');

if (staticPath) {
  const resolvedPath = path.resolve(staticPath);
  console.log('[WebUI] STATIC_PATH (resolved):', resolvedPath);
  console.log('[WebUI] STATIC_PATH exists:', fs.existsSync(resolvedPath));
  if (fs.existsSync(resolvedPath)) {
    try {
      const indexPath = path.join(resolvedPath, 'index.html');
      const indexExists = fs.existsSync(indexPath);
      console.log('[WebUI] index.html exists:', indexExists);
      if (!indexExists) {
        console.warn('[WebUI] ⚠️  Warning: index.html not found in static path!');
      }
    } catch (err) {
      console.error('[WebUI] Error reading STATIC_PATH:', err);
    }
  } else {
    console.warn('[WebUI] ⚠️  Warning: STATIC_PATH does not exist!');
  }
} else {
  console.log('[WebUI] 📡 Running in API-only mode (no static files)');
  console.log('[WebUI] 💡 To serve frontend static files, set STATIC_PATH environment variable');
  console.log('[WebUI]    Example: STATIC_PATH=/path/to/frontend/dist node dist/webui/index.js');
}

startWebUI({
  port,
  host,
  enableCors: true,
  staticPath,
}).then((actualPort) => {
  console.log(`[WebUI] Server started successfully on port ${actualPort}`);
}).catch((error) => {
  console.error('Failed to start WebUI server:', error);
  process.exit(1);
});

