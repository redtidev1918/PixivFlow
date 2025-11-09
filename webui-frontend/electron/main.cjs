const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 3000;
let isAppClosing = false;
const activeTimers = new Set(); // 跟踪所有活动的定时器
let appData = null; // 应用数据目录信息（生产模式下）

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
        "illustrationDirectory": path.join(downloadsDir, 'illustrations'),
        "novelDirectory": path.join(downloadsDir, 'novels'),
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

// 检查后端是否已启动
function checkBackendReady(callback) {
  const http = require('http');
  const req = http.get(`http://localhost:${BACKEND_PORT}/api/health`, { timeout: 1000 }, (res) => {
    if (res.statusCode === 200) {
      callback(true);
    } else {
      callback(false);
    }
  });
  req.on('error', () => callback(false));
  req.on('timeout', () => {
    req.destroy();
    callback(false);
  });
}

// 通知窗口后端已就绪
function notifyBackendReady() {
  if (mainWindow && !isAppClosing) {
    safeLog('✅ 后端服务器已就绪，通知窗口');
    mainWindow.webContents.send('backend-ready');
  }
}

// 启动后端服务器
function startBackend() {
  if (backendProcess) {
    console.log('⚠️  后端进程已存在，跳过启动');
    // 检查后端是否已经就绪
    checkBackendReady((ready) => {
      if (ready) {
        notifyBackendReady();
      }
    });
    return;
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
    if (!needsBuild) {
      backendProcess = spawn('node', [backendDistPath], {
        cwd: projectRoot,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env,
      });
    } else {
      backendProcess = spawn('npm', ['run', 'webui'], {
        cwd: projectRoot,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env,
      });
    }
    
    // 监听后端进程输出，检测启动完成
    let backendReady = false;
    const checkReady = () => {
      if (!backendReady) {
        checkBackendReady((ready) => {
          if (ready && !backendReady) {
            backendReady = true;
            notifyBackendReady();
          }
        });
      }
    };
    
    // 定期检查后端是否就绪（最多30秒）
    let checkAttempts = 0;
    const maxCheckAttempts = 60; // 30秒
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
        safeError('⚠️  后端服务器启动检查超时');
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
            safeSetTimeout(() => checkReady(), 500);
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

    console.log(`🚀 启动后端进程: ${backendExecutable} ${finalBackendPath}`);
    console.log(`📦 NODE_PATH: ${nodePath}`);
    console.log(`📁 STATIC_PATH: ${staticPath}`);
    console.log(`📁 配置文件路径: ${appData.configPath}`);
    console.log(`📁 应用数据目录: ${appData.appDataDir}`);
    console.log(`📁 ELECTRON_RUN_AS_NODE: ${backendEnv.ELECTRON_RUN_AS_NODE}`);
    console.log(`📁 STATIC_PATH 存在: ${fs.existsSync(staticPath)}`);
    if (fs.existsSync(staticPath)) {
      console.log(`📁 STATIC_PATH 内容: ${fs.readdirSync(staticPath).join(', ')}`);
    }
    backendProcess = spawn(backendExecutable, [finalBackendPath], {
      stdio: ['ignore', 'pipe', 'pipe'], // 使用 pipe 以便捕获输出
      cwd: appData.appDataDir, // 设置工作目录为应用数据目录
      env: backendEnv,
    });

    // 监听后端进程输出，检测启动完成
    let backendReady = false;
    const checkReady = () => {
      if (!backendReady) {
        checkBackendReady((ready) => {
          if (ready && !backendReady) {
            backendReady = true;
            notifyBackendReady();
          }
        });
      }
    };
    
    // 定期检查后端是否就绪（最多30秒）
    let checkAttempts = 0;
    const maxCheckAttempts = 60; // 30秒
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
        safeError('⚠️  后端服务器启动检查超时');
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
            safeSetTimeout(() => checkReady(), 500);
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
      console.error('❌ 后端进程启动错误:', err);
      console.error('错误详情:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', err.message);
      }
      backendProcess = null;
    });

    backendProcess.on('exit', (code, signal) => {
      if (code === 0) {
        console.log('✅ 后端进程正常退出');
      } else {
        console.error(`❌ 后端进程异常退出，退出码: ${code}, 信号: ${signal || '无'}`);
        // 如果不是主动退出，尝试重启（最多重试3次）
        if (code !== null && code !== 0 && !signal) {
          safeLog('⚠️  后端进程异常退出，将在3秒后尝试重启...');
          safeSetTimeout(() => {
            if (!backendProcess && !isAppClosing) {
              safeLog('🔄 尝试重启后端进程...');
              startBackend();
            }
          }, 3000);
        }
      }
      backendProcess = null;
    });
  }
}

// 停止后端服务器
function stopBackend() {
  if (backendProcess) {
    console.log('🛑 正在停止后端服务器...');
    // 尝试优雅关闭
    if (process.platform === 'win32') {
      backendProcess.kill();
    } else {
      backendProcess.kill('SIGTERM');
      // 如果3秒后还没退出，强制杀死
      safeSetTimeout(() => {
        if (backendProcess && !isAppClosing) {
          safeLog('⚠️  后端进程未响应 SIGTERM，强制终止...');
          backendProcess.kill('SIGKILL');
        }
      }, 3000);
    }
    backendProcess = null;
  }
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
    const backendUrl = 'http://localhost:${BACKEND_PORT}';
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
    
    function tryBackend() {
      updateStatus('正在连接后端服务器...');
      let attempts = 0;
      const maxAttempts = 60; // 30秒
      
      const checkInterval = setInterval(() => {
        attempts++;
        checkServer(backendUrl, (available) => {
          if (available) {
            clearInterval(checkInterval);
            updateStatus('连接成功，正在加载...');
            currentUrl = backendUrl;
            window.location.href = backendUrl;
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            showError('无法连接到后端服务器。请检查后端是否正常启动。');
          }
        });
      }, 500);
    }
    
    function retryConnection() {
      document.getElementById('error').classList.remove('show');
      document.getElementById('retryBtn').classList.remove('show');
      tryConnect();
    }
    
    // 监听 Electron IPC 消息
    if (window.electron && window.electron.onBackendReady) {
      window.electron.onBackendReady(() => {
        updateStatus('后端已就绪，正在加载...');
        if (!currentUrl) {
          currentUrl = backendUrl;
          window.location.href = backendUrl;
        }
      });
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
  
  // 监听后端就绪事件
  ipcMain.on('backend-ready', () => {
    notifyBackendReady();
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用准备就绪
app.whenReady().then(() => {
  console.log('🚀 Electron 应用准备就绪');
  console.log(`📦 运行模式: ${isDev ? '开发模式' : '生产模式'}`);
  console.log(`📁 __dirname: ${__dirname}`);
  console.log(`📁 项目根目录: ${getProjectRoot()}`);
  
  // 初始化应用数据目录（生产模式下）
  if (!isDev) {
    appData = initializeAppData();
    if (appData) {
      console.log(`✅ 应用数据目录已初始化: ${appData.appDataDir}`);
    }
  }
  
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
    stopBackend();
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

// IPC 处理器：窗口控制
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

// 处理协议（可选：自定义协议如 pixivflow://）
app.setAsDefaultProtocolClient('pixivflow');

