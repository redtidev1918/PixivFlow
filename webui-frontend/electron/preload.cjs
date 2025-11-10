const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // 获取平台信息
  platform: process.platform,
  
  // 获取版本信息
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // 窗口控制（如果需要）
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // 后端就绪事件
  onBackendReady: (callback) => {
    ipcRenderer.on('backend-ready', callback);
  },
  
  // 后端错误事件
  onBackendError: (callback) => {
    ipcRenderer.on('backend-error', (event, error) => callback(error));
  },

  // 登录相关
  openLoginWindow: () => ipcRenderer.invoke('open-login-window'),
  closeLoginWindow: () => ipcRenderer.invoke('close-login-window'),
  onLoginSuccess: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('login-success', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('login-success', handler);
    };
  },
  onLoginError: (callback) => {
    const handler = (event, error) => callback(error);
    ipcRenderer.on('login-error', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('login-error', handler);
    };
  },

  // 文件系统操作（如果需要）
  // openFile: () => ipcRenderer.invoke('dialog:openFile'),
  // saveFile: () => ipcRenderer.invoke('dialog:saveFile'),
});

// 向后兼容
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});


