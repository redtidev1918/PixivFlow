const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const axios = require('axios');
const os = require('os');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 尝试加载 puppeteer-core（用于 Puppeteer 登录）
let puppeteer = null;
try {
  puppeteer = require('puppeteer-core');
  console.log('✅ Puppeteer-core 已加载');
} catch (error) {
  console.warn('⚠️  Puppeteer-core 未安装，将使用 BrowserWindow 登录方案');
  console.warn('   如需使用 Puppeteer 登录，请运行: cd webui-frontend && npm install puppeteer-core');
}

// 尝试加载 pixiv-token-getter（优先使用）
let pixivTokenGetter = null;
let pixivTokenGetterAdapter = null;
try {
  pixivTokenGetter = require('pixiv-token-getter');
  // 尝试加载适配器（如果可用）
  try {
    // 尝试多个可能的路径
    const possiblePaths = [
      path.join(__dirname, '../../dist/pixiv-token-getter-adapter.js'), // 开发模式：从 electron 目录
      path.join(process.cwd(), 'dist/pixiv-token-getter-adapter.js'), // 从项目根目录
      path.join(process.resourcesPath || '', 'dist/pixiv-token-getter-adapter.js'), // 生产模式
    ];
    
    let adapterPath = null;
    for (const possiblePath of possiblePaths) {
      if (possiblePath && fs.existsSync(possiblePath)) {
        adapterPath = possiblePath;
        break;
      }
    }
    
    if (adapterPath) {
      pixivTokenGetterAdapter = require(adapterPath);
      console.log('✅ pixiv-token-getter 适配器已加载:', adapterPath);
    } else {
      console.log('✅ pixiv-token-getter 已加载（直接使用，未找到适配器）');
    }
  } catch (adapterError) {
    console.log('✅ pixiv-token-getter 已加载（直接使用，适配器加载失败）');
    console.log('   适配器错误:', adapterError.message);
  }
} catch (error) {
  console.warn('⚠️  pixiv-token-getter 未安装，将使用 Puppeteer 或 BrowserWindow 登录方案');
  console.warn('   如需使用 pixiv-token-getter 登录，请运行: npm install pixiv-token-getter');
}

let mainWindow = null;
let backendProcess = null;
let loginWindow = null; // 登录窗口（BrowserWindow 方案）
let puppeteerBrowser = null; // Puppeteer 浏览器实例
let currentLoginCodeVerifier = null; // 当前登录流程的 code verifier
let loginUrlCheckInterval = null; // 登录窗口 URL 检查定时器
let currentLoadTimeout = null; // 当前登录窗口加载的超时计时器
let isOpeningLoginWindow = false; // 是否正在打开登录窗口（防止重复调用）
const BACKEND_PORT = 3000; // 默认端口，如果被占用会自动寻找可用端口
let actualBackendPort = BACKEND_PORT; // 实际使用的端口（可能因端口占用而改变）
let isAppClosing = false;
const activeTimers = new Set(); // 跟踪所有活动的定时器
let appData = null; // 应用数据目录信息（生产模式下）
let backendRestartCount = 0; // 后端重启次数
const MAX_BACKEND_RESTARTS = 5; // 最大重启次数
let isBackendStarting = false; // 后端是否正在启动中
let backendReadyState = false; // 后端就绪状态缓存
let backendReadyNotificationPending = false; // 是否有待发送的就绪通知

// Pixiv OAuth 常量
const PIXIV_CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const PIXIV_CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const PIXIV_REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';
const PIXIV_LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login';
const PIXIV_AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const PIXIV_USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';

// 全局错误处理 - 防止应用闪退
// 必须在应用初始化之前设置，以便捕获所有错误
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  console.error('错误堆栈:', error.stack);
  
  // 将错误写入日志文件
  try {
    // 使用 try-catch 确保即使 app 未初始化也能记录错误
    let userDataPath;
    try {
      userDataPath = app.getPath('userData');
    } catch (e) {
      // 如果 app 未初始化，使用临时目录
      userDataPath = require('os').tmpdir();
    }
    
    const logDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `crash-${Date.now()}.log`);
    fs.writeFileSync(logFile, `未捕获的异常: ${error.message}\n\n堆栈:\n${error.stack}\n`, 'utf8');
    console.error(`错误日志已保存到: ${logFile}`);
  } catch (logError) {
    console.error('无法写入错误日志:', logError);
    // 至少输出到控制台
    console.error('原始错误:', error);
  }
  
  // 显示错误对话框（仅在生产模式下且窗口已创建）
  try {
    if (!isDev && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('应用错误', `发生未预期的错误:\n\n${error.message}\n\n错误日志已保存到应用数据目录的 logs 文件夹。`);
    }
  } catch (e) {
    // 忽略对话框错误
  }
  
  // 不要立即退出，尝试继续运行
  // 只有在严重错误时才退出
  if (error.message && (error.message.includes('ENOENT') || error.message.includes('Cannot find module'))) {
    console.error('文件或模块不存在错误，尝试继续运行...');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  if (reason instanceof Error) {
    console.error('错误堆栈:', reason.stack);
  }
  
  // 将错误写入日志文件
  try {
    const userDataPath = app.getPath('userData');
    const logDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `rejection-${Date.now()}.log`);
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    const errorStack = reason instanceof Error ? reason.stack : '';
    fs.writeFileSync(logFile, `未处理的 Promise 拒绝: ${errorMessage}\n\n堆栈:\n${errorStack}\n`, 'utf8');
    console.error(`错误日志已保存到: ${logFile}`);
  } catch (logError) {
    console.error('无法写入错误日志:', logError);
  }
});

// 处理 stdout/stderr 的 EPIPE 错误
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // 忽略 EPIPE 错误（流已关闭）
    return;
  }
});

process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // 忽略 EPIPE 错误（流已关闭）
    return;
  }
});

// 安全的日志函数，防止 EPIPE 错误
function safeLog(...args) {
  if (isAppClosing) return;
  try {
    console.log(...args);
  } catch (err) {
    // 忽略 EPIPE 错误（流已关闭）
    if (err.code !== 'EPIPE') {
      // 其他错误可以尝试输出到 stderr
      try {
        console.error('Log error:', err.message);
      } catch (e) {
        // 如果连 stderr 也关闭了，就忽略
      }
    }
  }
}

function safeError(...args) {
  if (isAppClosing) return;
  try {
    console.error(...args);
  } catch (err) {
    // 忽略 EPIPE 错误（流已关闭）
    if (err.code !== 'EPIPE') {
      // 其他错误可以尝试输出到 stdout
      try {
        console.log('Error log error:', err.message);
      } catch (e) {
        // 如果连 stdout 也关闭了，就忽略
      }
    }
  }
}

// 安全的 setTimeout 包装器
function safeSetTimeout(callback, delay) {
  if (isAppClosing) return null;
  const timerId = setTimeout(() => {
    activeTimers.delete(timerId);
    if (!isAppClosing) {
      callback();
    }
  }, delay);
  activeTimers.add(timerId);
  return timerId;
}

// 安全的 setInterval 包装器
function safeSetInterval(callback, delay) {
  if (isAppClosing) return null;
  const timerId = setInterval(() => {
    if (!isAppClosing) {
      callback();
    } else {
      clearInterval(timerId);
      activeTimers.delete(timerId);
    }
  }, delay);
  activeTimers.add(timerId);
  return timerId;
}

// 清理所有定时器
function clearAllTimers() {
  isAppClosing = true;
  activeTimers.forEach(timerId => {
    clearTimeout(timerId);
    clearInterval(timerId);
  });
  activeTimers.clear();
}

// 获取项目根目录
function getProjectRoot() {
  // 从 electron/main.cjs 向上两级到达项目根目录
  // __dirname = webui-frontend/electron
  // ../.. = 项目根目录
  const projectRoot = path.resolve(__dirname, '../..');
  return projectRoot;
}

// 初始化应用的用户数据目录和配置文件
function initializeAppData() {
  // 无论是开发模式还是生产模式，都使用应用的用户数据目录
  // 这样可以确保开发和生产环境使用相同的数据目录，避免数据混乱
  const userDataPath = app.getPath('userData');
  const appDataDir = path.join(userDataPath, 'PixivFlow');
  const configDir = path.join(appDataDir, 'config');
  const dataDir = path.join(appDataDir, 'data');
  const downloadsDir = path.join(appDataDir, 'downloads');
  const configPath = path.join(configDir, 'standalone.config.json');
  
  // 创建必要的目录
  [appDataDir, configDir, dataDir, downloadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 创建目录: ${dir}`);
    }
  });
  
  // 如果配置文件不存在，创建默认配置
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      "pixiv": {
        "clientId": "",
        "clientSecret": "",
        "deviceToken": "",
        "refreshToken": "",
        "userAgent": "PixivAndroidApp/5.0.234 (Android 11; Pixel 5)"
      },
      "storage": {
        "databasePath": path.join(dataDir, 'pixiv-downloader.db'),
        "downloadDirectory": downloadsDir,
        // 不设置 illustrationDirectory 和 novelDirectory，让 applyDefaults 自动处理
        // 这样可以避免路径重复问题（如 downloads/downloads/illustrations）
        "illustrationOrganization": "flat",
        "novelOrganization": "flat"
      },
      "targets": []
    };
    
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log(`📝 创建默认配置文件: ${configPath}`);
  }
  
  console.log(`📁 应用数据目录: ${appDataDir}`);
  console.log(`📁 配置文件路径: ${configPath}`);
  
  return {
    appDataDir,
    configPath,
    dataDir,
    downloadsDir
  };
}

// 验证路径是否存在
function validatePath(dirPath, description) {
  if (!fs.existsSync(dirPath)) {
    console.error(`❌ ${description} 路径不存在: ${dirPath}`);
    return false;
  }
  return true;
}

// REF: https://www.electronjs.org/docs/latest/api/net
// 检查端口是否被占用（同时检查 IPv4 和 IPv6）
function checkPortInUse(port, callback) {
  const net = require('net');
  let checkedIPv4 = false;
  let checkedIPv6 = false;
  let ipv4InUse = false;
  let ipv6InUse = false;
  
  const checkComplete = () => {
    if (checkedIPv4 && checkedIPv6) {
      callback(ipv4InUse || ipv6InUse);
    }
  };
  
  // 检查 IPv4 (127.0.0.1)
  const serverIPv4 = net.createServer();
  serverIPv4.listen(port, '127.0.0.1', () => {
    serverIPv4.once('close', () => {
      ipv4InUse = false;
      checkedIPv4 = true;
      checkComplete();
    });
    serverIPv4.close();
  });
  serverIPv4.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      ipv4InUse = true;
    }
    checkedIPv4 = true;
    checkComplete();
  });
  
  // 检查 IPv6 (::1)
  const serverIPv6 = net.createServer();
  serverIPv6.listen(port, '::1', () => {
    serverIPv6.once('close', () => {
      ipv6InUse = false;
      checkedIPv6 = true;
      checkComplete();
    });
    serverIPv6.close();
  });
  serverIPv6.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      ipv6InUse = true;
    }
    checkedIPv6 = true;
    checkComplete();
  });
  
  // 超时保护（5秒）
  setTimeout(() => {
    if (!checkedIPv4) {
      checkedIPv4 = true;
      checkComplete();
    }
    if (!checkedIPv6) {
      checkedIPv6 = true;
      checkComplete();
    }
  }, 5000);
}

// 查找占用指定端口的进程（跨平台）
function findProcessUsingPort(port, callback) {
  const { exec } = require('child_process');
  
  if (process.platform === 'win32') {
    // Windows: 使用 netstat
    exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
      if (error) {
        callback(null);
        return;
      }
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) {
            pids.add(pid);
          }
        }
      }
      callback(Array.from(pids));
    });
  } else {
    // macOS/Linux: 使用 lsof，尝试多种方法
    // 方法1: 使用 -ti 选项（最快）
    exec(`lsof -ti :${port}`, { timeout: 5000 }, (error1, stdout1) => {
      if (!error1 && stdout1 && stdout1.trim()) {
        const pids = stdout1.trim().split('\n').filter(pid => pid && pid.trim() && !isNaN(parseInt(pid)));
        if (pids.length > 0) {
          safeLog(`🔍 找到占用端口 ${port} 的进程: ${pids.join(', ')}`);
          callback(pids);
          return;
        }
      }
      
      // 方法2: 使用 -i 选项获取详细信息（如果方法1失败）
      exec(`lsof -i :${port}`, { timeout: 5000 }, (error2, stdout2) => {
        if (!error2 && stdout2 && stdout2.trim()) {
          const lines = stdout2.trim().split('\n').slice(1); // 跳过标题行
          const pids = new Set();
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              const pid = parts[1];
              if (pid && !isNaN(parseInt(pid))) {
                pids.add(pid);
              }
            }
          }
          if (pids.size > 0) {
            const pidArray = Array.from(pids);
            safeLog(`🔍 找到占用端口 ${port} 的进程: ${pidArray.join(', ')}`);
            callback(pidArray);
            return;
          }
        }
        
        // 如果都失败了，返回 null
        callback(null);
      });
    });
  }
}

// 杀死指定PID的进程
function killProcess(pid, callback) {
  const { exec } = require('child_process');
  
  if (process.platform === 'win32') {
    exec(`taskkill /PID ${pid} /F`, (error) => {
      callback(!error);
    });
  } else {
    exec(`kill -9 ${pid}`, (error) => {
      callback(!error);
    });
  }
}

// 清理占用端口的进程
async function cleanupPort(port) {
  return new Promise((resolve) => {
    checkPortInUse(port, (inUse) => {
      if (!inUse) {
        safeLog(`✅ 端口 ${port} 可用`);
        resolve(true);
        return;
      }
      
      safeLog(`⚠️  端口 ${port} 被占用，正在查找占用进程...`);
      findProcessUsingPort(port, (pids) => {
        if (!pids || pids.length === 0) {
          safeLog(`⚠️  无法找到占用端口 ${port} 的进程`);
          resolve(false);
          return;
        }
        
        safeLog(`🔍 找到 ${pids.length} 个占用端口的进程: ${pids.join(', ')}`);
        
        // 杀死所有占用端口的进程
        let killedCount = 0;
        const totalPids = pids.length;
        
        for (const pid of pids) {
          // 跳过当前进程和父进程
          if (pid === process.pid.toString() || pid === process.ppid?.toString()) {
            safeLog(`⚠️  跳过当前进程 PID: ${pid}`);
            killedCount++;
            if (killedCount === totalPids) {
              checkPortInUse(port, (stillInUse) => {
                resolve(!stillInUse);
              });
            }
            continue;
          }
          
          killProcess(pid, (success) => {
            if (success) {
              safeLog(`✅ 已终止进程 PID: ${pid}`);
            } else {
              safeLog(`⚠️  无法终止进程 PID: ${pid}`);
            }
            
            killedCount++;
            if (killedCount === totalPids) {
              // 等待一小段时间，让系统释放端口
              safeSetTimeout(() => {
                checkPortInUse(port, (stillInUse) => {
                  if (!stillInUse) {
                    safeLog(`✅ 端口 ${port} 已释放`);
                  } else {
                    safeLog(`⚠️  端口 ${port} 仍被占用`);
                  }
                  resolve(!stillInUse);
                });
              }, 1000);
            }
          });
        }
      });
    });
  });
}

// 检查后端是否已启动
function checkBackendReady(callback) {
  const http = require('http');
  const req = http.get(`http://localhost:${actualBackendPort}/api/health`, { timeout: 3000 }, (res) => {
    if (res.statusCode === 200) {
      callback(true);
    } else {
      callback(false);
    }
    res.on('data', () => {}); // 消费响应数据
    res.on('end', () => {});
  });
  req.on('error', () => callback(false));
  req.on('timeout', () => {
    req.destroy();
    callback(false);
  });
}

// 通知窗口后端已就绪（改进版：确保窗口准备好后才发送）
function notifyBackendReady() {
  backendReadyState = true; // 标记后端已就绪
  
  if (!mainWindow || isAppClosing) {
    safeLog('⚠️  窗口未准备好，缓存后端就绪状态');
    backendReadyNotificationPending = true;
    return;
  }
  
  // 检查窗口是否已经加载完成
  const webContents = mainWindow.webContents;
  if (!webContents || webContents.isDestroyed()) {
    safeLog('⚠️  窗口内容未准备好，缓存后端就绪状态');
    backendReadyNotificationPending = true;
    return;
  }
  
  // 尝试发送消息，如果失败则重试
  const sendReadyMessage = (attempt = 1) => {
    if (!mainWindow || isAppClosing || webContents.isDestroyed()) {
      return;
    }
    
    try {
      safeLog(`✅ 后端服务器已就绪，通知窗口 (尝试 ${attempt})`);
      webContents.send('backend-ready');
      backendReadyNotificationPending = false;
      
      // 额外发送一次，确保消息不丢失（延迟100ms）
      safeSetTimeout(() => {
        if (mainWindow && !isAppClosing && !webContents.isDestroyed()) {
          try {
            webContents.send('backend-ready');
          } catch (e) {
            // 忽略错误
          }
        }
      }, 100);
    } catch (error) {
      safeError('❌ 发送后端就绪消息失败:', error);
      if (attempt < 5) {
        // 重试，最多5次
        safeSetTimeout(() => sendReadyMessage(attempt + 1), 200);
      } else {
        backendReadyNotificationPending = true;
      }
    }
  };
  
  sendReadyMessage();
}

// 检查并发送待处理的后端就绪通知
function checkAndSendPendingReadyNotification() {
  if (backendReadyState && backendReadyNotificationPending && mainWindow && !isAppClosing) {
    const webContents = mainWindow.webContents;
    if (webContents && !webContents.isDestroyed()) {
      safeLog('📤 发送待处理的后端就绪通知');
      notifyBackendReady();
    }
  }
}

// 启动后端服务器 - 彻底重写版本
// REF: https://www.electronjs.org/docs/latest/api/process
async function startBackend() {
  // 如果正在启动中，跳过
  if (isBackendStarting) {
    safeLog('⚠️  后端正在启动中，跳过重复启动');
    return;
  }
  
  // 如果后端进程已存在，先停止它
  if (backendProcess) {
    safeLog('⚠️  后端进程已存在，先停止现有进程...');
    await stopBackend();
    // 等待进程完全退出
    await new Promise(resolve => safeSetTimeout(resolve, 1000));
  }
  
  // 检查重启次数限制
  if (backendRestartCount >= MAX_BACKEND_RESTARTS) {
    safeError(`❌ 后端重启次数已达上限 (${MAX_BACKEND_RESTARTS})，停止自动重启`);
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', 
        `后端服务器启动失败，已尝试 ${MAX_BACKEND_RESTARTS} 次。请检查日志并手动重启应用。`);
    }
    return;
  }
  
  isBackendStarting = true;
  backendRestartCount++;
  
  // 在启动前彻底清理端口
  safeLog(`🔧 准备启动后端服务器 (尝试 ${backendRestartCount}/${MAX_BACKEND_RESTARTS})...`);
  safeLog(`🔍 检查端口 ${BACKEND_PORT} 状态...`);
  
  // 先检查端口是否被占用
  const portInUse = await new Promise((resolve) => {
    checkPortInUse(BACKEND_PORT, (inUse) => {
      resolve(inUse);
    });
  });
  
  if (portInUse) {
    safeLog(`⚠️  端口 ${BACKEND_PORT} 被占用，开始清理...`);
    const portCleaned = await cleanupPort(BACKEND_PORT);
    if (!portCleaned) {
      safeError('⚠️  端口清理失败，但仍尝试启动后端...');
    } else {
      safeLog('✅ 端口清理成功');
    }
    // 等待端口完全释放
    await new Promise(resolve => safeSetTimeout(resolve, 1000));
    
    // 再次检查端口
    const stillInUse = await new Promise((resolve) => {
      checkPortInUse(BACKEND_PORT, (inUse) => {
        resolve(inUse);
      });
    });
    
    if (stillInUse) {
      safeError(`❌ 端口 ${BACKEND_PORT} 仍被占用，无法启动后端`);
      isBackendStarting = false;
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', 
          `端口 ${BACKEND_PORT} 被占用，无法启动后端服务器。请手动关闭占用端口的进程。`);
      }
      return;
    }
  } else {
    safeLog(`✅ 端口 ${BACKEND_PORT} 可用`);
  }
  
  // 再次确保后端进程不存在
  if (backendProcess) {
    safeLog('⚠️  检测到后端进程仍存在，强制清理...');
    await stopBackend();
    await new Promise(resolve => safeSetTimeout(resolve, 500));
  }

  // 在开发模式下，使用 npm run webui
  if (isDev) {
    const projectRoot = getProjectRoot();
    console.log(`🔧 开发模式：启动后端服务器`);
    console.log(`📁 项目根目录: ${projectRoot}`);
    
    // 验证项目根目录是否存在
    if (!validatePath(projectRoot, '项目根目录')) {
      console.error('❌ 无法启动后端：项目根目录不存在');
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', '项目根目录不存在');
      }
      return;
    }
    
    // 验证 package.json 是否存在
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!validatePath(packageJsonPath, 'package.json')) {
      console.error('❌ 无法启动后端：package.json 不存在');
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', 'package.json 不存在');
      }
      return;
    }
    
    // 在开发模式下，也使用应用数据目录的配置文件
    // 应用数据目录应该已经在 app.whenReady() 中初始化
    if (!appData) {
      console.error('❌ 应用数据目录未初始化，尝试初始化...');
      appData = initializeAppData();
      if (!appData) {
        console.error('❌ 无法初始化应用数据目录');
        if (mainWindow) {
          mainWindow.webContents.send('backend-error', '无法初始化应用数据目录');
        }
        return;
      }
    }
    
    // 在开发模式下，也设置 STATIC_PATH，以便后端可以提供静态文件服务
    // 前端构建目录在 webui-frontend/dist
    const frontendDistPath = path.join(__dirname, '..', 'dist');
    const staticPath = fs.existsSync(frontendDistPath) ? frontendDistPath : undefined;
    
    // 优化：检查是否已经构建过，如果已构建则直接运行，避免重复构建
    const backendDistPath = path.join(projectRoot, 'dist', 'webui', 'index.js');
    const needsBuild = !fs.existsSync(backendDistPath);
    
    if (needsBuild) {
      console.log(`🚀 执行命令: npm run webui (需要先构建)`);
    } else {
      console.log(`🚀 执行命令: node dist/webui/index.js (使用已构建的文件)`);
    }
    console.log(`📁 配置文件路径: ${appData.configPath}`);
    console.log(`📁 应用数据目录: ${appData.appDataDir}`);
    if (staticPath) {
      console.log(`📁 静态文件路径: ${staticPath}`);
      console.log(`📁 静态文件路径存在: ${fs.existsSync(staticPath)}`);
    } else {
      console.log(`⚠️  静态文件路径不存在，后端将只提供 API 服务`);
      console.log(`💡 提示: 前端应通过 Vite 开发服务器 (http://localhost:5173) 提供`);
    }
    
    const env = {
      ...process.env,
      STATIC_PATH: staticPath,
      PIXIV_DOWNLOADER_CONFIG: appData.configPath, // 在开发模式下也使用应用数据目录的配置文件
    };
    
    // 如果已经构建过，直接运行，避免重复构建
    try {
      if (!needsBuild) {
        safeLog(`🚀 启动后端: node ${backendDistPath}`);
        backendProcess = spawn('node', [backendDistPath], {
          cwd: projectRoot,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: env,
        });
      } else {
        safeLog(`🚀 启动后端: npm run webui`);
        backendProcess = spawn('npm', ['run', 'webui'], {
          cwd: projectRoot,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: env,
        });
      }
    } catch (error) {
      isBackendStarting = false;
      safeError('❌ 无法启动后端进程:', error);
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', `无法启动后端进程: ${error.message}`);
      }
      return;
    }
    
    if (!backendProcess) {
      isBackendStarting = false;
      safeError('❌ 后端进程创建失败');
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', '后端进程创建失败');
      }
      return;
    }
    
    // 监听后端进程输出，检测启动完成
    let backendReady = false;
    const checkReady = () => {
      if (!backendReady) {
        checkBackendReady((ready) => {
          if (ready && !backendReady) {
            backendReady = true;
            isBackendStarting = false; // 立即重置启动标志
            backendRestartCount = 0; // 重置重启计数
            safeLog('✅ 后端服务器启动成功');
            notifyBackendReady();
          }
        });
      }
    };
    
    // 定期检查后端是否就绪（最多60秒）
    let checkAttempts = 0;
    const maxCheckAttempts = 120; // 60秒
    const readyCheckInterval = safeSetInterval(() => {
      if (backendReady || isAppClosing) {
        clearInterval(readyCheckInterval);
        activeTimers.delete(readyCheckInterval);
        return;
      }
      checkAttempts++;
      checkReady();
      if (checkAttempts >= maxCheckAttempts) {
        clearInterval(readyCheckInterval);
        activeTimers.delete(readyCheckInterval);
        isBackendStarting = false; // 超时后也重置标志
        safeError('⚠️  后端服务器启动检查超时');
        if (mainWindow) {
          mainWindow.webContents.send('backend-error', '后端服务器启动超时，请检查日志');
        }
      }
    }, 500);
    
    // 输出后端进程的 stdout 和 stderr（用于调试）
    if (backendProcess.stdout) {
      backendProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[Backend] ${output}`);
          // 检测后端启动完成的关键字
          if (output.includes('Server started') || 
              output.includes('Server ready') ||
              output.includes('listening on') || 
              output.includes('WebUI server') ||
              output.includes('PORT:')) {
            // 延迟一点再检查，确保服务器完全启动
            safeSetTimeout(() => checkReady(), 1000);
          }
        }
      });
    }
    if (backendProcess.stderr) {
      backendProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.error(`[Backend Error] ${output}`);
        }
      });
    }
  } else {
    // 生产模式下，从 extraResources 加载后端
    // electron-builder 会将后端文件复制到 resources/dist
    // 直接使用 index.js，因为 dist/webui/package.json 明确指定了 "type": "commonjs"
    const backendPath = path.join(process.resourcesPath, 'dist', 'webui', 'index.js');
    // 向后兼容：如果 index.js 不存在，尝试 index.cjs
    const backendPathFallback = path.join(process.resourcesPath, 'dist', 'webui', 'index.cjs');
    let finalBackendPath = fs.existsSync(backendPath) ? backendPath : backendPathFallback;
    // 前端静态文件路径（在打包后的应用中）
    // 前端 dist 也在 extraResources 中，路径为 resources/webui-dist
    const staticPath = path.join(process.resourcesPath, 'webui-dist');
    
    console.log(`🔧 生产模式：启动后端服务器`);
    console.log(`📁 resourcesPath: ${process.resourcesPath}`);
    console.log(`📁 后端路径: ${finalBackendPath}`);
    console.log(`📁 静态文件路径: ${staticPath}`);
    
    // 验证后端文件是否存在
    if (!validatePath(finalBackendPath, '后端文件')) {
      console.error('❌ 无法启动后端：后端文件不存在');
      console.error('提示: 请确保构建时包含了后端文件');
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', '后端文件不存在，请重新构建应用');
      }
      return;
    }
    
    // 验证静态文件目录是否存在
    if (!validatePath(staticPath, '静态文件目录')) {
      console.error('❌ 无法启动后端：静态文件目录不存在');
      console.error('提示: 请确保构建时包含了前端静态文件');
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', '静态文件目录不存在，请重新构建应用');
      }
      return;
    }
    
    // 使用已初始化的应用数据目录（如果还没有初始化，则初始化）
    if (!appData) {
      appData = initializeAppData();
      if (!appData) {
        console.error('❌ 无法初始化应用数据目录');
        if (mainWindow) {
          mainWindow.webContents.send('backend-error', '无法初始化应用数据目录');
        }
        return;
      }
    }
    
    // 后端 node_modules 路径
    const backendNodeModules = path.join(process.resourcesPath, 'backend-node_modules');
    
    // 设置 NODE_PATH，让 Node.js 能找到后端依赖
    const nodePath = [
      backendNodeModules,
      process.env.NODE_PATH || '',
    ].filter(Boolean).join(path.delimiter);
    
    const backendExecutable = process.execPath;
    const backendEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      NODE_PATH: nodePath, // 设置 NODE_PATH 以加载后端依赖
      STATIC_PATH: staticPath,
      PORT: BACKEND_PORT.toString(),
      HOST: 'localhost',
      PIXIV_DOWNLOADER_CONFIG: appData.configPath, // 设置配置文件路径
    };

    safeLog(`🚀 启动后端进程: ${backendExecutable} ${finalBackendPath}`);
    safeLog(`📦 NODE_PATH: ${nodePath}`);
    safeLog(`📁 STATIC_PATH: ${staticPath}`);
    safeLog(`📁 配置文件路径: ${appData.configPath}`);
    safeLog(`📁 应用数据目录: ${appData.appDataDir}`);
    safeLog(`📁 ELECTRON_RUN_AS_NODE: ${backendEnv.ELECTRON_RUN_AS_NODE}`);
    safeLog(`📁 STATIC_PATH 存在: ${fs.existsSync(staticPath)}`);
    if (fs.existsSync(staticPath)) {
      safeLog(`📁 STATIC_PATH 内容: ${fs.readdirSync(staticPath).join(', ')}`);
    }
    
    try {
      backendProcess = spawn(backendExecutable, [finalBackendPath], {
        stdio: ['ignore', 'pipe', 'pipe'], // 使用 pipe 以便捕获输出
        cwd: appData.appDataDir, // 设置工作目录为应用数据目录
        env: backendEnv,
      });
    } catch (error) {
      isBackendStarting = false;
      safeError('❌ 无法启动后端进程:', error);
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', `无法启动后端进程: ${error.message}`);
      }
      return;
    }
    
    if (!backendProcess) {
      isBackendStarting = false;
      safeError('❌ 后端进程创建失败');
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', '后端进程创建失败');
      }
      return;
    }
    
    // 监听后端进程输出，检测启动完成
    let backendReady = false;
    let checkAttempts = 0; // 提前定义，供 checkReady 使用
    const checkReady = () => {
      if (!backendReady) {
        checkBackendReady((ready) => {
          if (ready && !backendReady) {
            backendReady = true;
            isBackendStarting = false; // 立即重置启动标志
            backendRestartCount = 0; // 重置重启计数
            safeLog('✅ 后端服务器启动成功，HTTP 健康检查通过');
            // 延迟一点再通知，确保后端完全就绪
            safeSetTimeout(() => {
              notifyBackendReady();
            }, 200);
          } else if (!ready && !backendReady && checkAttempts > 0 && checkAttempts % 10 === 0) {
            // 后端还未就绪，每5秒记录一次状态
            safeLog(`⏳ 等待后端就绪... (已等待 ${(checkAttempts * 0.5).toFixed(1)} 秒)`);
          }
        });
      }
    };
    
    // 定期检查后端是否就绪（最多60秒）
    const maxCheckAttempts = 120; // 60秒
    const readyCheckInterval = safeSetInterval(() => {
      if (backendReady || isAppClosing) {
        clearInterval(readyCheckInterval);
        activeTimers.delete(readyCheckInterval);
        return;
      }
      checkAttempts++;
      if (checkAttempts % 10 === 0) { // 每5秒记录一次
        safeLog(`🔍 检查后端就绪状态 (${checkAttempts}/${maxCheckAttempts})...`);
      }
      checkReady();
      if (checkAttempts >= maxCheckAttempts) {
        clearInterval(readyCheckInterval);
        activeTimers.delete(readyCheckInterval);
        isBackendStarting = false; // 超时后也重置标志
        safeError('⚠️  后端服务器启动检查超时');
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
          try {
            mainWindow.webContents.send('backend-error', '后端服务器启动超时，请检查日志');
          } catch (e) {
            safeError('发送错误消息失败:', e);
          }
        }
      }
    }, 500);
    
    // 输出后端进程的 stdout 和 stderr（用于调试）
    if (backendProcess.stdout) {
      backendProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[Backend] ${output}`);
          
          // 检测实际使用的端口号（格式：PORT: 3001 或 started on http://localhost:3001）
          const portMatch = output.match(/PORT:\s*(\d+)/i) || 
                           output.match(/started on http:\/\/[^:]+:(\d+)/i) ||
                           output.match(/listening on port\s*(\d+)/i) ||
                           output.match(/on port\s*(\d+)/i);
          if (portMatch && portMatch[1]) {
            const detectedPort = parseInt(portMatch[1], 10);
            if (detectedPort !== actualBackendPort) {
              actualBackendPort = detectedPort;
              safeLog(`🔍 检测到后端实际使用端口: ${actualBackendPort}`);
            }
          }
          
          // 检测后端启动完成的关键字
          if (output.includes('Server started') || 
              output.includes('Server ready') ||
              output.includes('listening on') || 
              output.includes('WebUI server') ||
              output.includes('PORT:') ||
              output.includes('started on port') ||
              output.includes('listening on port')) {
            safeLog('📢 检测到后端启动信号，准备检查就绪状态');
            // 延迟一点再检查，确保服务器完全启动
            safeSetTimeout(() => {
              safeLog('🔍 执行后端就绪检查...');
              checkReady();
            }, 1500);
          }
        }
      });
    }
    if (backendProcess.stderr) {
      backendProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.error(`[Backend Error] ${output}`);
        }
      });
    }
  }

  // 错误处理（必须在 spawn 之后设置）
  if (backendProcess) {
    backendProcess.on('error', (err) => {
      isBackendStarting = false;
      safeError('❌ 后端进程启动错误:', err);
      safeError('错误详情:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', err.message);
      }
      backendProcess = null;
      
      // 延迟后尝试重启
      if (!isAppClosing && backendRestartCount < MAX_BACKEND_RESTARTS) {
        safeSetTimeout(() => {
          if (!backendProcess && !isAppClosing) {
            startBackend();
          }
        }, 3000);
      }
    });

    backendProcess.on('exit', async (code, signal) => {
      isBackendStarting = false;
      
      // 清理端口（无论是否正常退出）
      safeLog('🧹 清理后端进程占用的端口...');
      await cleanupPort(BACKEND_PORT);
      await new Promise(resolve => safeSetTimeout(resolve, 500));
      
      if (code === 0) {
        safeLog('✅ 后端进程正常退出');
        backendRestartCount = 0; // 重置重启计数
      } else {
        safeError(`❌ 后端进程异常退出，退出码: ${code}, 信号: ${signal || '无'}`);
        
        // 检查退出原因，如果是端口占用错误，增加延迟时间
        const isPortError = code === 1 && signal === null; // 端口错误通常是退出码1
        
        // 如果不是主动退出且未达到重启限制，尝试重启
        if (code !== null && code !== 0 && !signal && !isAppClosing) {
          if (backendRestartCount < MAX_BACKEND_RESTARTS) {
            const delay = isPortError ? 5000 : 3000; // 端口错误时延迟更长时间
            safeLog(`⚠️  后端进程异常退出，将在 ${delay / 1000} 秒后尝试重启 (${backendRestartCount}/${MAX_BACKEND_RESTARTS})...`);
            safeSetTimeout(async () => {
              if (!backendProcess && !isAppClosing) {
                // 在重启前再次确保端口已释放
                const portInUse = await new Promise((resolve) => {
                  checkPortInUse(BACKEND_PORT, (inUse) => {
                    resolve(inUse);
                  });
                });
                if (portInUse) {
                  safeLog('⚠️  端口仍被占用，清理端口...');
                  await cleanupPort(BACKEND_PORT);
                  await new Promise(resolve => safeSetTimeout(resolve, 1000));
                }
                startBackend();
              }
            }, delay);
          } else {
            safeError(`❌ 后端重启次数已达上限，停止自动重启`);
            if (mainWindow) {
              mainWindow.webContents.send('backend-error', 
                `后端服务器启动失败，已尝试 ${MAX_BACKEND_RESTARTS} 次。请检查日志并手动重启应用。`);
            }
          }
        }
      }
      backendProcess = null;
    });
    
    // 注意：isBackendStarting 标志现在在 checkReady() 回调中重置
    // 这里不再需要额外的重置逻辑，因为启动检测已经在上面处理了
  }
  
  // 如果 backendProcess 为 null，说明启动失败，重置标志
  if (!backendProcess) {
    isBackendStarting = false;
  }
}

// 停止后端服务器
/**
 * 生成 PKCE code verifier
 */
function generateCodeVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成 PKCE code challenge
 */
function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 查找系统 Chrome/Chromium 可执行文件路径
 * 用于 Puppeteer 在 Electron 环境中的配置
 */
function findChromeExecutable() {
  const platform = process.platform;
  const possiblePaths = [];

  if (platform === 'darwin') {
    // macOS
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      path.join(os.homedir(), 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
    );
  } else if (platform === 'win32') {
    // Windows
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    
    possiblePaths.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Chromium', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Chromium', 'Application', 'chrome.exe')
    );
  } else if (platform === 'linux') {
    // Linux
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/local/bin/chrome',
      '/usr/local/bin/chromium'
    );
  }

  // 检查每个可能的路径
  for (const chromePath of possiblePaths) {
    try {
      if (fs.existsSync(chromePath)) {
        console.log(`✅ 找到 Chrome/Chromium: ${chromePath}`);
        return chromePath;
      }
    } catch (error) {
      // 忽略文件系统错误
    }
  }

  console.warn('⚠️  未找到系统 Chrome/Chromium，Puppeteer 将尝试使用默认路径');
  return null;
}

/**
 * 使用 pixiv-token-getter 进行登录（Electron 环境）
 * 这是推荐的登录方法，优先使用
 */
async function loginWithPixivTokenGetter(proxyConfig) {
  if (!pixivTokenGetter) {
    throw new Error('pixiv-token-getter 未安装，无法使用 pixiv-token-getter 登录');
  }

  try {
    console.log('🚀 开始使用 pixiv-token-getter 登录...');
    
    // 检查是否有适配器可用
    if (pixivTokenGetterAdapter && pixivTokenGetterAdapter.loginWithPixivTokenGetterInteractive) {
      console.log('📦 使用适配器进行登录...');
      const loginInfo = await pixivTokenGetterAdapter.loginWithPixivTokenGetterInteractive(proxyConfig);
      
      if (!loginInfo) {
        throw new Error('pixiv-token-getter 登录失败：返回结果为空');
      }
      
      // 转换格式以匹配 Electron 的期望格式
      return {
        success: true,
        data: {
          accessToken: loginInfo.access_token || loginInfo.accessToken,
          refreshToken: loginInfo.refresh_token || loginInfo.refreshToken,
          expiresIn: loginInfo.expires_in || loginInfo.expiresIn,
          tokenType: loginInfo.token_type || loginInfo.tokenType || 'bearer',
          user: loginInfo.user || {},
        },
      };
    } else {
      // 直接使用 pixiv-token-getter
      console.log('📦 直接使用 pixiv-token-getter 进行登录...');
      
      // 注意：pixiv-token-getter 不支持代理配置，但我们可以继续
      if (proxyConfig && proxyConfig.enabled) {
        console.warn('⚠️  pixiv-token-getter 不支持代理配置，将不使用代理');
      }
      
      const { getTokenInteractive } = pixivTokenGetter;
      const tokenInfo = await getTokenInteractive({
        headless: false,
        timeout: 300000, // 5 分钟
        onBrowserOpen: () => {
          console.log('🌐 浏览器已打开，请完成登录...');
        },
        onPageReady: (page, url) => {
          console.log(`📱 登录页面已就绪: ${url}`);
        },
      });
      
      // 转换格式
      const user = tokenInfo.user || {};
      return {
        success: true,
        data: {
          accessToken: tokenInfo.access_token,
          refreshToken: tokenInfo.refresh_token,
          expiresIn: tokenInfo.expires_in,
          tokenType: tokenInfo.token_type || 'bearer',
          user: {
            id: user.id || '',
            name: user.name || '',
            account: user.account || '',
            profile_image_urls: user.profile_image_urls || {
              px_16x16: '',
              px_50x50: '',
              px_170x170: '',
            },
            mail_address: user.mail_address || '',
            is_premium: user.is_premium || false,
            x_restrict: user.x_restrict || 0,
            is_mail_authorized: user.is_mail_authorized || false,
            require_policy_agreement: user.require_policy_agreement || false,
          },
        },
      };
    }
  } catch (error) {
    console.error('❌ pixiv-token-getter 登录失败:', error);
    throw error;
  }
}

/**
 * 使用 Puppeteer 进行登录（Electron 环境）
 */
async function loginWithPuppeteer(codeVerifier, codeChallenge, proxyConfig) {
  if (!puppeteer) {
    throw new Error('Puppeteer-core 未安装，无法使用 Puppeteer 登录');
  }

  let browser = null;
  
  try {
    console.log('🚀 开始使用 Puppeteer 登录...');
    
    // 构建登录 URL
    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    });
    const loginUrl = `${PIXIV_LOGIN_URL}?${loginParams.toString()}`;
    
    console.log('🌐 登录 URL:', loginUrl);
    
    // 配置 Puppeteer 启动选项
    const launchOptions = {
      headless: false, // 显示浏览器窗口
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
      ignoreHTTPSErrors: true,
    };
    
    // 尝试查找系统 Chrome
    const chromeExecutable = findChromeExecutable();
    if (chromeExecutable) {
      launchOptions.executablePath = chromeExecutable;
    }
    
    // 添加代理配置
    if (proxyConfig && proxyConfig.enabled) {
      const proxyUrl = buildProxyUrl(proxyConfig);
      if (proxyUrl) {
        launchOptions.args.push(`--proxy-server=${proxyUrl}`);
        console.log(`🔌 使用代理: ${proxyUrl}`);
      }
    }
    
    // 启动浏览器
    console.log('🌐 正在启动浏览器...');
    browser = await puppeteer.launch(launchOptions);
    puppeteerBrowser = browser; // 保存浏览器实例以便后续关闭
    console.log('✅ 浏览器已启动');
    
    const page = await browser.newPage();
    
    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 设置额外的 HTTP 头
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
    
    // 导航到登录页面
    console.log('📱 正在打开登录页面...');
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      console.log('⚠️  networkidle2 超时，尝试 domcontentloaded...');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    
    console.log('✅ 登录页面已打开');
    console.log('👤 请在浏览器窗口中完成登录...');
    
    // 等待授权码（最多 5 分钟）
    const code = await waitForAuthCodePuppeteer(page, 300000);
    
    if (!code) {
      // 再次尝试从当前 URL 提取 code
      const currentUrl = page.url();
      console.log(`🔍 当前页面 URL: ${currentUrl}`);
      
      try {
        const urlObj = new URL(currentUrl);
        const codeFromUrl = urlObj.searchParams.get('code');
        if (codeFromUrl) {
          console.log('✅ 从当前 URL 中找到授权码');
          const loginInfo = await exchangeCodeForToken(codeFromUrl, codeVerifier);
          await browser.close();
          browser = null;
          return loginInfo;
        }
      } catch (e) {
        // URL 解析失败
      }
      
      throw new Error('未能获取授权码。登录可能已取消或超时，请重试。');
    }
    
    console.log('✅ 授权码已获取');
    console.log('🔄 正在交换 token...');
    
    // 交换 code 获取 token
    const loginInfo = await exchangeCodeForToken(code, codeVerifier);
    
    console.log('✅ 登录成功！');
    
    // 关闭浏览器
    try {
      await browser.close();
      browser = null;
      puppeteerBrowser = null;
    } catch (e) {
      console.warn('⚠️  关闭浏览器时出错，但登录已成功');
    }
    
    return loginInfo;
  } catch (error) {
    console.error('❌ Puppeteer 登录失败:', error);
    
    // 清理资源
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // 忽略清理错误
      }
      puppeteerBrowser = null;
    }
    
    throw error;
  }
}

/**
 * 等待 Puppeteer 页面中的授权码
 */
function waitForAuthCodePuppeteer(page, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    let pollInterval = null;
    
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      try {
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (e) {
        // 忽略清理错误
      }
    };
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        console.log('⏱️  等待授权码超时');
        resolve(null);
      }
    }, timeoutMs);
    
    const checkUrlForCode = (url) => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          console.log('✅ 在 URL 中找到授权码');
          return code;
        }
      } catch (e) {
        // 无效 URL，忽略
      }
      return null;
    };
    
    // 立即检查当前 URL
    try {
      const currentUrl = page.url();
      const currentCode = checkUrlForCode(currentUrl);
      if (currentCode) {
        cleanup();
        clearTimeout(timeout);
        resolve(currentCode);
        return;
      }
    } catch (e) {
      // 继续使用监听器
    }
    
    // 监听响应事件
    const onResponse = async (response) => {
      if (resolved) return;
      try {
        const url = response.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // 忽略错误
      }
    };
    
    // 监听导航事件
    const onFrameNavigated = async (frame) => {
      if (resolved || frame !== page.mainFrame()) return;
      try {
        const url = frame.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // 忽略错误
      }
    };
    
    // 定期轮询 URL
    pollInterval = setInterval(async () => {
      if (resolved) {
        if (pollInterval) {
          clearInterval(pollInterval);
        }
        return;
      }
      
      try {
        const url = page.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // 忽略错误
      }
    }, 1000); // 每秒检查一次
    
    // 设置监听器
    page.on('response', onResponse);
    page.on('framenavigated', onFrameNavigated);
  });
}

/**
 * 使用授权码交换 token - 改进版本，添加重试机制和更详细的错误处理
 * REF: https://www.electronjs.org/docs/latest/api/net
 */
async function exchangeCodeForToken(code, codeVerifier, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2秒
  
  try {
    safeLog(`🔄 正在交换 token (尝试 ${retryCount + 1}/${MAX_RETRIES + 1})...`);
    
    const response = await axios.post(
      PIXIV_AUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: PIXIV_CLIENT_ID,
        client_secret: PIXIV_CLIENT_SECRET,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        include_policy: 'true',
        redirect_uri: PIXIV_REDIRECT_URI,
      }).toString(),
      {
        headers: {
          'user-agent': PIXIV_USER_AGENT,
          'app-os-version': '14.6',
          'app-os': 'ios',
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000,
        validateStatus: (status) => status >= 200 && status < 300, // 只接受 2xx 状态码
      }
    );
    
    // 验证响应数据
    if (!response.data) {
      throw new Error('Token 交换响应数据为空');
    }
    
    if (!response.data.access_token || !response.data.refresh_token) {
      throw new Error('Token 交换响应缺少必要的 token 字段');
    }
    
    safeLog('✅ Token 交换成功');
    
    return {
      success: true,
      data: {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type || 'bearer',
        scope: response.data.scope || '',
        user: response.data.user,
      },
    };
  } catch (error) {
    safeError('❌ Token 交换失败:', error.message);
    
    // 如果是网络错误且未达到最大重试次数，尝试重试
    if (retryCount < MAX_RETRIES) {
      const isNetworkError = 
        !error.response && 
        (error.code === 'ECONNABORTED' || 
         error.code === 'ETIMEDOUT' || 
         error.code === 'ENOTFOUND' ||
         error.message.includes('timeout') ||
         error.message.includes('Network Error'));
      
      if (isNetworkError) {
        safeLog(`🔄 网络错误，将在 ${RETRY_DELAY / 1000} 秒后重试...`);
        await new Promise(resolve => safeSetTimeout(resolve, RETRY_DELAY));
        return exchangeCodeForToken(code, codeVerifier, retryCount + 1);
      }
    }
    
    // 如果是 HTTP 错误，提供更详细的错误信息
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      const data = error.response.data;
      
      safeError(`   HTTP 状态: ${status} ${statusText}`);
      if (data) {
        safeError(`   响应数据: ${JSON.stringify(data)}`);
      }
      
      // 根据状态码提供更具体的错误信息
      if (status === 400) {
        throw new Error(`Token 交换失败: 请求参数错误 (${statusText})。授权码可能已过期或无效。`);
      } else if (status === 401) {
        throw new Error(`Token 交换失败: 认证失败 (${statusText})。请检查客户端 ID 和密钥。`);
      } else if (status === 500) {
        throw new Error(`Token 交换失败: 服务器错误 (${statusText})。请稍后重试。`);
      } else {
        throw new Error(`Token 交换失败: ${status} ${statusText}`);
      }
    }
    
    // 其他错误
    throw new Error(`Token 交换失败: ${error.message}`);
  }
}

/**
 * 从配置文件或环境变量读取代理配置
 * @returns {Object|null} 代理配置对象，如果没有配置则返回 null
 */
function getProxyConfig() {
  try {
    // 1. 优先从配置文件读取
    if (appData && appData.configPath && fs.existsSync(appData.configPath)) {
      try {
        const configContent = fs.readFileSync(appData.configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        if (config.network && config.network.proxy && config.network.proxy.enabled) {
          const proxy = config.network.proxy;
          if (proxy.host && proxy.port) {
            console.log('📖 [代理检测] 从配置文件读取代理配置:', {
              host: proxy.host,
              port: proxy.port,
              protocol: proxy.protocol || 'http'
            });
            return {
              enabled: true,
              host: proxy.host,
              port: proxy.port,
              protocol: proxy.protocol || 'http',
              username: proxy.username,
              password: proxy.password,
              source: 'config-file'
            };
          }
        }
      } catch (configError) {
        console.warn('⚠️  [代理检测] 读取配置文件失败:', configError.message);
      }
    }
    
    // 2. 从环境变量读取（优先级：all_proxy > https_proxy > http_proxy）
    let proxyUrl = null;
    let envVarName = null;
    
    if (process.env.all_proxy || process.env.ALL_PROXY) {
      proxyUrl = process.env.all_proxy || process.env.ALL_PROXY;
      envVarName = 'all_proxy';
    } else if (process.env.https_proxy || process.env.HTTPS_PROXY) {
      proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
      envVarName = 'https_proxy';
    } else if (process.env.http_proxy || process.env.HTTP_PROXY) {
      proxyUrl = process.env.http_proxy || process.env.HTTP_PROXY;
      envVarName = 'http_proxy';
    }
    
    if (proxyUrl) {
      try {
        const url = new URL(proxyUrl);
        const protocol = url.protocol.replace(':', '').toLowerCase();
        
        // 映射协议类型
        let mappedProtocol = 'http';
        if (protocol === 'socks5' || protocol === 'socks') {
          mappedProtocol = 'socks5';
        } else if (protocol === 'socks4') {
          mappedProtocol = 'socks4';
        } else if (protocol === 'https') {
          mappedProtocol = 'https';
        } else {
          mappedProtocol = 'http';
        }
        
        const port = parseInt(url.port || (protocol.startsWith('socks') ? '1080' : '8080'), 10);
        
        console.log('📖 [代理检测] 从环境变量读取代理配置:', {
          host: url.hostname,
          port: port,
          protocol: mappedProtocol,
          envVar: envVarName
        });
        
        return {
          enabled: true,
          host: url.hostname,
          port: port,
          protocol: mappedProtocol,
          username: url.username || undefined,
          password: url.password || undefined,
          source: 'environment'
        };
      } catch (urlError) {
        console.warn('⚠️  [代理检测] 解析环境变量代理URL失败:', urlError.message);
      }
    }
    
    console.log('ℹ️  [代理检测] 未检测到显式代理配置（配置文件或环境变量）');
    console.log('ℹ️  [代理检测] 将使用系统代理设置（如果已配置）');
    return null;
  } catch (error) {
    console.error('❌ [代理检测] 获取代理配置时发生错误:', error);
    return null;
  }
}

/**
 * 尝试常见的网络服务名称来检测代理
 * @param {Function} resolve Promise resolve 函数
 */
function tryCommonServices(resolve) {
  const { exec } = require('child_process');
  const commonServices = ['Wi-Fi', 'Ethernet', 'Thunderbolt Bridge'];
  let serviceIndex = 0;
  
  function tryNextService() {
    if (serviceIndex >= commonServices.length) {
      console.log('ℹ️  [系统代理检测-macOS] 所有常见服务名称都尝试失败');
      resolve(null);
      return;
    }
    
    const service = commonServices[serviceIndex];
    console.log(`🔍 [系统代理检测-macOS] 尝试服务名称: ${service}`);
    
    // 检测 HTTP 代理
    exec(`networksetup -getwebproxy "${service}"`, (httpError, httpStdout, httpStderr) => {
      if (!httpError && httpStdout && httpStdout.includes('Enabled: Yes')) {
        const hostMatch = httpStdout.match(/Server: (.+)/);
        const portMatch = httpStdout.match(/Port: (\d+)/);
        if (hostMatch && portMatch) {
          const host = hostMatch[1].trim();
          const port = parseInt(portMatch[1].trim(), 10);
          console.log(`✅ [系统代理检测-macOS] 在服务 "${service}" 上检测到 HTTP 代理:`, { host, port });
          resolve({
            enabled: true,
            host: host,
            port: port,
            protocol: 'http',
            source: 'system-macos'
          });
          return;
        }
      }
      
      // 检测 HTTPS 代理
      exec(`networksetup -getsecurewebproxy "${service}"`, (httpsError, httpsStdout, httpsStderr) => {
        if (!httpsError && httpsStdout && httpsStdout.includes('Enabled: Yes')) {
          const hostMatch = httpsStdout.match(/Server: (.+)/);
          const portMatch = httpsStdout.match(/Port: (\d+)/);
          if (hostMatch && portMatch) {
            const host = hostMatch[1].trim();
            const port = parseInt(portMatch[1].trim(), 10);
            console.log(`✅ [系统代理检测-macOS] 在服务 "${service}" 上检测到 HTTPS 代理:`, { host, port });
            resolve({
              enabled: true,
              host: host,
              port: port,
              protocol: 'https',
              source: 'system-macos'
            });
            return;
          }
        }
        
        // 检测 SOCKS 代理
        exec(`networksetup -getsocksfirewallproxy "${service}"`, (socksError, socksStdout, socksStderr) => {
          if (!socksError && socksStdout && socksStdout.includes('Enabled: Yes')) {
            const hostMatch = socksStdout.match(/Server: (.+)/);
            const portMatch = socksStdout.match(/Port: (\d+)/);
            if (hostMatch && portMatch) {
              const host = hostMatch[1].trim();
              const port = parseInt(portMatch[1].trim(), 10);
              console.log(`✅ [系统代理检测-macOS] 在服务 "${service}" 上检测到 SOCKS 代理:`, { host, port });
              resolve({
                enabled: true,
                host: host,
                port: port,
                protocol: 'socks5',
                source: 'system-macos'
              });
              return;
            }
          }
          
          // 尝试下一个服务
          serviceIndex++;
          tryNextService();
        });
      });
    });
  }
  
  tryNextService();
}

/**
 * 在 macOS 上使用系统命令检测代理设置
 * @returns {Promise<Object|null>} 检测到的系统代理配置，如果没有则返回 null
 */
async function detectSystemProxyMacOS() {
  return new Promise((resolve) => {
    try {
      const { exec } = require('child_process');
      const os = require('os');
      
      // 只在 macOS 上执行
      if (os.platform() !== 'darwin') {
        resolve(null);
        return;
      }
      
      // 获取当前网络服务（通常是 Wi-Fi 或以太网）
      exec('networksetup -listnetworkserviceorder', (error, stdout, stderr) => {
        if (error) {
          console.log('ℹ️  [系统代理检测-macOS] 无法获取网络服务列表:', error.message);
          // 如果无法获取网络服务列表，尝试使用常见的服务名称
          tryCommonServices(resolve);
          return;
        }
        
        // 解析网络服务名称
        // 格式示例:
        // (1) Wi-Fi
        //     (Hardware Port: Wi-Fi, Device: en0)
        // (2) Thunderbolt Bridge
        //     (Hardware Port: Thunderbolt Bridge, Device: bridge0)
        const lines = stdout.split('\n');
        const services = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          // 查找服务名称（通常在括号前的行）
          if (line && !line.startsWith('(') && !line.startsWith('*')) {
            const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
            // 如果下一行包含 Hardware Port，说明这是有效的网络服务
            if (nextLine.includes('Hardware Port:')) {
              services.push(line);
            }
          }
        }
        
        // 优先使用 Wi-Fi 或以太网
        let networkService = services.find(s => 
          s.toLowerCase().includes('wi-fi') || 
          s.toLowerCase().includes('ethernet') ||
          s.toLowerCase().includes('thunderbolt')
        ) || services[0];
        
        if (!networkService) {
          // 如果没有找到，尝试使用常见的服务名称
          console.log('ℹ️  [系统代理检测-macOS] 无法从网络服务列表解析服务名称，尝试常见服务名称');
          tryCommonServices(resolve);
          return;
        }
        
        console.log(`🔍 [系统代理检测-macOS] 检测网络服务: ${networkService}`);
        console.log(`ℹ️  [系统代理检测-macOS] 可用服务列表: ${services.join(', ')}`);
        
        // 检测 HTTP 代理
        exec(`networksetup -getwebproxy "${networkService}"`, (httpError, httpStdout, httpStderr) => {
          if (!httpError && httpStdout) {
            const httpEnabled = httpStdout.includes('Enabled: Yes');
            if (httpEnabled) {
              const hostMatch = httpStdout.match(/Server: (.+)/);
              const portMatch = httpStdout.match(/Port: (\d+)/);
              
              if (hostMatch && portMatch) {
                const host = hostMatch[1].trim();
                const port = parseInt(portMatch[1].trim(), 10);
                
                console.log('✅ [系统代理检测-macOS] 检测到 HTTP 代理:', { host, port });
                resolve({
                  enabled: true,
                  host: host,
                  port: port,
                  protocol: 'http',
                  source: 'system-macos'
                });
                return;
              }
            }
          }
          
          // 检测 HTTPS 代理
          exec(`networksetup -getsecurewebproxy "${networkService}"`, (httpsError, httpsStdout, httpsStderr) => {
            if (!httpsError && httpsStdout) {
              const httpsEnabled = httpsStdout.includes('Enabled: Yes');
              if (httpsEnabled) {
                const hostMatch = httpsStdout.match(/Server: (.+)/);
                const portMatch = httpsStdout.match(/Port: (\d+)/);
                
                if (hostMatch && portMatch) {
                  const host = hostMatch[1].trim();
                  const port = parseInt(portMatch[1].trim(), 10);
                  
                  console.log('✅ [系统代理检测-macOS] 检测到 HTTPS 代理:', { host, port });
                  resolve({
                    enabled: true,
                    host: host,
                    port: port,
                    protocol: 'https',
                    source: 'system-macos'
                  });
                  return;
                }
              }
            }
            
            // 检测 SOCKS 代理
            exec(`networksetup -getsocksfirewallproxy "${networkService}"`, (socksError, socksStdout, socksStderr) => {
              if (!socksError && socksStdout) {
                const socksEnabled = socksStdout.includes('Enabled: Yes');
                if (socksEnabled) {
                  const hostMatch = socksStdout.match(/Server: (.+)/);
                  const portMatch = socksStdout.match(/Port: (\d+)/);
                  
                  if (hostMatch && portMatch) {
                    const host = hostMatch[1].trim();
                    const port = parseInt(portMatch[1].trim(), 10);
                    
                    console.log('✅ [系统代理检测-macOS] 检测到 SOCKS 代理:', { host, port });
                    resolve({
                      enabled: true,
                      host: host,
                      port: port,
                      protocol: 'socks5',
                      source: 'system-macos'
                    });
                    return;
                  }
                }
              }
              
              // 没有检测到任何代理
              console.log('ℹ️  [系统代理检测-macOS] 未检测到系统代理设置');
              resolve(null);
            });
          });
        });
      });
    } catch (error) {
      console.warn('⚠️  [系统代理检测-macOS] 检测系统代理时出错:', error.message);
      resolve(null);
    }
  });
}

/**
 * 检测系统代理设置
 * @param {Session} session Electron session 对象
 * @returns {Promise<Object|null>} 检测到的系统代理配置，如果没有则返回 null
 */
async function detectSystemProxy(session) {
  try {
    console.log('🔍 [系统代理检测] 开始检测系统代理设置...');
    
    // 方法1: 在 macOS 上使用系统命令检测（更可靠）
    const os = require('os');
    if (os.platform() === 'darwin') {
      console.log('🔍 [系统代理检测] 使用 macOS 系统命令检测...');
      const macOSProxy = await detectSystemProxyMacOS();
      if (macOSProxy) {
        console.log('✅ [系统代理检测] 通过 macOS 系统命令检测到代理:', macOSProxy);
        return macOSProxy;
      }
    }
    
    // 方法2: 使用 resolveProxy 检测系统代理（跨平台）
    console.log('🔍 [系统代理检测] 使用 resolveProxy 检测系统代理...');
    const testUrls = [
      'https://www.pixiv.net',
      'http://www.pixiv.net',
      'https://app-api.pixiv.net'
    ];
    
    for (const testUrl of testUrls) {
      try {
        const proxyResult = await session.resolveProxy(testUrl);
        
        console.log(`🔍 [系统代理检测] resolveProxy(${testUrl}) 结果:`, proxyResult);
        
        if (proxyResult && proxyResult !== 'DIRECT' && proxyResult.trim() !== 'DIRECT') {
          // 解析代理结果
          // 格式可能是: "PROXY 127.0.0.1:7890" 或 "SOCKS5 127.0.0.1:1080" 或 "PROXY 127.0.0.1:6152"
          // 也可能包含多个代理: "PROXY 127.0.0.1:7890; SOCKS5 127.0.0.1:1080"
          const proxyStrings = proxyResult.split(';').map(s => s.trim());
          
          for (const proxyString of proxyStrings) {
            if (proxyString === 'DIRECT' || proxyString === '') {
              continue;
            }
            
            const parts = proxyString.split(/\s+/);
            if (parts.length >= 2) {
              const proxyType = parts[0].toUpperCase();
              const proxyAddr = parts[1];
              
              // 解析地址和端口
              const [host, portStr] = proxyAddr.split(':');
              const port = parseInt(portStr || '8080', 10);
              
              // 确定协议
              let protocol = 'http';
              if (proxyType === 'SOCKS5' || proxyType === 'SOCKS') {
                protocol = 'socks5';
              } else if (proxyType === 'SOCKS4') {
                protocol = 'socks4';
              } else if (proxyType === 'HTTPS') {
                protocol = 'https';
              } else if (proxyType === 'PROXY') {
                // HTTP 代理
                protocol = 'http';
              }
              
              console.log('✅ [系统代理检测] 通过 resolveProxy 检测到系统代理:', {
                type: proxyType,
                host: host,
                port: port,
                protocol: protocol,
                raw: proxyResult,
                testUrl: testUrl
              });
              
              // 返回第一个有效的代理配置
              return {
                enabled: true,
                host: host,
                port: port,
                protocol: protocol,
                source: 'system'
              };
            }
          }
        }
      } catch (urlError) {
        console.warn(`⚠️  [系统代理检测] 检测 ${testUrl} 时出错:`, urlError.message);
      }
    }
    
    console.log('ℹ️  [系统代理检测] 未检测到系统代理设置（resolveProxy 返回 DIRECT）');
    console.log('ℹ️  [系统代理检测] 注意: Electron 仍可能自动使用系统代理设置（即使 resolveProxy 返回 DIRECT）');
    console.log('ℹ️  [系统代理检测] Electron 默认会使用系统代理设置，无需手动配置');
    return null;
  } catch (error) {
    console.warn('⚠️  [系统代理检测] 检测系统代理时出错:', error.message);
    return null;
  }
}

/**
 * 构建代理 URL 字符串
 * @param {Object} proxyConfig 代理配置对象
 * @returns {string} 代理 URL 字符串
 */
function buildProxyUrl(proxyConfig) {
  if (!proxyConfig || !proxyConfig.enabled || !proxyConfig.host || !proxyConfig.port) {
    return '';
  }
  
  const protocol = proxyConfig.protocol || 'http';
  const host = proxyConfig.host;
  const port = proxyConfig.port;
  
  // 构建代理 URL
  let proxyUrl = `${protocol}://`;
  
  // 如果有用户名和密码，添加到 URL 中
  if (proxyConfig.username && proxyConfig.password) {
    proxyUrl += `${encodeURIComponent(proxyConfig.username)}:${encodeURIComponent(proxyConfig.password)}@`;
  }
  
  proxyUrl += `${host}:${port}`;
  
  return proxyUrl;
}

/**
 * 创建登录窗口 - 彻底重写版本
 * 使用多重机制确保100%捕获授权码
 */
/**
 * @deprecated 此函数已被废弃，不再使用
 * 新的登录方案使用系统浏览器 + 授权码输入对话框
 * 保留此函数仅供参考，可能在将来移除
 */
function createLoginWindow(codeVerifier, codeChallenge) {
  // 如果已有登录窗口，先关闭
  if (loginWindow) {
    loginWindow.close();
  }

  // 保存 code verifier 供回调使用
  currentLoginCodeVerifier = codeVerifier;
  isProcessingAuthCode = false; // 重置处理标志

  // 构建登录 URL
  const loginParams = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    client: 'pixiv-android',
  });
  const loginUrl = `${PIXIV_LOGIN_URL}?${loginParams.toString()}`;

  console.log('🚀 创建登录窗口，URL:', loginUrl);

  // 创建登录窗口
  console.log('📝 正在创建登录窗口...');
  loginWindow = new BrowserWindow({
    width: 900,
    height: 700,
    // 移除 parent 和 modal，确保窗口可以正常显示
    // parent: mainWindow,
    // modal: true,
    show: false, // 先不显示，等页面加载完成后再显示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 禁用 webSecurity 以允许加载 Pixiv 登录页面
      allowRunningInsecureContent: true,
      enableRemoteModule: false,
    },
    title: 'Pixiv 登录',
    autoHideMenuBar: true, // 自动隐藏菜单栏
  });
  
  console.log('✅ 登录窗口已创建，窗口ID:', loginWindow.id);
  
  // 定义加载状态变量（需要在所有回调之前定义，以便回调可以访问）
  let loadAttempts = 0;
  const maxLoadAttempts = 5; // 增加重试次数
  let urlLoaded = false; // 标记 URL 是否已加载
  let isCurrentlyLoading = false; // 防止并发加载
  let failLoadRetryCount = 0;
  const maxFailLoadRetries = 3;
  let redirectDetectedInCurrentLoad = false; // 当前加载是否检测到重定向
  let redirectUrlToLoad = null; // 待加载的重定向URL
  
  // 先加载一个加载页面，改善用户体验
  const loadingPageHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';">
  <title>Pixiv 登录 - 加载中...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
    }
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h1 { margin: 0 0 10px 0; font-size: 24px; font-weight: 600; }
    .status { margin: 10px 0; opacity: 0.9; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Pixiv 登录</h1>
    <div class="status" id="status">正在加载登录页面...</div>
  </div>
  <script>
    console.log('[登录窗口] 加载页面已显示');
  </script>
</body>
</html>`;
  
  // 先加载加载页面
  loginWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingPageHTML)}`);
  console.log('📄 已加载初始加载页面');
  
  // 在开发模式下打开开发者工具，方便调试
  if (isDev) {
    loginWindow.webContents.openDevTools();
    console.log('🔧 开发模式：已打开开发者工具');
  }
  
  // 获取session用于拦截请求
  const session = loginWindow.webContents.session;
  
  // 在加载 URL 之前设置 User-Agent（重要！）
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  loginWindow.webContents.setUserAgent(userAgent);
  
  // 读取并设置代理配置（在设置 User-Agent 之后）
  // 注意：代理设置必须在加载任何 URL 之前完成
  // 使用 Promise 保存代理设置状态，确保在加载真实 URL 前代理已设置
  let proxySetupPromise = (async () => {
    try {
      console.log('🔍 [代理设置] 开始检测代理配置...');
      
      // 1. 首先检查配置文件和环境变量
      let proxyConfig = getProxyConfig();
      
      // 2. 如果没有显式配置，尝试检测系统代理
      if (!proxyConfig) {
        console.log('🔍 [代理设置] 尝试检测系统代理设置...');
        const systemProxy = await detectSystemProxy(session);
        if (systemProxy) {
          proxyConfig = systemProxy;
          console.log('✅ [代理设置] 检测到系统代理，将使用系统代理设置');
        }
      }
      
      if (proxyConfig) {
        console.log('🌐 [代理设置] 检测到代理配置，来源:', proxyConfig.source || 'unknown');
        console.log('🌐 [代理设置] 代理详情:', {
          host: proxyConfig.host,
          port: proxyConfig.port,
          protocol: proxyConfig.protocol
        });
        
        // 如果是系统代理（通过系统命令或 resolveProxy 检测到的），不设置 proxyRules，让 Electron 自动使用系统代理
        if (proxyConfig.source === 'system' || proxyConfig.source === 'system-macos') {
          console.log('ℹ️  [代理设置] 检测到系统代理，Electron 将自动使用系统代理设置');
          console.log('ℹ️  [代理设置] 系统代理信息:', {
            host: proxyConfig.host,
            port: proxyConfig.port,
            protocol: proxyConfig.protocol
          });
          // 不调用 setProxy，Electron 默认会使用系统代理
          // 这样可以确保 Electron 使用系统的完整代理配置（包括 PAC 脚本、代理规则等）
          return { success: true, source: proxyConfig.source, config: proxyConfig };
        } else {
          // 对于配置文件或环境变量的代理，需要显式设置
          const proxyUrl = buildProxyUrl(proxyConfig);
          
          try {
            // 设置代理（等待设置完成）
            await session.setProxy({
              proxyRules: proxyUrl,
              proxyBypassRules: 'localhost,127.0.0.1,::1' // 本地地址不走代理
            });
            console.log('✅ [代理设置] 代理设置成功:', proxyUrl);
            return { success: true, source: proxyConfig.source, config: proxyConfig };
          } catch (proxyError) {
            console.error('❌ [代理设置] 代理设置失败:', proxyError);
            console.error('   错误详情:', proxyError.message);
            console.log('ℹ️  [代理设置] 将回退到使用系统代理或直连');
            // 即使代理设置失败，也继续执行（可能使用系统代理）
            return { success: false, source: proxyConfig.source, error: proxyError.message };
          }
        }
      } else {
        console.log('ℹ️  [代理设置] 未检测到任何代理配置（配置文件、环境变量或系统代理）');
        console.log('ℹ️  [代理设置] Electron 将自动使用系统代理设置（如果已配置）或直连');
        console.log('ℹ️  [代理设置] 注意: 即使没有检测到代理配置，Electron 也会自动使用系统代理设置');
        // 如果没有配置代理，Electron 默认会使用系统代理设置
        return { success: true, source: 'system-auto', config: null };
      }
    } catch (error) {
      console.error('❌ [代理设置] 读取代理配置失败:', error);
      console.log('ℹ️  [代理设置] 将使用系统代理或直连');
      // 即使代理配置读取失败，也继续执行，使用系统代理或直连
      return { success: false, source: 'error', error: error.message };
    }
  })();
  
  // 将代理设置 Promise 保存到窗口对象，以便在加载真实 URL 前检查
  loginWindow._proxySetupPromise = proxySetupPromise;

  // 设置额外的请求头，使请求看起来更像真实浏览器
  const requestFilter = { urls: ['*://*/*'] };
  
  // 在发送请求前修改请求头
  session.webRequest.onBeforeSendHeaders(requestFilter, (details, callback) => {
    const headers = details.requestHeaders || {};
    
    // 确保 User-Agent 正确设置
    headers['User-Agent'] = userAgent;
    
    // 添加其他浏览器请求头
    if (!headers['Accept']) {
      headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
    }
    if (!headers['Accept-Language']) {
      headers['Accept-Language'] = 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7';
    }
    if (!headers['Accept-Encoding']) {
      headers['Accept-Encoding'] = 'gzip, deflate, br';
    }
    if (!headers['Sec-Fetch-Dest']) {
      headers['Sec-Fetch-Dest'] = 'document';
    }
    if (!headers['Sec-Fetch-Mode']) {
      headers['Sec-Fetch-Mode'] = 'navigate';
    }
    if (!headers['Sec-Fetch-Site']) {
      headers['Sec-Fetch-Site'] = 'none';
    }
    if (!headers['Sec-Fetch-User']) {
      headers['Sec-Fetch-User'] = '?1';
    }
    if (!headers['Upgrade-Insecure-Requests']) {
      headers['Upgrade-Insecure-Requests'] = '1';
    }
    
    console.log('📤 [请求头]', details.url.substring(0, 100), 'Headers:', Object.keys(headers).join(', '));
    
    callback({ requestHeaders: headers });
  });

  // ========== 方案1: 拦截所有网络请求和响应 ==========
  // 这是最可靠的方法，可以捕获所有HTTP请求和重定向
  
  // 拦截重定向（最关键的拦截点）
  session.webRequest.onBeforeRedirect(requestFilter, (details) => {
    if (details.redirectURL) {
      console.log('🔍 [拦截-重定向]', details.redirectURL);
      checkForCallbackUrl(details.redirectURL);
    }
  });

  // 拦截响应头（可能包含Location头）
  session.webRequest.onHeadersReceived(requestFilter, (details) => {
    // 只检查窗口是否存在，不检查可见性（加载阶段窗口可能还没显示）
    if (!loginWindow || loginWindow.isDestroyed()) {
      return;
    }
    
    if (details.responseHeaders) {
      const location = details.responseHeaders['location'] || details.responseHeaders['Location'];
      if (location && location.length > 0) {
        const locationUrl = Array.isArray(location) ? location[0] : location;
        console.log('🔍 [拦截-响应头]', locationUrl);
        
        // 如果检测到重定向到登录页面，记录重定向URL但不立即加载
        // 让浏览器自然处理重定向，这样更可靠
        if (locationUrl.includes('accounts.pixiv.net/login') && !urlLoaded) {
          console.log('✅ [响应头处理] 检测到登录页面重定向:', locationUrl);
          
          // 确保URL是完整的（如果不是，需要处理相对路径）
          let redirectUrl = locationUrl;
          if (!redirectUrl.startsWith('http')) {
            try {
              redirectUrl = new URL(redirectUrl, details.url).href;
            } catch (e) {
              console.warn('⚠️  [响应头处理] URL解析失败:', e.message);
              redirectUrl = locationUrl;
            }
          }
          
          // 防止重复处理
          if (redirectUrlToLoad === redirectUrl) {
            console.log('⚠️  [响应头处理] 重定向URL已记录，跳过');
            return;
          }
          
          // 只记录重定向URL，不立即加载
          // 让浏览器的重定向机制自然处理，这样更可靠
          redirectUrlToLoad = redirectUrl;
          redirectDetectedInCurrentLoad = true;
          
          console.log('ℹ️  [响应头处理] 已记录重定向URL，等待浏览器自然重定向...');
          
          // 设置一个超时，如果浏览器没有自动重定向，再手动加载
          setTimeout(() => {
            if (loginWindow && !loginWindow.isDestroyed()) {
              const currentUrl = loginWindow.webContents.getURL();
              // 如果当前URL还不是登录页面，且重定向URL已记录，则手动加载
              if (!currentUrl.includes('accounts.pixiv.net/login') && redirectUrlToLoad) {
                console.log('⚠️  [响应头处理] 浏览器未自动重定向，手动加载登录页面:', redirectUrlToLoad);
                loginWindow.webContents.loadURL(redirectUrlToLoad, {
                  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  extraHeaders: 'Accept-Language: en-US,en;q=0.9\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8\n'
                }).then(() => {
                  console.log('✅ [响应头处理] 手动加载登录页面成功');
                  urlLoaded = true;
                  isCurrentlyLoading = false;
                  // 清除超时
                  if (currentLoadTimeout) {
                    clearTimeout(currentLoadTimeout);
                    currentLoadTimeout = null;
                  }
                  // 显示窗口
                  if (!loginWindow.isVisible()) {
                    loginWindow.show();
                  }
                }).catch((err) => {
                  console.error('❌ [响应头处理] 手动加载登录页面失败:', err.message);
                  // 如果加载失败，清除重定向URL记录，允许重试原始URL
                  urlLoaded = false;
                  isCurrentlyLoading = false;
                  redirectUrlToLoad = null;
                  redirectDetectedInCurrentLoad = false;
                  // 重试原始URL
                  if (loadAttempts < maxLoadAttempts) {
                    console.log('🔄 [响应头处理] 将重试加载原始URL...');
                    setTimeout(() => {
                      if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded) {
                        tryLoadURL();
                      }
                    }, 2000);
                  }
                });
              } else if (currentUrl.includes('accounts.pixiv.net/login')) {
                // 浏览器已经自动重定向了
                console.log('✅ [响应头处理] 浏览器已自动重定向到登录页面');
                urlLoaded = true;
                isCurrentlyLoading = false;
                if (currentLoadTimeout) {
                  clearTimeout(currentLoadTimeout);
                  currentLoadTimeout = null;
                }
              }
            }
          }, 1000); // 等待1秒，给浏览器时间自动处理重定向
        }
        
        checkForCallbackUrl(locationUrl);
      }
    }
    // 也检查响应URL本身
    if (details.url) {
      checkForCallbackUrl(details.url);
    }
  });

  // 拦截所有请求URL
  session.webRequest.onBeforeRequest(requestFilter, (details) => {
    if (details.url) {
      // 只检查包含callback或code的URL，减少日志噪音
      if (details.url.includes('callback') || details.url.includes('code=') || details.url.includes('error=')) {
        console.log('🔍 [拦截-请求]', details.url);
        checkForCallbackUrl(details.url);
      }
    }
  });

  // ========== 方案2: 监听Electron导航事件 ==========
  loginWindow.webContents.on('did-navigate', (event, url) => {
    console.log('🔍 [导航]', url);
    // 检查是否是回调URL
    if (url.includes('callback') || url.includes('code=') || url.includes('error=')) {
      console.log('🎯 检测到可能的回调URL！');
      console.log('   完整URL:', url);
    }
    checkForCallbackUrl(url);
  });

  loginWindow.webContents.on('did-navigate-in-page', (event, url) => {
    console.log('🔍 [页面内导航]', url);
    // 检查是否是回调URL
    if (url.includes('callback') || url.includes('code=') || url.includes('error=')) {
      console.log('🎯 检测到可能的回调URL（页面内导航）！');
      console.log('   完整URL:', url);
    }
    checkForCallbackUrl(url);
  });

  loginWindow.webContents.on('did-get-response-details', (event, status, newURL, originalURL, httpResponseCode) => {
    if (newURL) {
      // 检查是否是回调URL
      if (newURL.includes('callback') || newURL.includes('code=') || newURL.includes('error=')) {
        console.log('🎯 检测到可能的回调URL（响应详情）！');
        console.log('   完整URL:', newURL);
        console.log('   状态码:', httpResponseCode);
        console.log('   原始URL:', originalURL);
      }
      checkForCallbackUrl(newURL);
    }
  });

  // 监听加载开始
  loginWindow.webContents.on('did-start-loading', () => {
    const currentUrl = loginWindow.webContents.getURL();
    console.log('🔄 [开始加载]', currentUrl);
  });

  // 监听控制台消息
  loginWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) { // 只显示警告和错误
      console.log(`📢 [控制台 ${level === 2 ? '警告' : '错误'}]`, message, `(${sourceId}:${line})`);
    }
  });

  // 监听加载停止（可能是成功或失败）
  loginWindow.webContents.on('did-stop-loading', () => {
    const currentUrl = loginWindow.webContents.getURL();
    console.log('⏹️  [停止加载]', currentUrl);
    
    // 检查页面内容
    loginWindow.webContents.executeJavaScript(`
      (function() {
        try {
          return {
            url: window.location.href,
            title: document.title,
            bodyText: document.body ? document.body.innerText.substring(0, 100) : 'no body',
            bodyHTML: document.body ? document.body.innerHTML.substring(0, 200) : 'no body',
            readyState: document.readyState,
            hasContent: document.body && document.body.children.length > 0,
            scripts: Array.from(document.scripts).length,
            stylesheets: Array.from(document.styleSheets).length
          };
        } catch(e) {
          return { error: e.message };
        }
      })();
    `).then(result => {
      console.log('📄 [页面状态]', JSON.stringify(result, null, 2));
    }).catch(err => {
      console.log('⚠️  [无法获取页面状态]', err.message);
    });
  });

  // ========== 方案3: 页面加载完成后注入JavaScript监听 ==========
  loginWindow.webContents.on('did-finish-load', () => {
    const currentUrl = loginWindow.webContents.getURL();
    console.log('✅ [加载完成]', currentUrl);
    // 检查是否是回调URL
    if (currentUrl.includes('callback') || currentUrl.includes('code=') || currentUrl.includes('error=')) {
      console.log('🎯 检测到可能的回调URL（加载完成）！');
      console.log('   完整URL:', currentUrl);
    }
    checkForCallbackUrl(currentUrl);

    // 注入JavaScript代码，在页面中监听URL变化
    loginWindow.webContents.executeJavaScript(`
      (function() {
        console.log('[注入脚本] 开始监听URL变化...');
        
        // 立即检查当前URL
        if (window.location.href) {
          console.log('[注入脚本] 当前URL:', window.location.href);
          // 通过postMessage通知主进程（如果可能）
        }
        
        // 监听popstate事件（浏览器前进/后退）
        window.addEventListener('popstate', function() {
          console.log('[注入脚本] popstate:', window.location.href);
        });
        
        // 监听hashchange事件
        window.addEventListener('hashchange', function() {
          console.log('[注入脚本] hashchange:', window.location.href);
        });
        
        // 重写pushState和replaceState以捕获所有URL变化
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function() {
          originalPushState.apply(history, arguments);
          console.log('[注入脚本] pushState:', window.location.href);
        };
        
        history.replaceState = function() {
          originalReplaceState.apply(history, arguments);
          console.log('[注入脚本] replaceState:', window.location.href);
        };
        
        // 定期检查URL变化（每100ms）
        let lastUrl = window.location.href;
        setInterval(function() {
          const currentUrl = window.location.href;
          if (currentUrl !== lastUrl) {
            console.log('[注入脚本] URL变化:', lastUrl, '->', currentUrl);
            lastUrl = currentUrl;
          }
        }, 100);
      })();
    `).catch(err => {
      // 忽略注入失败（某些页面可能不允许注入）
      console.log('⚠️  无法注入脚本（可能被CSP阻止）:', err.message);
    });
  });

  // ========== 方案4: 高频轮询检查（每100ms） ==========
  // 清除之前的定时器
  if (loginUrlCheckInterval) {
    clearInterval(loginUrlCheckInterval);
    loginUrlCheckInterval = null;
  }
  
  // 使用更频繁的轮询（每100ms）
  loginUrlCheckInterval = safeSetInterval(() => {
    if (loginWindow && !loginWindow.isDestroyed() && !isProcessingAuthCode) {
      try {
        const currentUrl = loginWindow.webContents.getURL();
        if (currentUrl && currentUrl !== 'about:blank' && currentUrl.startsWith('http')) {
          // 只检查包含callback或code的URL，减少检查频率
          if (currentUrl.includes('callback') || currentUrl.includes('code=') || currentUrl.includes('error=')) {
            checkForCallbackUrl(currentUrl);
          }
        }
      } catch (error) {
        // 忽略错误
      }
    } else if (!loginWindow || loginWindow.isDestroyed()) {
      // 窗口已关闭，清除定时器
      if (loginUrlCheckInterval) {
        clearInterval(loginUrlCheckInterval);
        loginUrlCheckInterval = null;
      }
    }
  }, 100); // 每100ms检查一次

  // ========== 方案5: 监听DOMContentLoaded和所有页面事件 ==========
  loginWindow.webContents.on('dom-ready', () => {
    const currentUrl = loginWindow.webContents.getURL();
    console.log('🔍 [DOM就绪]', currentUrl);
    checkForCallbackUrl(currentUrl);
  });

  // 加载登录页面（User-Agent 已在上面设置）
  console.log('📥 准备加载登录页面:', loginUrl);
  
  // 使用更可靠的加载方式，添加重试机制
  // 注意：状态变量已在上面定义
  
  // 清除之前的超时计时器（如果存在）
  if (currentLoadTimeout) {
    clearTimeout(currentLoadTimeout);
    currentLoadTimeout = null;
  }
  
  const tryLoadURL = () => {
    // 如果已经检测到重定向URL，不再重试原始URL
    if (redirectUrlToLoad) {
      console.log('⚠️  已检测到重定向URL，跳过原始URL加载');
      return;
    }
    
    // 防止并发加载
    if (isCurrentlyLoading) {
      console.log('⚠️  正在加载中，跳过重复请求');
      return;
    }
    
    // 如果已经成功加载，不再重试
    if (urlLoaded && loadAttempts > 0) {
      const currentUrl = loginWindow?.webContents?.getURL();
      if (currentUrl && currentUrl !== 'about:blank' && currentUrl.startsWith('http')) {
        console.log('⚠️  URL 已经加载，跳过重复加载');
        return;
      }
    }
    
    loadAttempts++;
    isCurrentlyLoading = true;
    redirectDetectedInCurrentLoad = false; // 重置重定向检测标志
    
    console.log(`📥 尝试加载登录页面 (${loadAttempts}/${maxLoadAttempts})...`);
    
    // 先设置额外的请求头（只设置一次）
    if (loadAttempts === 1) {
      // 监听请求发送
      loginWindow.webContents.session.webRequest.onBeforeRequest(
        { urls: ['*://app-api.pixiv.net/*', '*://*.pixiv.net/*'] },
        (details, callback) => {
          console.log('🌐 [请求发送]', details.method, details.url);
          callback({});
        }
      );
      
      loginWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://app-api.pixiv.net/*', '*://*.pixiv.net/*'] },
        (details, callback) => {
          console.log('📤 [发送请求头]', details.url);
          details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9';
          details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
          callback({ requestHeaders: details.requestHeaders });
        }
      );
      
      // 监听响应
      loginWindow.webContents.session.webRequest.onCompleted(
        { urls: ['*://app-api.pixiv.net/*', '*://*.pixiv.net/*'] },
        (details) => {
          console.log('✅ [请求完成]', details.statusCode, details.url);
        }
      );
      
      // 监听重定向
      loginWindow.webContents.session.webRequest.onBeforeRedirect(
        { urls: ['*://app-api.pixiv.net/*', '*://*.pixiv.net/*'] },
        (details) => {
          if (details.redirectURL) {
            console.log('🔄 [检测到重定向]', details.redirectURL);
            redirectDetectedInCurrentLoad = true;
            
            // 如果重定向到 accounts.pixiv.net/login，直接加载该URL
            if (details.redirectURL.includes('accounts.pixiv.net/login')) {
              console.log('✅ [重定向处理] 检测到登录页面重定向，直接加载:', details.redirectURL);
              
              // 清除当前超时
              if (currentLoadTimeout) {
                clearTimeout(currentLoadTimeout);
                currentLoadTimeout = null;
              }
              
              // 延迟一小段时间后直接加载重定向URL，确保重定向流程完成
              setTimeout(() => {
                if (loginWindow && !loginWindow.isDestroyed() && isCurrentlyLoading) {
                  console.log('🌐 [重定向处理] 直接加载登录页面:', details.redirectURL);
                  loginWindow.webContents.loadURL(details.redirectURL, {
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    extraHeaders: 'Accept-Language: en-US,en;q=0.9\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8\n'
                  }).then(() => {
                    console.log('✅ [重定向处理] 登录页面加载成功');
                    urlLoaded = true;
                    isCurrentlyLoading = false;
                    if (currentLoadTimeout) {
                      clearTimeout(currentLoadTimeout);
                      currentLoadTimeout = null;
                    }
                  }).catch((err) => {
                    console.warn('⚠️  [重定向处理] 直接加载失败，继续等待原始流程:', err.message);
                    // 如果直接加载失败，继续等待原始加载流程
                  });
                }
              }, 500); // 等待500ms确保重定向流程完成
            }
            
            // 重置超时计时器，给重定向更多时间
            if (currentLoadTimeout) {
              clearTimeout(currentLoadTimeout);
              currentLoadTimeout = setTimeout(() => {
                if (isCurrentlyLoading) {
                  console.error(`⏱️  加载超时（重定向后）(尝试 ${loadAttempts}/${maxLoadAttempts})`);
                  isCurrentlyLoading = false;
                  currentLoadTimeout = null;
                  if (loadAttempts >= maxLoadAttempts) {
                    urlLoaded = true;
                  } else {
                    const retryDelay = 1000 * loadAttempts;
                    setTimeout(() => {
                      if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded) {
                        tryLoadURL();
                      }
                    }, retryDelay);
                  }
                }
              }, 60000); // 重定向后给60秒
            }
          }
        }
      );
      
      // 监听请求错误 - 改进版本，处理网络错误
      loginWindow.webContents.session.webRequest.onErrorOccurred(
        { urls: ['*://app-api.pixiv.net/*', '*://*.pixiv.net/*', '*://accounts.pixiv.net/*'] },
        (details) => {
          const errorCode = details.error;
          const url = details.url;
          
          // ERR_ABORTED 通常表示请求被取消（可能是重定向），不一定需要处理
          if (errorCode === 'net::ERR_ABORTED' || errorCode === 'ERR_ABORTED') {
            console.log('⚠️  [请求取消]', url, '(可能是正常的重定向)');
            return;
          }
          
          // ERR_FAILED 表示请求失败，可能需要重试
          if (errorCode === 'net::ERR_FAILED' || errorCode === 'ERR_FAILED') {
            console.error('❌ [请求失败]', errorCode, url);
            
            // 如果这是登录URL的初始请求，尝试重试
            if (url.includes('app-api.pixiv.net/web/v1/login')) {
              failLoadRetryCount++;
              if (failLoadRetryCount < maxFailLoadRetries) {
                console.log(`🔄 [请求失败] 将在2秒后重试 (${failLoadRetryCount}/${maxFailLoadRetries})...`);
                safeSetTimeout(() => {
                  if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded && !isCurrentlyLoading) {
                    isCurrentlyLoading = false; // 重置状态以便重试
                    tryLoadURL();
                  }
                }, 2000);
              } else {
                console.error('❌ [请求失败] 重试次数已达上限，停止重试');
                // 显示错误页面
                if (loginWindow && !loginWindow.isDestroyed()) {
                  loginWindow.webContents.executeJavaScript(`
                    document.body.innerHTML = '<div style="padding: 40px; font-family: Arial, sans-serif; text-align: center; background: #f5f5f5; height: 100vh; display: flex; align-items: center; justify-content: center;"><div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px;"><h2 style="color: #333; margin-bottom: 15px;">网络连接失败</h2><p style="color: #666; margin-bottom: 10px;">无法连接到 Pixiv 服务器。请检查：</p><ul style="text-align: left; color: #666; margin-bottom: 20px;"><li>网络连接是否正常</li><li>代理设置是否正确</li><li>防火墙是否阻止连接</li></ul><button onclick="location.reload()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-right: 10px;">重试</button><button onclick="window.close()" style="padding: 10px 20px; background: #ccc; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">关闭</button></div></div>';
                  `).catch(() => {});
                }
              }
            }
          } else {
            // 其他错误
            console.error('❌ [请求错误]', errorCode, url);
          }
        }
      );
    }
    
    // 清除之前的超时计时器
    if (currentLoadTimeout) {
      clearTimeout(currentLoadTimeout);
      currentLoadTimeout = null;
    }
    
    // 添加超时机制（30秒，如果检测到重定向会延长到60秒）
    currentLoadTimeout = setTimeout(() => {
      if (isCurrentlyLoading) {
        console.error(`⏱️  加载超时 (尝试 ${loadAttempts}/${maxLoadAttempts})`);
        isCurrentlyLoading = false;
        currentLoadTimeout = null;
        if (loadAttempts >= maxLoadAttempts) {
          urlLoaded = true;
          // 显示超时错误
          if (loginWindow && !loginWindow.isDestroyed()) {
            loginWindow.webContents.executeJavaScript(`
              document.body.innerHTML = '<div style="padding: 40px; font-family: Arial, sans-serif; text-align: center; background: #f5f5f5; height: 100vh; display: flex; align-items: center; justify-content: center;"><div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px;"><h2 style="color: #333; margin-bottom: 15px;">加载超时</h2><p style="color: #666; margin-bottom: 10px;">页面加载时间过长，请检查网络连接</p><button onclick="location.reload()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-right: 10px;">重试</button><button onclick="window.close()" style="padding: 10px 20px; background: #ccc; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">关闭</button></div></div>';
            `).catch(() => {});
          }
        } else {
          // 重试
          const retryDelay = 1000 * loadAttempts;
          setTimeout(() => {
            if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded) {
              tryLoadURL();
            }
          }, retryDelay);
        }
      }
    }, 30000); // 30秒超时
    
    // 在加载前先检查网络连接
    console.log('🔍 检查网络连接...');
    axios.get('https://app-api.pixiv.net', { 
      timeout: 5000,
      validateStatus: () => true // 接受任何状态码，只要连接成功
    }).then((response) => {
      console.log('✅ 网络连接正常，可以访问 Pixiv 服务器 (状态码:', response.status, ')');
    }).catch((error) => {
      console.warn('⚠️  网络连接检查失败:', error.message);
      console.warn('   这可能是网络问题或防火墙阻止。尝试继续加载...');
    });

    // 尝试加载 URL - 改进版本，更好的错误处理
    console.log('🌐 调用 loadURL:', loginUrl);
    
    // 添加加载失败监听器（在加载前设置）
    const onLoadFailed = (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // 只处理主框架的加载失败
      if (!isMainFrame) {
        return;
      }
      
      console.error('❌ [页面加载失败]', {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
      });
      
      // ERR_ABORTED 通常表示请求被取消（可能是重定向），不一定需要处理
      if (errorCode === -3 || errorCode === 'ERR_ABORTED' || errorDescription?.includes('ERR_ABORTED')) {
        console.log('⚠️  [页面加载取消] 可能是正常的重定向过程');
        
        // 等待一小段时间，看是否有重定向发生
        safeSetTimeout(() => {
          const currentUrl = loginWindow?.webContents?.getURL();
          if (currentUrl && currentUrl.startsWith('http') && currentUrl !== loginUrl) {
            console.log('✅ [页面加载取消] 检测到页面已重定向到:', currentUrl);
            urlLoaded = true;
            isCurrentlyLoading = false;
            if (currentLoadTimeout) {
              clearTimeout(currentLoadTimeout);
              currentLoadTimeout = null;
            }
          } else if (isCurrentlyLoading && !redirectUrlToLoad) {
            // 如果还是没有重定向，可能需要重试
            console.log('⚠️  [页面加载取消] 未检测到重定向，可能需要重试');
            isCurrentlyLoading = false;
          }
        }, 1000);
        
        return;
      }
      
      // ERR_FAILED 表示请求失败
      if (errorCode === -2 || errorCode === 'ERR_FAILED' || errorDescription?.includes('ERR_FAILED')) {
        console.error('❌ [页面加载失败] 网络错误，尝试重试...');
        failLoadRetryCount++;
        
        if (failLoadRetryCount < maxFailLoadRetries) {
          console.log(`🔄 [页面加载失败] 将在2秒后重试 (${failLoadRetryCount}/${maxFailLoadRetries})...`);
          isCurrentlyLoading = false;
          safeSetTimeout(() => {
            if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded) {
              tryLoadURL();
            }
          }, 2000);
        } else {
          console.error('❌ [页面加载失败] 重试次数已达上限');
          urlLoaded = true; // 标记为已加载（即使失败），避免无限重试
          isCurrentlyLoading = false;
          
          // 显示错误页面
          if (loginWindow && !loginWindow.isDestroyed()) {
            const errorMsg = errorDescription || '网络连接失败，请检查网络设置和代理配置';
            const errorCodeStr = String(errorCode);
            loginWindow.webContents.executeJavaScript(`
              (function() {
                const errorCode = ${JSON.stringify(errorCodeStr)};
                const errorMsg = ${JSON.stringify(errorMsg)};
                document.body.innerHTML = '<div style="padding: 40px; font-family: Arial, sans-serif; text-align: center; background: #f5f5f5; height: 100vh; display: flex; align-items: center; justify-content: center;"><div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px;"><h2 style="color: #333; margin-bottom: 15px;">无法加载登录页面</h2><p style="color: #666; margin-bottom: 10px;">错误代码: ' + errorCode + '</p><p style="color: #666; margin-bottom: 20px;">' + errorMsg + '</p><button onclick="location.reload()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-right: 10px;">重试</button><button onclick="window.close()" style="padding: 10px 20px; background: #ccc; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">关闭</button></div></div>';
              })();
            `).catch(() => {});
          }
        }
      }
    };
    
    // 只在第一次加载时添加监听器
    if (loadAttempts === 1) {
      loginWindow.webContents.once('did-fail-load', onLoadFailed);
    }
    
    loginWindow.webContents.loadURL(loginUrl, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHeaders: 'Accept-Language: en-US,en;q=0.9\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8\nReferer: https://www.pixiv.net/\n'
    }).then(() => {
      if (currentLoadTimeout) {
        clearTimeout(currentLoadTimeout);
        currentLoadTimeout = null;
      }
      console.log('✅ loadURL Promise resolved - 登录页面加载成功');
      urlLoaded = true;
      isCurrentlyLoading = false;
      // 重置失败重试计数
      failLoadRetryCount = 0;
      
      // 显示窗口
      if (loginWindow && !loginWindow.isDestroyed() && !loginWindow.isVisible()) {
        loginWindow.show();
      }
    }).catch((error) => {
      if (currentLoadTimeout) {
        clearTimeout(currentLoadTimeout);
        currentLoadTimeout = null;
      }
      
      // 如果检测到重定向且错误是 ERR_ABORTED，可能是正常的重定向过程
      if (redirectDetectedInCurrentLoad && (error.code === 'ERR_ABORTED' || error.errno === -3)) {
        console.log('⚠️  检测到重定向过程中的 ERR_ABORTED，这可能是正常的');
        
        // 如果已经有重定向URL待加载，不再重试
        if (redirectUrlToLoad) {
          console.log('✅ 重定向URL已设置，等待重定向加载完成');
          isCurrentlyLoading = false; // 重置状态，让重定向加载继续
          return; // 不继续错误处理
        }
        
        // 否则，等待一下看是否有重定向URL被设置
        setTimeout(() => {
          if (redirectUrlToLoad) {
            console.log('✅ 检测到重定向URL，等待加载完成');
            isCurrentlyLoading = false;
            return;
          }
          
          // 如果还是没有重定向URL，继续等待或重试
          console.log('⚠️  等待重定向URL设置...');
          currentLoadTimeout = setTimeout(() => {
            if (isCurrentlyLoading && !redirectUrlToLoad) {
              console.error(`⏱️  重定向后加载超时 (尝试 ${loadAttempts}/${maxLoadAttempts})`);
              isCurrentlyLoading = false;
              currentLoadTimeout = null;
              if (loadAttempts >= maxLoadAttempts) {
                urlLoaded = true;
              } else {
                const retryDelay = 1000 * loadAttempts;
                setTimeout(() => {
                  if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded && !redirectUrlToLoad) {
                    tryLoadURL();
                  }
                }, retryDelay);
              }
            }
          }, 10000); // 给10秒等待重定向URL
        }, 1000);
        
        return; // 不继续错误处理
      }
      
      isCurrentlyLoading = false;
      console.error(`❌ loadURL Promise rejected - 加载登录页面失败 (尝试 ${loadAttempts}/${maxLoadAttempts}):`, error);
      
      // 如果是最后一次尝试，显示错误信息
      if (loadAttempts >= maxLoadAttempts) {
        console.error('❌ 所有加载尝试都失败了');
        urlLoaded = true; // 标记为已尝试，避免无限重试
        // 显示错误信息给用户（但不关闭窗口）
        if (loginWindow && !loginWindow.isDestroyed()) {
          const errorMsg = error.message || error.code || '未知错误';
          loginWindow.webContents.executeJavaScript(`
            document.body.innerHTML = '<div style="padding: 40px; font-family: Arial, sans-serif; text-align: center; background: #f5f5f5; height: 100vh; display: flex; align-items: center; justify-content: center;"><div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px;"><h2 style="color: #333; margin-bottom: 15px;">加载失败</h2><p style="color: #666; margin-bottom: 10px;">无法加载 Pixiv 登录页面</p><p style="color: #999; font-size: 12px; margin-bottom: 20px;">错误: ${errorMsg}</p><button onclick="location.reload()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-right: 10px;">重试</button><button onclick="window.close()" style="padding: 10px 20px; background: #ccc; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">关闭</button></div></div>';
          `).catch(() => {});
        }
      } else {
        // 等待一段时间后重试
        const retryDelay = 1000 * loadAttempts; // 递增延迟：1s, 2s, 3s, 4s, 5s
        setTimeout(() => {
          if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded) {
            tryLoadURL();
          }
        }, retryDelay);
      }
    });
  };

  // 监听窗口加载错误（在 tryLoadURL 定义之后）
  loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    const errorName = getErrorName(errorCode);
    
    // 如果检测到重定向URL，忽略 ERR_ABORTED 错误（这是重定向过程中的正常行为）
    if (redirectUrlToLoad && errorCode === -3) { // ERR_ABORTED
      console.log('ℹ️  [重定向处理] 检测到 ERR_ABORTED，重定向URL已设置，忽略该错误');
      return; // 忽略该错误，不进行任何处理
    }
    
    // 如果检测到重定向且错误是 ERR_ABORTED，忽略该错误（这是重定向过程中的正常行为）
    if (redirectDetectedInCurrentLoad && errorCode === -3) { // ERR_ABORTED
      console.log('ℹ️  [重定向处理] 检测到 ERR_ABORTED，这是重定向过程中的正常行为，忽略该错误');
      // 等待一下，看是否有重定向URL被设置
      setTimeout(() => {
        if (redirectUrlToLoad) {
          console.log('✅ [重定向处理] 重定向URL已设置，等待加载完成');
          return;
        }
      }, 500);
      return; // 忽略该错误，不进行任何处理
    }
    
    // 如果URL是 app-api.pixiv.net 且错误是 ERR_ABORTED，可能是重定向前的正常行为
    if (validatedURL && validatedURL.includes('app-api.pixiv.net') && errorCode === -3) {
      console.log('ℹ️  [重定向处理] app-api.pixiv.net 请求被中止，可能是重定向前的正常行为，继续等待...');
      // 等待一小段时间，看是否会有重定向
      setTimeout(() => {
        const currentUrl = loginWindow?.webContents?.getURL();
        if (currentUrl && currentUrl.includes('accounts.pixiv.net')) {
          console.log('✅ [重定向处理] 重定向成功，当前URL:', currentUrl);
          return; // 重定向成功，不需要处理错误
        }
        // 检查是否有重定向URL待加载
        if (redirectUrlToLoad) {
          console.log('✅ [重定向处理] 检测到重定向URL，等待加载完成');
          return;
        }
      }, 1000);
      // 不立即处理错误，等待重定向完成
      return;
    }
    
    // 如果重定向URL加载失败，清除重定向URL记录，允许重试原始URL
    if (validatedURL && redirectUrlToLoad && validatedURL.includes('accounts.pixiv.net')) {
      if (errorCode === -2) { // ERR_FAILED
        console.error('❌ [重定向处理] 重定向URL加载失败:', validatedURL);
        console.error('   错误代码:', errorCode, errorDescription);
        // 清除重定向URL记录，允许重试原始URL
        redirectUrlToLoad = null;
        redirectDetectedInCurrentLoad = false;
        urlLoaded = false;
        isCurrentlyLoading = false;
        
        // 如果还有重试机会，重试原始URL
        if (failLoadRetryCount < maxFailLoadRetries && loadAttempts < maxLoadAttempts) {
          failLoadRetryCount++;
          const retryDelay = 2000; // 2秒后重试
          console.log(`🔄 [重定向处理] 将在 ${retryDelay/1000} 秒后重试加载原始URL (${failLoadRetryCount}/${maxFailLoadRetries})...`);
          
          setTimeout(() => {
            if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded) {
              console.log('🔄 [重定向处理] 重试加载原始URL...');
              tryLoadURL();
            }
          }, retryDelay);
          return; // 已处理，不继续错误处理
        }
      } else if (errorCode === -3) { // ERR_ABORTED
        // 重定向URL加载被中止，可能是正常的，等待一下
        console.log('ℹ️  [重定向处理] 重定向URL加载被中止，等待中...');
        return; // 忽略该错误
      }
    }
    
    console.error('❌ 登录窗口加载失败:', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
      errorName
    });
    
    // 提供更详细的错误诊断
    if (errorCode === -2) { // ERR_FAILED
      console.error('💡 ERR_FAILED (-2) 可能的原因:');
      console.error('   1. 网络连接问题 - 请检查网络连接');
      console.error('   2. DNS 解析失败 - 请检查 DNS 设置');
      console.error('   3. SSL/TLS 握手失败 - 可能是证书问题');
      console.error('   4. 防火墙或代理阻止 - 请检查防火墙设置');
      console.error('   5. Pixiv 服务器暂时不可用 - 请稍后重试');
      console.error('   6. 代理配置问题 - 如果使用代理，请检查代理设置');
      console.error('      - 检查配置文件中的 network.proxy 设置');
      console.error('      - 检查环境变量 (all_proxy, https_proxy, http_proxy)');
      console.error('      - 确保代理服务器正在运行且可访问');
    }
    
    // 如果是主框架加载失败，尝试重试（不包括 ERR_ABORTED，因为它可能在重定向过程中被忽略）
    if (isMainFrame && errorCode !== -3 && failLoadRetryCount < maxFailLoadRetries) {
      failLoadRetryCount++;
      const retryDelay = 1000 * failLoadRetryCount; // 递增延迟：1s, 2s, 3s
      console.log(`🔄 主框架加载失败，将在 ${retryDelay/1000} 秒后重试 (${failLoadRetryCount}/${maxFailLoadRetries})...`);
      
      setTimeout(() => {
        if (loginWindow && !loginWindow.isDestroyed()) {
          console.log('🔄 重试加载登录页面...');
          // 重置 urlLoaded 标志，允许重试
          urlLoaded = false;
          isCurrentlyLoading = false;
          // 如果重定向URL加载失败，清除重定向URL记录
          if (errorCode === -2 && validatedURL && validatedURL.includes('accounts.pixiv.net')) {
            redirectUrlToLoad = null;
            redirectDetectedInCurrentLoad = false;
          }
          loadAttempts = 0; // 重置加载尝试计数
          tryLoadURL();
        }
      }, retryDelay);
    } else if (isMainFrame && errorCode !== -3 && failLoadRetryCount >= maxFailLoadRetries) {
      // 所有重试都失败了，显示错误信息
      console.error('❌ 所有重试都失败了，显示错误信息');
      if (loginWindow && !loginWindow.isDestroyed()) {
        const errorMsg = errorDescription || getErrorName(errorCode);
        loginWindow.webContents.executeJavaScript(`
          document.body.innerHTML = '<div style="padding: 40px; font-family: Arial, sans-serif; text-align: center; background: #f5f5f5; height: 100vh; display: flex; align-items: center; justify-content: center;"><div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px;"><h2 style="color: #333; margin-bottom: 15px;">加载失败</h2><p style="color: #666; margin-bottom: 10px;">无法加载 Pixiv 登录页面</p><p style="color: #999; font-size: 12px; margin-bottom: 20px;">错误: ${errorMsg}</p><button onclick="location.reload()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-right: 10px;">重试</button><button onclick="window.close()" style="padding: 10px 20px; background: #ccc; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">关闭</button></div></div>';
        `).catch(() => {});
      }
    }
  });

  // 窗口准备好后显示窗口（加载页面已经加载）
  loginWindow.once('ready-to-show', () => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      // 显示窗口（加载页面已经加载，所以可以立即显示）
      loginWindow.show();
      loginWindow.focus();
      console.log('✅ 登录窗口已准备好并显示（显示加载页面）');
    }
  });
  
  // 当页面加载完成时显示窗口
  loginWindow.webContents.on('did-finish-load', () => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      const currentUrl = loginWindow.webContents.getURL();
      console.log('✅ 页面加载完成，URL:', currentUrl);
      
      // 如果加载的是登录页面（accounts.pixiv.net/login），标记为已加载
      if (currentUrl && currentUrl.includes('accounts.pixiv.net/login')) {
        console.log('✅ [页面加载] 登录页面加载成功');
        urlLoaded = true;
        isCurrentlyLoading = false;
        redirectDetectedInCurrentLoad = false;
        // 清除超时计时器
        if (currentLoadTimeout) {
          clearTimeout(currentLoadTimeout);
          currentLoadTimeout = null;
        }
      }
      
      // 确保窗口显示
      if (!loginWindow.isVisible()) {
        loginWindow.show();
        loginWindow.focus();
        console.log('✅ [页面加载] 窗口已显示');
      }
      
      // 如果加载的是加载页面，开始加载真实URL
      if (currentUrl.startsWith('data:text/html')) {
        console.log('📥 [页面加载] 加载页面已显示，等待代理设置完成...');
        
        // 确保代理设置完成后再加载真实 URL
        (async () => {
          try {
            if (loginWindow._proxySetupPromise) {
              const proxyResult = await loginWindow._proxySetupPromise;
              if (proxyResult && proxyResult.success) {
                console.log('✅ [页面加载] 代理设置检查完成，代理来源:', proxyResult.source);
              } else {
                console.log('ℹ️  [页面加载] 代理设置检查完成，将使用系统代理或直连');
              }
            }
          } catch (error) {
            console.warn('⚠️  [页面加载] 代理设置检查时出错:', error);
            // 即使出错也继续，可能使用系统代理
          }
          
          // 延迟一点时间，确保加载页面完全显示和代理设置生效
          setTimeout(() => {
            if (loginWindow && !loginWindow.isDestroyed() && !urlLoaded && !isCurrentlyLoading) {
              console.log('🚀 [页面加载] 开始加载真实登录URL...');
              tryLoadURL();
            }
          }, 500);
        })();
      }
    }
  });

  // 监听窗口关闭
  loginWindow.on('closed', () => {
    console.log('🔒 登录窗口已关闭');
    // 清理超时计时器
    if (currentLoadTimeout) {
      clearTimeout(currentLoadTimeout);
      currentLoadTimeout = null;
    }
    // 清理URL检查定时器
    if (loginUrlCheckInterval) {
      clearInterval(loginUrlCheckInterval);
      loginUrlCheckInterval = null;
    }
    // 使用统一的清理函数
    closeLoginWindow();
  });
  
  // 不再需要立即加载URL，因为加载流程已经改进了：
  // 1. 先加载加载页面（立即显示给用户）
  // 2. 在 did-finish-load 事件中检测到加载页面后，加载真实URL
  // 这样用户可以立即看到加载状态，而不是白屏

  return loginWindow;
}

// 防止重复处理授权码
let isProcessingAuthCode = false;

/**
 * 关闭登录窗口的辅助函数
 * 确保窗口被正确关闭并清理所有相关资源
 */
function closeLoginWindow() {
  // 清理超时计时器
  if (currentLoadTimeout) {
    clearTimeout(currentLoadTimeout);
    currentLoadTimeout = null;
  }
  
  // 清理URL检查定时器
  if (loginUrlCheckInterval) {
    clearInterval(loginUrlCheckInterval);
    loginUrlCheckInterval = null;
  }
  
  if (loginWindow) {
    try {
      console.log('🔒 正在关闭登录窗口...');
      if (!loginWindow.isDestroyed()) {
        loginWindow.close();
      }
    } catch (e) {
      console.error('⚠️  关闭登录窗口时出错:', e.message);
    } finally {
      loginWindow = null;
    }
  }
  
  // 停止轮询
  if (loginUrlCheckInterval) {
    clearInterval(loginUrlCheckInterval);
    loginUrlCheckInterval = null;
  }
  
  // 清除状态
  currentLoginCodeVerifier = null;
  isProcessingAuthCode = false;
}

/**
 * 检查 URL 是否为回调 URL 并提取授权码
 * 彻底重写版本 - 更严格的验证和更详细的日志
 * 增强版本 - 支持更多回调URL格式和更好的错误处理
 */
async function checkForCallbackUrl(url) {
  // 如果正在处理，忽略（防止重复处理）
  if (isProcessingAuthCode) {
    return false;
  }

  // 如果没有code verifier，说明登录流程未开始或已结束
  if (!currentLoginCodeVerifier) {
    return false;
  }

  // 如果URL为空或无效，忽略
  if (!url || typeof url !== 'string' || url === 'about:blank' || url === 'about:') {
    return false;
  }

  // 快速检查：如果URL不包含code或error参数，直接返回
  // 同时检查callback URL模式
  const hasCode = url.includes('code=') || url.includes('?code=') || url.includes('&code=');
  const hasError = url.includes('error=') || url.includes('?error=') || url.includes('&error=');
  const isCallbackUrl = url.includes('callback') || url.includes('app-api.pixiv.net/web/v1/users/auth/pixiv/callback');
  
  // 如果是回调URL但没有code或error参数，记录日志以便调试
  if (isCallbackUrl && !hasCode && !hasError) {
    console.log('🔍 检测到回调URL但没有code/error参数:', url);
  }
  
  if (!hasCode && !hasError && !isCallbackUrl) {
    return false;
  }

  try {
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      // 如果URL解析失败，尝试处理相对URL
      if (url.startsWith('/')) {
        try {
          urlObj = new URL(url, 'https://app-api.pixiv.net');
        } catch (e2) {
          // 如果还是失败，检查是否是fragment中的参数
          const hashMatch = url.match(/[#&](code|error)=([^&]+)/);
          if (hashMatch) {
            // 从hash中提取参数
            const paramName = hashMatch[1];
            const paramValue = hashMatch[2];
            if (paramName === 'code' && paramValue && paramValue.length > 0) {
              return handleAuthCode(paramValue, url);
            } else if (paramName === 'error') {
              return handleAuthError(paramValue, url);
            }
          }
          return false;
        }
      } else {
        return false;
      }
    }
    
    // 检查 URL 中是否有 code 参数（包括search和hash）
    const code = urlObj.searchParams.get('code') || (urlObj.hash ? new URLSearchParams(urlObj.hash.substring(1)).get('code') : null);
    
    if (code && code.length > 0 && currentLoginCodeVerifier) {
      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('🎉🎉🎉 成功捕获回调URL！');
      console.log('═══════════════════════════════════════════════════════');
      console.log('   回调URL:', url);
      console.log('   授权码 (前30字符):', code.substring(0, 30) + '...');
      console.log('   授权码长度:', code.length);
      console.log('   时间戳:', new Date().toISOString());
      console.log('═══════════════════════════════════════════════════════');
      console.log('');
      return handleAuthCode(code, url);
    }
    
    // 检查是否有错误参数（包括search和hash）
    const error = urlObj.searchParams.get('error') || (urlObj.hash ? new URLSearchParams(urlObj.hash.substring(1)).get('error') : null);
    if (error) {
      const errorDescription = urlObj.searchParams.get('error_description') || 
                              (urlObj.hash ? new URLSearchParams(urlObj.hash.substring(1)).get('error_description') : null) ||
                              error;
      return handleAuthError(error, errorDescription, url);
    }
    
    return false; // 未找到code或error参数
  } catch (error) {
    // URL 解析失败 - 尝试从原始URL字符串中提取
    try {
      // 尝试使用正则表达式提取code参数
      const codeMatch = url.match(/[?&#]code=([^&#]+)/);
      if (codeMatch && codeMatch[1] && currentLoginCodeVerifier) {
        const code = decodeURIComponent(codeMatch[1]);
        if (code && code.length > 0) {
          console.log('⚠️  从URL字符串中提取到授权码（URL解析失败）');
          return handleAuthCode(code, url);
        }
      }
      
      // 尝试提取error参数
      const errorMatch = url.match(/[?&#]error=([^&#]+)/);
      if (errorMatch && errorMatch[1]) {
        const error = decodeURIComponent(errorMatch[1]);
        const errorDescMatch = url.match(/[?&#]error_description=([^&#]+)/);
        const errorDescription = errorDescMatch ? decodeURIComponent(errorDescMatch[1]) : error;
        return handleAuthError(error, errorDescription, url);
      }
    } catch (extractError) {
      // 提取也失败，静默忽略
    }
    return false;
  }
}

/**
 * 处理授权码 - 提取并交换token
 */
async function handleAuthCode(code, sourceUrl) {
  // 立即标记为正在处理，防止重复处理
  if (isProcessingAuthCode) {
    return false;
  }
  
  isProcessingAuthCode = true;
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('✅✅✅ 成功检测到授权码！');
  console.log('═══════════════════════════════════════════════════════');
  console.log('   授权码 (前20字符):', code.substring(0, 20) + '...');
  console.log('   授权码长度:', code.length);
  console.log('   来源 URL:', sourceUrl);
  console.log('   时间戳:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  // 保存code verifier（在清除之前）
  const codeVerifier = currentLoginCodeVerifier;
  
  // 立即清除，防止重复使用
  currentLoginCodeVerifier = null;
  
  // 立即关闭登录窗口（不等待token交换完成）
  closeLoginWindow();

  // 异步交换token（不阻塞）
  exchangeCodeForToken(code, codeVerifier)
    .then(async (result) => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('✅✅✅ Token 交换成功！');
      console.log('═══════════════════════════════════════════════════════');
      console.log('   Access Token (前20字符):', result.data.accessToken ? result.data.accessToken.substring(0, 20) + '...' : 'N/A');
      console.log('   Refresh Token (前20字符):', result.data.refreshToken ? result.data.refreshToken.substring(0, 20) + '...' : 'N/A');
      console.log('   过期时间:', result.data.expiresIn, '秒');
      console.log('   用户信息:', result.data.user ? JSON.stringify(result.data.user, null, 2) : 'N/A');
      console.log('═══════════════════════════════════════════════════════');
      console.log('');
      
      // 确保登录窗口已关闭（双重保险）
      closeLoginWindow();
      
      // 尝试将 token 保存到后端配置（带重试机制）
      await saveTokenToBackend(result.data.refreshToken, 3);
      
      // 通知主窗口登录成功（前端也会尝试保存 token）
      // 使用标志位防止重复发送
      let eventSent = false;
      const sendLoginSuccessEvent = () => {
        // 如果事件已经发送成功，不再重复发送
        if (eventSent) {
          return;
        }
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          const eventData = result.data;
          console.log('📤 发送 login-success 事件到主窗口 (BrowserWindow):', {
            hasRefreshToken: !!eventData.refreshToken,
            hasAccessToken: !!eventData.accessToken,
            windowReady: !mainWindow.isDestroyed(),
          });
          try {
            mainWindow.webContents.send('login-success', eventData);
            console.log('✅ login-success 事件已发送 (BrowserWindow)');
            eventSent = true; // 标记为已发送
            resetLoginWindowFlag(); // 重置标志位
            
            // 备选方案：如果 3 秒后还在登录页面，强制导航到 dashboard
            // 前端应该已经处理了导航，但这是最后的保障
            setTimeout(() => {
              try {
                const currentUrl = mainWindow.webContents.getURL();
                console.log('🔍 检查当前页面 URL:', currentUrl);
                if (currentUrl && currentUrl.includes('/login')) {
                  console.log('🔄 检测到仍在登录页面，尝试强制导航到 dashboard...');
                  // 使用 loadURL 作为最后的手段
                  const dashboardUrl = `http://localhost:${actualBackendPort}/dashboard`;
                  mainWindow.webContents.loadURL(dashboardUrl).then(() => {
                    console.log('✅ 已通过 loadURL 导航到 dashboard');
                  }).catch(err => {
                    console.error('❌ loadURL 导航失败:', err.message);
                    // 最后尝试：使用 executeJavaScript
                    mainWindow.webContents.executeJavaScript(`
                      window.location.href = '/dashboard';
                    `).catch(jsErr => {
                      console.error('❌ executeJavaScript 导航也失败:', jsErr.message);
                    });
                  });
                } else {
                  console.log('✅ 页面已不在登录页面，导航成功');
                }
              } catch (checkError) {
                console.error('❌ 检查页面 URL 时出错:', checkError.message);
              }
            }, 3000); // 增加到 3 秒，给前端更多时间处理
          } catch (sendError) {
            console.error('❌ 发送登录成功事件失败:', sendError.message);
            // 发送失败时不设置标志，允许重试
          }
        } else {
          console.error('❌ 主窗口不存在或已销毁，无法发送事件');
          // 窗口未准备好时不设置标志，允许重试
        }
      };
      
      // 立即尝试发送，如果页面未加载，延迟后重试（但只会发送一次）
      sendLoginSuccessEvent();
      setTimeout(sendLoginSuccessEvent, 500);
      setTimeout(sendLoginSuccessEvent, 1000);
    })
    .catch((error) => {
      console.error('');
      console.error('═══════════════════════════════════════════════════════');
      console.error('❌❌❌ Token 交换失败！');
      console.error('═══════════════════════════════════════════════════════');
      console.error('   错误消息:', error.message);
      
      if (axios.isAxiosError(error) && error.response) {
        console.error('   HTTP状态:', error.response.status, error.response.statusText);
        console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
      } else if (error.response) {
        console.error('   HTTP状态:', error.response.status);
        console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
      }
      
      if (error.request) {
        console.error('   请求信息:', error.request);
      }
      
      console.error('   错误堆栈:', error.stack);
      console.error('═══════════════════════════════════════════════════════');
      console.error('');
      
      // 确保登录窗口已关闭（即使失败也要关闭）
      closeLoginWindow();
      
      // 通知主窗口登录失败
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('login-error', { 
            message: error.message || 'Token交换失败',
            details: error.response ? error.response.data : null,
            code: error.code || 'UNKNOWN_ERROR'
          });
          console.log('✅ 已发送登录失败事件到主窗口');
        } catch (sendError) {
          console.error('❌ 发送登录失败事件失败:', sendError.message);
        }
      }
      resetLoginWindowFlag(); // 重置标志位
    })
    .finally(() => {
      // 最终确保窗口已关闭并清理资源
      closeLoginWindow();
      isProcessingAuthCode = false;
    });
  
  return true; // 表示已找到授权码
}

/**
 * 处理认证错误
 */
function handleAuthError(error, errorDescription, sourceUrl) {
  console.error('');
  console.error('═══════════════════════════════════════════════════════');
  console.error('❌ 登录过程中发生错误');
  console.error('═══════════════════════════════════════════════════════');
  console.error('   错误代码:', error);
  console.error('   错误描述:', errorDescription);
  console.error('   错误URL:', sourceUrl);
  console.error('═══════════════════════════════════════════════════════');
  console.error('');
  
  // 关闭登录窗口并清理资源
  closeLoginWindow();
  isProcessingAuthCode = false;
  currentLoginCodeVerifier = null;

  // 通知主窗口登录失败
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('login-error', { 
        message: errorDescription || error || '登录过程中发生错误',
        errorCode: error,
        code: error || 'AUTH_ERROR'
      });
      console.log('✅ 已发送登录错误事件到主窗口');
    } catch (sendError) {
      console.error('❌ 发送登录错误事件失败:', sendError.message);
    }
  }
  resetLoginWindowFlag(); // 重置标志位
  
  return true; // 表示已处理错误
}

/**
 * 显示授权码输入对话框
 * 引导用户从浏览器回调URL中提取授权码
 */
function showAuthCodeInputDialog() {
  return new Promise((resolve) => {
    // 创建授权码输入窗口
    const authCodeWindow = new BrowserWindow({
      width: 600,
      height: 500,
      parent: mainWindow,
      modal: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: true,
      },
      title: 'Pixiv 登录 - 输入授权码',
      show: false,
    });

    // 创建辅助页面HTML
    const helperHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Pixiv 登录 - 输入授权码</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f5f5f5;
      padding: 30px;
      color: #333;
    }
    .container {
      max-width: 540px;
      margin: 0 auto;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
      color: #333;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
      margin-bottom: 30px;
    }
    .steps {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .step {
      margin-bottom: 20px;
    }
    .step:last-child {
      margin-bottom: 0;
    }
    .step-number {
      display: inline-block;
      width: 24px;
      height: 24px;
      background: #667eea;
      color: white;
      border-radius: 50%;
      text-align: center;
      line-height: 24px;
      font-size: 14px;
      font-weight: bold;
      margin-right: 10px;
    }
    .step-text {
      display: inline-block;
      vertical-align: top;
      width: calc(100% - 40px);
      font-size: 14px;
      line-height: 1.6;
    }
    .code-example {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 4px;
      padding: 10px;
      margin-top: 10px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      color: #495057;
      word-break: break-all;
    }
    .code-example .highlight {
      color: #667eea;
      font-weight: bold;
    }
    .input-section {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .input-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #333;
    }
    input {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-family: 'Monaco', 'Courier New', monospace;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
    }
    .buttons {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .btn-primary {
      background: #667eea;
      color: white;
    }
    .btn-primary:hover {
      background: #5568d3;
    }
    .btn-secondary {
      background: #e9ecef;
      color: #495057;
    }
    .btn-secondary:hover {
      background: #dee2e6;
    }
    .help-text {
      font-size: 12px;
      color: #666;
      margin-top: 8px;
    }
    .error {
      color: #dc3545;
      font-size: 12px;
      margin-top: 8px;
      display: none;
    }
    .error.show {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Pixiv 登录</h1>
    <p class="subtitle">请在浏览器中完成登录，然后输入授权码</p>
    
    <div class="steps">
      <div class="step">
        <span class="step-number">1</span>
        <span class="step-text">在浏览器中完成 Pixiv 登录</span>
      </div>
      <div class="step">
        <span class="step-number">2</span>
        <span class="step-text">登录成功后，浏览器会跳转到回调页面。查看浏览器地址栏中的URL，找到 <span class="highlight">code=</span> 后面的部分</span>
      </div>
      <div class="step">
        <span class="step-number">3</span>
        <span class="step-text">复制授权码（code= 后面的字符串），粘贴到下面的输入框中</span>
      </div>
    </div>
    
    <div class="code-example">
      示例URL：<br>
      https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback?<span class="highlight">code=xxxxxxxxxxxxxxxxxxxxxxxx</span>&state=...
    </div>
    
    <div class="input-section">
      <div class="input-group">
        <label for="authCode">授权码 (Authorization Code)</label>
        <input 
          type="text" 
          id="authCode" 
          placeholder="请输入授权码..." 
          autocomplete="off"
          autofocus
        />
        <div class="help-text">从浏览器回调URL的 code= 参数中复制</div>
        <div class="error" id="error"></div>
      </div>
      
      <div class="buttons">
        <button class="btn-secondary" id="cancelBtn">取消</button>
        <button class="btn-primary" id="submitBtn">确定</button>
      </div>
    </div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    const authCodeInput = document.getElementById('authCode');
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const errorDiv = document.getElementById('error');
    
    // 从全局变量获取通道名称（将在页面加载后注入）
    let submitChannel = 'auth-code-submitted';
    let cancelChannel = 'auth-code-cancelled';
    
    function showError(message) {
      errorDiv.textContent = message;
      errorDiv.classList.add('show');
    }
    
    function hideError() {
      errorDiv.classList.remove('show');
    }
    
    function validateAuthCode(code) {
      if (!code || code.trim() === '') {
        return '请输入授权码';
      }
      if (code.length < 10) {
        return '授权码长度不正确，请检查是否复制完整';
      }
      return null;
    }
    
    submitBtn.addEventListener('click', () => {
      const code = authCodeInput.value.trim();
      const error = validateAuthCode(code);
      
      if (error) {
        showError(error);
        return;
      }
      
      hideError();
      ipcRenderer.send(submitChannel, code);
    });
    
    cancelBtn.addEventListener('click', () => {
      ipcRenderer.send(cancelChannel);
    });
    
    // 按 Enter 键提交
    authCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitBtn.click();
      }
    });
    
    // 自动从剪贴板粘贴（如果包含code=）
    navigator.clipboard.readText().then(text => {
      const match = text.match(/[?&]code=([^&]+)/);
      if (match && match[1]) {
        authCodeInput.value = match[1];
        authCodeInput.select();
      }
    }).catch(() => {
      // 忽略剪贴板读取错误
    });
    
    // 设置通道名称的函数（将在页面加载后调用）
    window.setChannels = function(submit, cancel) {
      submitChannel = submit;
      cancelChannel = cancel;
    };
  </script>
</body>
</html>`;

    // 创建唯一的事件通道
    const channelId = `auth-code-${Date.now()}-${Math.random()}`;
    const submitChannel = `${channelId}-submit`;
    const cancelChannel = `${channelId}-cancel`;

    // 处理授权码提交
    const submitHandler = (event, code) => {
      // 只处理来自 authCodeWindow 的事件
      if (event.sender === authCodeWindow.webContents) {
        if (authCodeWindow && !authCodeWindow.isDestroyed()) {
          authCodeWindow.close();
        }
        ipcMain.removeListener(submitChannel, submitHandler);
        ipcMain.removeListener(cancelChannel, cancelHandler);
        resolve(code);
      }
    };

    // 处理取消
    const cancelHandler = (event) => {
      // 只处理来自 authCodeWindow 的事件
      if (event.sender === authCodeWindow.webContents) {
        if (authCodeWindow && !authCodeWindow.isDestroyed()) {
          authCodeWindow.close();
        }
        ipcMain.removeListener(submitChannel, submitHandler);
        ipcMain.removeListener(cancelChannel, cancelHandler);
        resolve(null);
      }
    };

    ipcMain.on(submitChannel, submitHandler);
    ipcMain.on(cancelChannel, cancelHandler);

    // 加载辅助页面
    authCodeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(helperHTML)}`);

    // 页面加载完成后注入通道名称
    authCodeWindow.webContents.once('did-finish-load', () => {
      authCodeWindow.webContents.executeJavaScript(`
        if (window.setChannels) {
          window.setChannels('${submitChannel}', '${cancelChannel}');
        }
      `).catch(err => {
        console.error('注入通道名称失败:', err);
      });
    });

    // 窗口关闭时清理
    authCodeWindow.on('closed', () => {
      // 移除事件监听器
      ipcMain.removeListener(submitChannel, submitHandler);
      ipcMain.removeListener(cancelChannel, cancelHandler);
      // 如果窗口关闭时还没有resolve，resolve为null
      resolve(null);
    });

    // 显示窗口
    authCodeWindow.once('ready-to-show', () => {
      authCodeWindow.show();
      authCodeWindow.focus();
    });
  });
}

/**
 * 重置登录窗口打开标志位
 */
function resetLoginWindowFlag() {
  isOpeningLoginWindow = false;
  console.log('✅ 已重置登录窗口打开标志位');
}

/**
 * 保存token到后端（带重试机制）
 */
async function saveTokenToBackend(refreshToken, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      safeLog(`💾 正在保存 token 到后端配置 (尝试 ${attempt}/${maxRetries})...`);
      
      // 等待后端就绪（最多等待10秒）
      let backendReady = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => safeSetTimeout(resolve, 500));
        try {
          const response = await axios.get(`http://localhost:${actualBackendPort}/api/health`, {
            timeout: 2000,
            validateStatus: () => true
          });
          if (response.status === 200) {
            backendReady = true;
            break;
          }
        } catch (e) {
          // 继续等待
        }
      }
      
      if (!backendReady) {
        safeLog(`⚠️  后端未就绪 (尝试 ${attempt}/${maxRetries})，前端将尝试保存 token`);
        if (attempt < maxRetries) {
          await new Promise(resolve => safeSetTimeout(resolve, 2000));
          continue;
        }
        return false;
      }
      
      // 调用后端 API 保存 token
      const response = await axios.post(
        `http://localhost:${actualBackendPort}/api/auth/login-with-token`,
        {
          refreshToken: refreshToken
        },
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json'
          },
          validateStatus: (status) => status >= 200 && status < 500
        }
      );
      
      if (response.data && response.data.success) {
        safeLog('✅ Token 已成功保存到后端配置');
        return true;
      } else {
        throw new Error(response.data?.message || '保存token失败：响应未成功');
      }
    } catch (saveError) {
      const errorMsg = saveError.response?.data?.message || saveError.message || '未知错误';
      safeLog(`⚠️  保存 token 到后端配置失败 (尝试 ${attempt}/${maxRetries}):`, errorMsg);
      
      if (attempt < maxRetries) {
        // 等待后重试（指数退避）
        const delay = 1000 * Math.pow(2, attempt - 1);
        safeLog(`   将在 ${delay / 1000} 秒后重试...`);
        await new Promise(resolve => safeSetTimeout(resolve, delay));
      } else {
        safeLog('⚠️  所有重试都失败，前端仍会尝试保存 token');
        return false;
      }
    }
  }
  
  return false;
}

// 停止后端服务器 - 改进版本，确保完全清理
// REF: https://www.electronjs.org/docs/latest/api/child-process
async function stopBackend() {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve();
      return;
    }
    
    safeLog('🛑 正在停止后端服务器...');
    isBackendStarting = false;
    
    const proc = backendProcess;
    backendProcess = null; // 立即清空引用，防止重复调用
    
    // 标记进程已退出
    let exited = false;
    const onExit = () => {
      if (!exited) {
        exited = true;
        safeLog('✅ 后端进程已停止');
        // 清理端口
        cleanupPort(BACKEND_PORT).then(() => {
          resolve();
        });
      }
    };
    
    proc.once('exit', onExit);
    
    // 尝试优雅关闭
    try {
      if (process.platform === 'win32') {
        proc.kill();
      } else {
        proc.kill('SIGTERM');
      }
      
      // 如果5秒后还没退出，强制杀死
      safeSetTimeout(() => {
        if (!exited && proc && !proc.killed) {
          safeLog('⚠️  后端进程未响应，强制终止...');
          try {
            proc.kill('SIGKILL');
          } catch (err) {
            safeError('强制终止进程失败:', err);
          }
        }
        
        // 如果10秒后还没退出，认为已停止
        safeSetTimeout(() => {
          if (!exited) {
            onExit();
          }
        }, 5000);
      }, 5000);
    } catch (err) {
      safeError('停止后端进程时出错:', err);
      onExit();
    }
  });
}

// 初始化 IPC 处理程序（只注册一次，避免重复注册）
function setupIpcHandlers() {
  // 移除已存在的处理程序（如果存在），避免重复注册错误
  try {
    ipcMain.removeAllListeners('backend-ready');
    ipcMain.removeHandler('open-login-window');
    ipcMain.removeHandler('close-login-window');
    ipcMain.removeHandler('window-minimize');
    ipcMain.removeHandler('window-maximize');
    ipcMain.removeHandler('window-close');
  } catch (error) {
    // 如果移除失败（比如处理程序不存在），忽略错误
    console.log('清理 IPC 处理程序:', error.message);
  }

  // 监听后端就绪事件
  ipcMain.on('backend-ready', () => {
    notifyBackendReady();
  });

  // 处理登录窗口请求 - 优先使用 pixiv-token-getter，然后是 Puppeteer，最后是 BrowserWindow
  ipcMain.handle('open-login-window', async (event, options = {}) => {
    try {
      // 防止重复打开登录窗口
      if (isOpeningLoginWindow) {
        console.log('⚠️  登录窗口正在打开中，忽略重复请求');
        return { 
          success: false, 
          error: '登录窗口正在打开中，请勿重复点击',
          alreadyOpening: true 
        };
      }
      
      // 检查是否已有登录窗口或浏览器实例
      const hasExistingWindow = loginWindow && !loginWindow.isDestroyed();
      const hasExistingBrowser = puppeteerBrowser !== null;
      
      if (hasExistingWindow || hasExistingBrowser) {
        console.log('⚠️  检测到已有登录窗口或浏览器实例，先关闭旧的');
        if (hasExistingWindow) {
          closeLoginWindow();
        }
        if (hasExistingBrowser) {
          try {
            await puppeteerBrowser.close();
            puppeteerBrowser = null;
          } catch (error) {
            console.error('关闭 Puppeteer 浏览器时出错:', error);
          }
        }
      }
      
      // 设置标志位，防止重复调用
      isOpeningLoginWindow = true;
      
      const useTokenGetter = options.useTokenGetter !== false && pixivTokenGetter !== null; // 默认优先使用 pixiv-token-getter（如果可用）
      const usePuppeteer = options.usePuppeteer !== false && puppeteer !== null; // 默认使用 Puppeteer（如果可用）
      const proxyConfig = options.proxy || null;
      
      // 优先使用 pixiv-token-getter
      if (useTokenGetter) {
        console.log('📞 收到打开登录窗口的请求（使用 pixiv-token-getter，推荐方法）');
        
        // 清除 code verifier（pixiv-token-getter 不需要）
        currentLoginCodeVerifier = null;
        isProcessingAuthCode = false;
        
        // 使用 pixiv-token-getter 进行登录（异步执行，不阻塞响应）
        loginWithPixivTokenGetter(proxyConfig)
          .then(async (loginInfo) => {
            console.log('✅ pixiv-token-getter 登录成功');
            
            // 清除 code verifier
            currentLoginCodeVerifier = null;
            isProcessingAuthCode = false;
            
            // 保存 token 到后端
            if (loginInfo && loginInfo.data && loginInfo.data.refreshToken) {
              await saveTokenToBackend(loginInfo.data.refreshToken);
            }
            
            // 通知主窗口登录成功
            // 使用标志位防止重复发送
            let eventSent = false;
            const sendLoginSuccessEvent = () => {
              // 如果事件已经发送成功，不再重复发送
              if (eventSent) {
                return;
              }
              
              if (mainWindow && !mainWindow.isDestroyed()) {
                const eventData = {
                  accessToken: loginInfo.data.accessToken,
                  refreshToken: loginInfo.data.refreshToken,
                  expiresIn: loginInfo.data.expiresIn,
                  user: loginInfo.data.user,
                };
                console.log('📤 发送 login-success 事件到主窗口:', {
                  hasRefreshToken: !!eventData.refreshToken,
                  hasAccessToken: !!eventData.accessToken,
                  windowReady: !mainWindow.isDestroyed(),
                });
                try {
                  mainWindow.webContents.send('login-success', eventData);
                  console.log('✅ login-success 事件已发送');
                  eventSent = true; // 标记为已发送
                  
                  // 如果事件发送成功，也可以尝试重新加载页面或导航到 dashboard
                  // 作为备选方案，等待 2 秒后检查是否需要手动导航
                  setTimeout(() => {
                    const currentUrl = mainWindow.webContents.getURL();
                    console.log('🔍 当前页面 URL:', currentUrl);
                    // 如果还在登录页面，尝试导航到 dashboard
                    if (currentUrl && currentUrl.includes('/login')) {
                      console.log('🔄 检测到仍在登录页面，尝试导航到 dashboard...');
                      mainWindow.webContents.executeJavaScript(`
                        if (window.location.pathname === '/login' || window.location.pathname.includes('/login')) {
                          window.location.href = '/dashboard';
                        }
                      `).catch(err => {
                        console.error('❌ 执行导航脚本失败:', err.message);
                      });
                    }
                  }, 2000);
                } catch (sendError) {
                  console.error('❌ 发送 login-success 事件失败:', sendError.message);
                  // 发送失败时不设置标志，允许重试
                }
              } else {
                console.error('❌ 主窗口不存在或已销毁，无法发送事件');
                // 窗口未准备好时不设置标志，允许重试
              }
            };
            
            // 立即尝试发送，如果页面未加载，延迟后重试（但只会发送一次）
            sendLoginSuccessEvent();
            setTimeout(sendLoginSuccessEvent, 500);
            setTimeout(sendLoginSuccessEvent, 1000);
          })
          .catch(async (error) => {
            console.error('❌ pixiv-token-getter 登录失败:', error);
            console.log('🔄 回退到 Puppeteer 登录...');
            
            // 清除 code verifier
            currentLoginCodeVerifier = null;
            isProcessingAuthCode = false;
            
            // 如果 pixiv-token-getter 失败，回退到 Puppeteer
            if (usePuppeteer) {
              try {
                // 生成 PKCE 参数
                const codeVerifier = generateCodeVerifier();
                const codeChallenge = generateCodeChallenge(codeVerifier);
                console.log('✅ PKCE 参数已生成');
                console.log('   Code Challenge:', codeChallenge);
                console.log('   Code Verifier (前20字符):', codeVerifier.substring(0, 20) + '...');
                
                // 保存 code verifier 供后续使用
                currentLoginCodeVerifier = codeVerifier;
                isProcessingAuthCode = false;
                
                // 使用 Puppeteer 进行登录（异步执行，不阻塞响应）
                loginWithPuppeteer(codeVerifier, codeChallenge, proxyConfig)
                  .then(async (loginInfo) => {
                    console.log('✅ Puppeteer 登录成功');
                    
                    // 清除 code verifier
                    currentLoginCodeVerifier = null;
                    isProcessingAuthCode = false;
                    
                    // 保存 token 到后端
                    if (loginInfo && loginInfo.data && loginInfo.data.refreshToken) {
                      await saveTokenToBackend(loginInfo.data.refreshToken);
                    }
                    
                    // 通知主窗口登录成功
                    // 使用标志位防止重复发送
                    let eventSent = false;
                    const sendLoginSuccessEvent = () => {
                      // 如果事件已经发送成功，不再重复发送
                      if (eventSent) {
                        return;
                      }
                      
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        const eventData = {
                          accessToken: loginInfo.data.accessToken,
                          refreshToken: loginInfo.data.refreshToken,
                          expiresIn: loginInfo.data.expiresIn,
                          user: loginInfo.data.user,
                        };
                        console.log('📤 发送 login-success 事件到主窗口:', {
                          hasRefreshToken: !!eventData.refreshToken,
                          hasAccessToken: !!eventData.accessToken,
                          windowReady: !mainWindow.isDestroyed(),
                        });
                        try {
                          mainWindow.webContents.send('login-success', eventData);
                          console.log('✅ login-success 事件已发送');
                          eventSent = true; // 标记为已发送
                          resetLoginWindowFlag(); // 重置标志位
                          
                          setTimeout(() => {
                            const currentUrl = mainWindow.webContents.getURL();
                            console.log('🔍 当前页面 URL:', currentUrl);
                            if (currentUrl && currentUrl.includes('/login')) {
                              console.log('🔄 检测到仍在登录页面，尝试导航到 dashboard...');
                              mainWindow.webContents.executeJavaScript(`
                                if (window.location.pathname === '/login' || window.location.pathname.includes('/login')) {
                                  window.location.href = '/dashboard';
                                }
                              `).catch(err => {
                                console.error('❌ 执行导航脚本失败:', err.message);
                              });
                            }
                          }, 2000);
                        } catch (sendError) {
                          console.error('❌ 发送 login-success 事件失败:', sendError.message);
                          // 发送失败时不设置标志，允许重试
                        }
                      } else {
                        console.error('❌ 主窗口不存在或已销毁，无法发送事件');
                        // 窗口未准备好时不设置标志，允许重试
                      }
                    };
                    
                    // 立即尝试发送，如果页面未加载，延迟后重试（但只会发送一次）
                    sendLoginSuccessEvent();
                    setTimeout(sendLoginSuccessEvent, 500);
                    setTimeout(sendLoginSuccessEvent, 1000);
                  })
                  .catch(async (puppeteerError) => {
                    console.error('❌ Puppeteer 登录也失败:', puppeteerError);
                    
                    // 清除 code verifier
                    currentLoginCodeVerifier = null;
                    isProcessingAuthCode = false;
                    
                    // 通知主窗口登录失败
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('login-error', {
                        message: puppeteerError.message || 'Puppeteer 登录失败',
                        code: puppeteerError.code || 'PUPPETEER_LOGIN_ERROR'
                      });
                    }
                    resetLoginWindowFlag(); // 重置标志位
                  });
              } catch (fallbackError) {
                console.error('❌ 回退到 Puppeteer 时出错:', fallbackError);
                // 通知主窗口登录失败
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('login-error', {
                    message: error.message || 'pixiv-token-getter 登录失败，且无法回退到 Puppeteer',
                    code: error.code || 'TOKEN_GETTER_LOGIN_ERROR'
                  });
                }
                resetLoginWindowFlag(); // 重置标志位
              }
            } else {
              // 如果 Puppeteer 不可用，通知主窗口登录失败
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('login-error', {
                  message: error.message || 'pixiv-token-getter 登录失败，且 Puppeteer 不可用',
                  code: error.code || 'TOKEN_GETTER_LOGIN_ERROR'
                });
              }
              resetLoginWindowFlag(); // 重置标志位
            }
          });
        
        return { success: true, method: 'pixiv-token-getter' };
      } else if (usePuppeteer) {
        console.log('📞 收到打开登录窗口的请求（使用 Puppeteer）');
        
        // 生成 PKCE 参数
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        console.log('✅ PKCE 参数已生成');
        console.log('   Code Challenge:', codeChallenge);
        console.log('   Code Verifier (前20字符):', codeVerifier.substring(0, 20) + '...');
        
        // 保存 code verifier 供后续使用
        currentLoginCodeVerifier = codeVerifier;
        isProcessingAuthCode = false;
        
        // 使用 Puppeteer 进行登录（异步执行，不阻塞响应）
        loginWithPuppeteer(codeVerifier, codeChallenge, proxyConfig)
          .then(async (loginInfo) => {
            console.log('✅ Puppeteer 登录成功');
            
            // 清除 code verifier
            currentLoginCodeVerifier = null;
            isProcessingAuthCode = false;
            
            // 保存 token 到后端
            if (loginInfo && loginInfo.data && loginInfo.data.refreshToken) {
              await saveTokenToBackend(loginInfo.data.refreshToken);
            }
            
            // 通知主窗口登录成功
            // 使用标志位防止重复发送
            let eventSent = false;
            const sendLoginSuccessEvent = () => {
              // 如果事件已经发送成功，不再重复发送
              if (eventSent) {
                return;
              }
              
              if (mainWindow && !mainWindow.isDestroyed()) {
                const eventData = {
                  accessToken: loginInfo.data.accessToken,
                  refreshToken: loginInfo.data.refreshToken,
                  expiresIn: loginInfo.data.expiresIn,
                  user: loginInfo.data.user,
                };
                console.log('📤 发送 login-success 事件到主窗口:', {
                  hasRefreshToken: !!eventData.refreshToken,
                  hasAccessToken: !!eventData.accessToken,
                  windowReady: !mainWindow.isDestroyed(),
                });
                try {
                  mainWindow.webContents.send('login-success', eventData);
                  console.log('✅ login-success 事件已发送');
                  eventSent = true; // 标记为已发送
                  
                  // 如果事件发送成功，也可以尝试重新加载页面或导航到 dashboard
                  // 作为备选方案，等待 2 秒后检查是否需要手动导航
                  setTimeout(() => {
                    const currentUrl = mainWindow.webContents.getURL();
                    console.log('🔍 当前页面 URL:', currentUrl);
                    // 如果还在登录页面，尝试导航到 dashboard
                    if (currentUrl && currentUrl.includes('/login')) {
                      console.log('🔄 检测到仍在登录页面，尝试导航到 dashboard...');
                      mainWindow.webContents.executeJavaScript(`
                        if (window.location.pathname === '/login' || window.location.pathname.includes('/login')) {
                          window.location.href = '/dashboard';
                        }
                      `).catch(err => {
                        console.error('❌ 执行导航脚本失败:', err.message);
                      });
                    }
                  }, 2000);
                } catch (sendError) {
                  console.error('❌ 发送 login-success 事件失败:', sendError.message);
                  // 发送失败时不设置标志，允许重试
                }
              } else {
                console.error('❌ 主窗口不存在或已销毁，无法发送事件');
                // 窗口未准备好时不设置标志，允许重试
              }
            };
            
            // 立即尝试发送，如果页面未加载，延迟后重试（但只会发送一次）
            sendLoginSuccessEvent();
            setTimeout(sendLoginSuccessEvent, 500);
            setTimeout(sendLoginSuccessEvent, 1000);
          })
          .catch(async (error) => {
            console.error('❌ Puppeteer 登录失败:', error);
            
            // 清除 code verifier
            currentLoginCodeVerifier = null;
            isProcessingAuthCode = false;
            
            // 通知主窗口登录失败
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('login-error', {
                message: error.message || 'Puppeteer 登录失败',
                code: error.code || 'PUPPETEER_LOGIN_ERROR'
              });
            }
            resetLoginWindowFlag(); // 重置标志位
          });
        
        return { 
          success: true, 
          message: 'Puppeteer 登录窗口已打开，请完成登录。',
          windowOpened: true,
          method: 'puppeteer'
        };
      } else {
        // pixiv-token-getter 和 Puppeteer 都不可用，返回错误
        console.error('❌ pixiv-token-getter 和 Puppeteer 都不可用，无法进行登录');
        resetLoginWindowFlag(); // 重置标志位
        
        return {
          success: false,
          error: 'pixiv-token-getter 和 Puppeteer 都不可用。请确保已安装 pixiv-token-getter 或 puppeteer-core。',
          code: 'NO_LOGIN_METHOD_AVAILABLE'
        };
      }
    } catch (error) {
      console.error('❌ 打开登录窗口失败:', error);
      console.error('错误堆栈:', error.stack);
      
      // 清除 code verifier
      currentLoginCodeVerifier = null;
      isProcessingAuthCode = false;
      
      // 通知主窗口登录失败
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('login-error', {
          message: error.message || '打开登录窗口失败',
          code: error.code || 'UNKNOWN_ERROR'
        });
      }
      
      resetLoginWindowFlag(); // 重置标志位
      return { success: false, error: error.message };
    }
  });

  // 关闭登录窗口
  ipcMain.handle('close-login-window', async () => {
    // 关闭 BrowserWindow 登录窗口
    if (loginWindow) {
      closeLoginWindow();
    }
    
    // 关闭 Puppeteer 浏览器
    if (puppeteerBrowser) {
      try {
        await puppeteerBrowser.close();
        puppeteerBrowser = null;
        console.log('✅ Puppeteer 浏览器已关闭');
      } catch (error) {
        console.error('❌ 关闭 Puppeteer 浏览器时出错:', error);
      }
    }
    
    // 清除 code verifier
    currentLoginCodeVerifier = null;
    isProcessingAuthCode = false;
    
    if (loginWindow || puppeteerBrowser) {
      return { success: true };
    }
    return { success: false, error: '登录窗口不存在' };
  });

  // 窗口控制 IPC 处理程序
  ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
}

function createWindow() {
  // 恢复窗口状态（如果之前保存过）
  const windowState = getWindowState();
  
  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    // icon: path.join(__dirname, '../build/icon.png'), // 可选：应用图标
    show: true, // 立即显示窗口，避免白屏
  });

  // 保存窗口状态
  mainWindow.on('moved', () => saveWindowState());
  mainWindow.on('resized', () => saveWindowState());

  // 加载应用 - 使用智能加载页面，自动检测和连接
  const loadingHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PixivFlow - 启动中...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      color: white;
    }
    .container {
      text-align: center;
      max-width: 500px;
      padding: 40px;
    }
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h1 { margin: 0 0 10px 0; font-size: 24px; font-weight: 600; }
    .status { margin: 10px 0; opacity: 0.9; font-size: 14px; min-height: 20px; }
    .error { color: #ffcccb; margin-top: 20px; padding: 15px; background: rgba(255,0,0,0.2); border-radius: 8px; display: none; }
    .error.show { display: block; }
    .retry-btn { 
      margin-top: 15px; 
      padding: 10px 20px; 
      background: white; 
      color: #667eea; 
      border: none; 
      border-radius: 6px; 
      cursor: pointer; 
      font-size: 14px;
      font-weight: 600;
      display: none;
    }
    .retry-btn.show { display: inline-block; }
    .retry-btn:hover { background: #f0f0f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>PixivFlow</h1>
    <div class="status" id="status">正在启动...</div>
    <div class="error" id="error"></div>
    <button class="retry-btn" id="retryBtn" onclick="retryConnection()">重试连接</button>
  </div>
  <script>
    const isDev = ${isDev};
    const viteUrl = 'http://localhost:5173';
    const backendUrl = 'http://localhost:' + ${actualBackendPort};
    let currentUrl = null;
    
    function updateStatus(text) {
      document.getElementById('status').textContent = text;
    }
    
    function showError(text) {
      const errorEl = document.getElementById('error');
      errorEl.textContent = text;
      errorEl.classList.add('show');
      document.getElementById('retryBtn').classList.add('show');
    }
    
    function checkServer(url, callback) {
      fetch(url + '/api/health', { 
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      })
      .then(res => res.ok ? callback(true) : callback(false))
      .catch(() => callback(false));
    }
    
    function tryConnect() {
      if (isDev) {
        // 开发模式：先尝试 Vite
        updateStatus('正在连接 Vite 开发服务器...');
        checkServer(viteUrl, (available) => {
          if (available) {
            updateStatus('连接成功，正在加载...');
            currentUrl = viteUrl;
            window.location.href = viteUrl;
          } else {
            // 回退到后端
            updateStatus('Vite 不可用，尝试后端服务器...');
            tryBackend();
          }
        });
      } else {
        // 生产模式：直接使用后端
        tryBackend();
      }
    }
    
    let checkInterval = null;
    let isConnecting = false;
    
    function stopConnecting() {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      isConnecting = false;
    }
    
    function tryBackend() {
      if (isConnecting) {
        return; // 已经在连接中，避免重复连接
      }
      
      isConnecting = true;
      updateStatus('正在连接后端服务器...');
      let attempts = 0;
      const maxAttempts = 120; // 60秒
      
      checkInterval = setInterval(() => {
        attempts++;
        checkServer(backendUrl, (available) => {
          if (available) {
            stopConnecting();
            updateStatus('连接成功，正在加载...');
            currentUrl = backendUrl;
            window.location.href = backendUrl;
          } else if (attempts >= maxAttempts) {
            stopConnecting();
            showError('无法连接到后端服务器。请检查后端是否正常启动。');
          }
        });
      }, 500);
    }
    
    function retryConnection() {
      stopConnecting();
      document.getElementById('error').classList.remove('show');
      document.getElementById('retryBtn').classList.remove('show');
      tryConnect();
    }
    
    // 监听 Electron IPC 消息（改进版：更可靠的设置方式）
    let ipcListenerSetup = false;
    function setupIpcListener() {
      if (ipcListenerSetup) {
        return; // 避免重复设置
      }
      
      if (window.electron && window.electron.onBackendReady && window.electron.onBackendError) {
        ipcListenerSetup = true;
        console.log('[Loading] IPC 监听器已设置');
        
        // 监听后端就绪事件
        window.electron.onBackendReady(() => {
          console.log('[Loading] 收到后端就绪消息');
          stopConnecting(); // 停止轮询
          updateStatus('后端已就绪，正在加载...');
          // 立即检查后端是否真的可用
          checkServer(backendUrl, (available) => {
            if (available) {
              currentUrl = backendUrl;
              window.location.href = backendUrl;
            } else {
              // 如果后端还没完全准备好，等待一下再试
              setTimeout(() => {
                checkServer(backendUrl, (available) => {
                  if (available) {
                    currentUrl = backendUrl;
                    window.location.href = backendUrl;
                  } else {
                    // 如果还是不可用，继续轮询
                    console.log('[Loading] 后端消息已收到但服务未就绪，继续轮询...');
                    isConnecting = false; // 重置状态，允许重新连接
                    tryBackend();
                  }
                });
              }, 500);
            }
          });
        });
        
        // 监听后端错误事件
        window.electron.onBackendError((error) => {
          console.log('[Loading] 收到后端错误消息:', error);
          stopConnecting(); // 停止轮询
          showError(error || '后端服务器启动失败');
        });
      } else {
        // 如果 electron 对象还没准备好，等待一下再试（最多尝试20次，2秒）
        let retryCount = 0;
        const maxRetries = 20;
        const retryInterval = setInterval(() => {
          retryCount++;
          if (window.electron && window.electron.onBackendReady && window.electron.onBackendError) {
            clearInterval(retryInterval);
            setupIpcListener();
          } else if (retryCount >= maxRetries) {
            clearInterval(retryInterval);
            console.warn('[Loading] IPC 监听器设置失败，将仅使用 HTTP 轮询');
          }
        }, 100);
      }
    }
    
    // 立即尝试设置监听器
    setupIpcListener();
    
    // 等待 DOM 加载完成后再设置监听器（作为备用）
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupIpcListener, 50);
      });
    } else {
      setTimeout(setupIpcListener, 50);
    }
    
    // 开始连接
    tryConnect();
  </script>
</body>
</html>`;
  
  if (isDev) {
    // 开发模式：先显示加载页面，然后尝试连接
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
    // 打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：显示加载页面，自动连接后端
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
  }
  

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 窗口崩溃处理
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('❌ 渲染进程崩溃:', details);
    console.error('崩溃原因:', details.reason);
    console.error('退出码:', details.exitCode);
    
    // 将崩溃信息写入日志
    try {
      const userDataPath = app.getPath('userData');
      const logDir = path.join(userDataPath, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, `renderer-crash-${Date.now()}.log`);
      fs.writeFileSync(logFile, `渲染进程崩溃\n原因: ${details.reason}\n退出码: ${details.exitCode}\n`, 'utf8');
      console.error(`崩溃日志已保存到: ${logFile}`);
    } catch (logError) {
      console.error('无法写入崩溃日志:', logError);
    }
    
    // 显示错误对话框
    if (!isDev) {
      dialog.showErrorBox('窗口崩溃', `渲染进程崩溃:\n\n原因: ${details.reason}\n\n应用将尝试重新加载窗口。`);
    }
    
    // 尝试重新加载窗口
    if (details.reason === 'crashed') {
      safeSetTimeout(() => {
        if (mainWindow && !isAppClosing) {
          console.log('🔄 尝试重新加载窗口...');
          mainWindow.reload();
        }
      }, 1000);
    } else if (details.reason === 'killed') {
      // 如果进程被杀死，可能需要重新创建窗口
      safeSetTimeout(() => {
        if (!isAppClosing) {
          console.log('🔄 重新创建窗口...');
          if (mainWindow) {
            mainWindow.destroy();
          }
          createWindow();
        }
      }, 1000);
    }
  });

  // 未捕获的异常处理（渲染进程）
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('⚠️  窗口无响应');
    if (!isDev) {
      const response = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: '窗口无响应',
        message: '窗口似乎无响应。是否等待或重新加载？',
        buttons: ['等待', '重新加载', '关闭'],
        defaultId: 0,
      });
      
      if (response === 1) {
        mainWindow.reload();
      } else if (response === 2) {
        mainWindow.close();
      }
    }
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('✅ 窗口已恢复响应');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 监听窗口加载完成事件，检查是否有待发送的后端就绪通知
  mainWindow.webContents.once('did-finish-load', () => {
    safeLog('📄 窗口加载完成，检查后端状态');
    // 延迟一点，确保 preload 脚本已执行
    safeSetTimeout(() => {
      checkAndSendPendingReadyNotification();
      // 如果后端已就绪，立即发送消息
      if (backendReadyState) {
        notifyBackendReady();
      }
    }, 300);
  });
  
  // 监听 DOM 准备完成（更早的事件）
  mainWindow.webContents.once('dom-ready', () => {
    safeLog('📄 DOM 准备完成');
    // 延迟一点，确保 preload 脚本已执行
    safeSetTimeout(() => {
      checkAndSendPendingReadyNotification();
    }, 200);
  });
}

// 应用准备就绪
app.whenReady().then(() => {
  console.log('🚀 Electron 应用准备就绪');
  console.log(`📦 运行模式: ${isDev ? '开发模式' : '生产模式'}`);
  console.log(`📁 __dirname: ${__dirname}`);
  if (isDev) {
    console.log(`📁 项目根目录: ${getProjectRoot()}`);
  } else {
    console.log(`📁 resourcesPath: ${process.resourcesPath}`);
  }
  
  // 初始化应用数据目录（开发模式和生产模式都初始化，确保数据一致性）
  // 这样可以确保开发和生产环境使用相同的数据目录，避免数据混乱
  appData = initializeAppData();
  if (appData) {
    console.log(`✅ 应用数据目录已初始化: ${appData.appDataDir}`);
    console.log(`📁 配置文件路径: ${appData.configPath}`);
    console.log(`📁 数据目录: ${appData.dataDir}`);
    console.log(`📁 下载目录: ${appData.downloadsDir}`);
  } else {
    console.error('❌ 无法初始化应用数据目录');
  }
  
  // 初始化 IPC 处理程序（在创建窗口之前）
  setupIpcHandlers();
  
  // 立即创建窗口，避免白屏
  createWindow();
  
  // 启动后端服务器
  startBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时
app.on('window-all-closed', () => {
  // macOS 上通常应用会保持运行
  if (process.platform !== 'darwin') {
    clearAllTimers();
    // stopBackend 现在是 async 函数，但在应用关闭时我们不需要等待
    stopBackend().catch(err => {
      safeError('停止后端进程时出错:', err);
    });
    app.quit();
  }
});

// 应用退出前
app.on('before-quit', () => {
  clearAllTimers();
  stopBackend();
});

// 保存和恢复窗口状态
function getWindowState() {
  const userDataPath = app.getPath('userData');
  const statePath = path.join(userDataPath, 'window-state.json');
  try {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return state;
    }
  } catch (err) {
    console.warn('无法读取窗口状态:', err.message);
  }
  return {};
}

function saveWindowState() {
  if (!mainWindow) return;
  const userDataPath = app.getPath('userData');
  const statePath = path.join(userDataPath, 'window-state.json');
  try {
    const bounds = mainWindow.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('无法保存窗口状态:', err.message);
  }
}

// 处理协议（可选：自定义协议如 pixivflow://）
app.setAsDefaultProtocolClient('pixivflow');

