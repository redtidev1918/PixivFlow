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
  if (isDev) {
    // 开发模式下，使用项目根目录的配置
    return null;
  }
  
  // 生产模式下，使用应用的用户数据目录
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

// 启动后端服务器
function startBackend() {
  if (backendProcess) {
    console.log('⚠️  后端进程已存在，跳过启动');
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
    
    // 在开发模式下，也设置 STATIC_PATH，以便后端可以提供静态文件服务
    // 前端构建目录在 webui-frontend/dist
    const frontendDistPath = path.join(__dirname, '..', 'dist');
    const staticPath = fs.existsSync(frontendDistPath) ? frontendDistPath : undefined;
    
    console.log(`🚀 执行命令: npm run webui (在 ${projectRoot})`);
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
    };
    
    backendProcess = spawn('npm', ['run', 'webui'], {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit',
      env: env,
    });
  } else {
    // 生产模式下，从 extraResources 加载后端
    // electron-builder 会将后端文件复制到 resources/dist
    const backendPath = path.join(process.resourcesPath, 'dist', 'webui', 'index.js');
    // 前端静态文件路径（在打包后的应用中）
    // 前端 dist 也在 extraResources 中，路径为 resources/webui-dist
    const staticPath = path.join(process.resourcesPath, 'webui-dist');
    
    console.log(`🔧 生产模式：启动后端服务器`);
    console.log(`📁 resourcesPath: ${process.resourcesPath}`);
    console.log(`📁 后端路径: ${backendPath}`);
    console.log(`📁 静态文件路径: ${staticPath}`);
    
    // 验证后端文件是否存在
    if (!validatePath(backendPath, '后端文件')) {
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
    
    console.log(`🚀 启动后端进程: node ${backendPath}`);
    console.log(`📦 NODE_PATH: ${nodePath}`);
    console.log(`📁 STATIC_PATH: ${staticPath}`);
    console.log(`📁 配置文件路径: ${appData.configPath}`);
    console.log(`📁 应用数据目录: ${appData.appDataDir}`);
    console.log(`📁 STATIC_PATH 存在: ${fs.existsSync(staticPath)}`);
    if (fs.existsSync(staticPath)) {
      console.log(`📁 STATIC_PATH 内容: ${fs.readdirSync(staticPath).join(', ')}`);
    }
    backendProcess = spawn('node', [backendPath], {
      stdio: ['ignore', 'pipe', 'pipe'], // 使用 pipe 以便捕获输出
      cwd: appData.appDataDir, // 设置工作目录为应用数据目录
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NODE_PATH: nodePath, // 设置 NODE_PATH 以加载后端依赖
        STATIC_PATH: staticPath,
        PORT: BACKEND_PORT.toString(),
        HOST: 'localhost',
        PIXIV_DOWNLOADER_CONFIG: appData.configPath, // 设置配置文件路径
      },
    });

    // 输出后端进程的 stdout 和 stderr（用于调试）
    if (backendProcess.stdout) {
      backendProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[Backend] ${output}`);
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
    show: false, // 先不显示，等加载完成后再显示
  });

  // 保存窗口状态
  mainWindow.on('moved', () => saveWindowState());
  mainWindow.on('resized', () => saveWindowState());

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 加载应用
  if (isDev) {
    // 开发模式：优先连接到 Vite 开发服务器，如果不可用则使用后端服务器
    const viteUrl = 'http://localhost:5173';
    const backendUrl = `http://localhost:${BACKEND_PORT}`;
    console.log(`🌐 开发模式：尝试连接到 Vite 服务器 ${viteUrl}`);
    
    // 检查 Vite 服务器是否可用
    const http = require('http');
    const checkVite = http.get(viteUrl, (res) => {
      safeLog(`✅ Vite 服务器可用，加载页面`);
      if (mainWindow && !isAppClosing) {
        mainWindow.loadURL(viteUrl);
        // 打开开发者工具
        mainWindow.webContents.openDevTools();
      }
    });
    
    checkVite.on('error', (err) => {
      safeError(`❌ 无法连接到 Vite 服务器 (${viteUrl})`);
      safeError('提示: 请确保已运行 "npm run dev" 启动 Vite 开发服务器');
      safeError('错误详情:', err.message);
      safeLog(`🔄 回退到后端服务器: ${backendUrl}`);
      
      // 如果 Vite 服务器不可用，尝试使用后端服务器
      // 等待后端服务器启动后再加载
      let attempts = 0;
      const maxAttempts = 40; // 最多尝试 40 次（20秒）
      const checkBackend = safeSetInterval(() => {
        if (isAppClosing) return;
        attempts++;
        const req = http.get(`${backendUrl}/api/health`, (res) => {
          if (res.statusCode === 200) {
            clearInterval(checkBackend);
            activeTimers.delete(checkBackend);
            safeLog('✅ 后端服务器可用，加载页面');
            if (mainWindow && !isAppClosing) {
              mainWindow.loadURL(backendUrl);
              mainWindow.webContents.openDevTools();
            }
          }
        });
        req.on('error', (err) => {
          // 后端还未启动，继续等待
          if (attempts >= maxAttempts) {
            clearInterval(checkBackend);
            activeTimers.delete(checkBackend);
            safeError('❌ 后端服务器启动失败');
            safeError('尝试加载后端服务器页面...');
            if (mainWindow && !isAppClosing) {
              mainWindow.loadURL(backendUrl);
              mainWindow.webContents.openDevTools();
            }
          }
        });
        req.setTimeout(1000, () => {
          req.destroy();
        });
      }, 500);
    });
    
    checkVite.setTimeout(2000, () => {
      if (isAppClosing) return;
      checkVite.destroy();
      safeLog('⚠️  Vite 服务器检查超时，回退到后端服务器');
      // 如果 Vite 服务器超时，尝试使用后端服务器
      let attempts = 0;
      const maxAttempts = 40;
      const checkBackend = safeSetInterval(() => {
        if (isAppClosing) return;
        attempts++;
        const req = http.get(`${backendUrl}/api/health`, (res) => {
          if (res.statusCode === 200) {
            clearInterval(checkBackend);
            activeTimers.delete(checkBackend);
            safeLog('✅ 后端服务器可用，加载页面');
            if (mainWindow && !isAppClosing) {
              mainWindow.loadURL(backendUrl);
              mainWindow.webContents.openDevTools();
            }
          }
        });
        req.on('error', (err) => {
          if (attempts >= maxAttempts) {
            clearInterval(checkBackend);
            activeTimers.delete(checkBackend);
            safeError('❌ 后端服务器启动失败');
            if (mainWindow && !isAppClosing) {
              mainWindow.loadURL(backendUrl);
              mainWindow.webContents.openDevTools();
            }
          }
        });
        req.setTimeout(1000, () => {
          req.destroy();
        });
      }, 500);
    });
  } else {
    // 生产模式：通过后端服务器加载（后端会提供静态文件服务）
    // 等待后端服务器启动后再加载
    let attempts = 0;
    const maxAttempts = 40; // 最多尝试 40 次（20秒）
    const checkBackend = safeSetInterval(() => {
      if (isAppClosing) return;
      attempts++;
      const http = require('http');
      const req = http.get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkBackend);
          activeTimers.delete(checkBackend);
          safeLog('Backend server is ready, loading window...');
          if (mainWindow && !isAppClosing) {
            mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
          }
        }
      });
      req.on('error', (err) => {
        // 后端还未启动，继续等待
        if (attempts >= maxAttempts) {
          clearInterval(checkBackend);
          activeTimers.delete(checkBackend);
          safeError('Backend server failed to start after 20 seconds');
          safeError('Attempting to load anyway...');
          if (mainWindow && !isAppClosing) {
            mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
          }
        }
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    }, 500);
  }

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
  
  // 启动后端服务器
  startBackend();

  // 等待后端服务器启动（给一点时间）
  safeSetTimeout(() => {
    if (!isAppClosing) {
      createWindow();
    }
  }, 2000);

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

