# Puppeteer 登录方案 - 无需 Python！

## 概述

PixivFlow 现在使用 **Puppeteer**（Node.js 原生浏览器自动化工具）作为主要登录方式，完全消除了对 Python 和 gppt 的依赖。

### 优势

✅ **无需外部依赖**: 不需要安装 Python 或 gppt  
✅ **更小的应用体积**: 避免打包 Python 环境（节省 50-100MB+）  
✅ **更好的集成**: 与 Node.js/Electron 完美集成  
✅ **更快的启动**: 无需启动 Python 解释器  
✅ **更易维护**: 纯 JavaScript/TypeScript 实现  
✅ **自动降级**: 如果 Puppeteer 失败，自动尝试 Python gppt（如果可用）

## 工作原理

### 登录流程

1. **首选方案**: 使用 Puppeteer（Node.js 原生）
   - Puppeteer 已作为项目依赖安装
   - 无需用户安装任何额外软件
   - 使用 Chrome/Chromium 进行浏览器自动化

2. **备选方案**: 使用 Python gppt（仅在 Puppeteer 失败时）
   - 需要用户安装 Python 3.9+ 和 gppt
   - 仅作为后备方案

### 技术实现

Puppeteer 登录实现位于 `src/puppeteer-login-adapter.ts`，基于 gppt 的实现逻辑：

1. **PKCE 认证流程**: 使用 Proof Key for Code Exchange (PKCE) 进行安全认证
2. **浏览器自动化**: 使用 Puppeteer 控制 Chrome 浏览器
3. **两种模式**:
   - **交互模式**: 打开浏览器窗口，用户手动登录
   - **无头模式**: 后台运行，自动填写用户名和密码

## 使用方法

### 桌面应用（Electron）

1. **启动应用**:
   ```bash
   # 应用已包含 Puppeteer，无需额外安装
   open webui-frontend/release/mac-arm64/PixivFlow.app
   ```

2. **登录**:
   - 打开登录页面
   - 选择登录模式（交互或无头）
   - 点击"开始登录"
   - Puppeteer 会自动处理登录流程

3. **诊断**:
   - 点击"诊断登录环境"按钮
   - 查看 Puppeteer 是否可用
   - 应该显示 "Puppeteer is available and will be used (no Python needed!)"

### 命令行

```bash
# 交互模式（推荐）
npm run login

# 无头模式
npm run login:headless

# 强制使用 Python gppt（如果需要）
# 需要在代码中设置 forcePython: true
```

## 配置

### 代理设置

Puppeteer 支持代理配置，与 Python gppt 相同：

```typescript
const proxyConfig = {
  enabled: true,
  host: 'your-proxy-host',
  port: 1080,
  protocol: 'http', // 或 'https', 'socks4', 'socks5'
  username: 'optional-username',
  password: 'optional-password',
};
```

在桌面应用中，可以在"配置"页面设置代理。

### 超时设置

- **交互模式**: 5 分钟（300 秒）- 用户有足够时间手动登录
- **无头模式**: 2 分钟（120 秒）- 自动登录通常很快

## 故障排查

### Puppeteer 不可用

如果诊断显示 Puppeteer 不可用：

1. **检查依赖**:
   ```bash
   cd /path/to/pixivflow
   npm list puppeteer
   ```

2. **重新安装**:
   ```bash
   npm install
   ```

3. **手动安装 Puppeteer**:
   ```bash
   npm install puppeteer
   ```

### 登录失败

如果 Puppeteer 登录失败：

1. **查看错误信息**: 检查控制台输出
2. **尝试交互模式**: 交互模式更稳定，可以看到登录页面
3. **检查网络**: 确保可以访问 Pixiv（可能需要代理）
4. **使用 Python 备选**: 系统会自动尝试 Python gppt

### Chrome/Chromium 问题

Puppeteer 会自动下载 Chromium。如果遇到问题：

1. **检查 Chromium 下载**:
   ```bash
   # Puppeteer 会下载 Chromium 到 node_modules/puppeteer/.local-chromium/
   ls node_modules/puppeteer/.local-chromium/
   ```

2. **手动下载 Chromium**:
   ```bash
   npx puppeteer browsers install chrome
   ```

3. **使用系统 Chrome**:
   ```typescript
   // 在 puppeteer-login-adapter.ts 中配置
   const browser = await puppeteer.launch({
     executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
     // ...
   });
   ```

## 与 Python gppt 的对比

| 特性 | Puppeteer | Python gppt |
|------|-----------|-------------|
| 外部依赖 | ❌ 无 | ✅ 需要 Python 3.9+ 和 gppt |
| 应用体积 | ✅ 小（Puppeteer ~300MB，但可共享） | ❌ 大（Python 环境 50-100MB+） |
| 安装复杂度 | ✅ 简单（npm install） | ❌ 复杂（需要 Python 和 pip） |
| 跨平台 | ✅ 优秀 | ⚠️ 一般（需要配置 PATH） |
| 维护性 | ✅ 高（纯 TypeScript） | ⚠️ 中（需要维护 Python 集成） |
| 性能 | ✅ 快 | ⚠️ 稍慢（需要启动 Python） |
| 稳定性 | ✅ 高 | ✅ 高 |
| Electron 集成 | ✅ 完美 | ⚠️ 需要额外配置 |

## 开发者信息

### 文件结构

```
src/
├── puppeteer-login-adapter.ts  # Puppeteer 登录实现
├── python-login-adapter.ts     # Python gppt 登录实现（备选）
├── terminal-login.ts            # 登录主逻辑（自动选择方案）
└── webui/routes/auth.ts        # Web API 路由
```

### API

#### `loginWithPuppeteerInteractive(proxy?)`

交互模式登录，打开浏览器窗口。

```typescript
import { loginWithPuppeteerInteractive } from './puppeteer-login-adapter';

const loginInfo = await loginWithPuppeteerInteractive({
  enabled: true,
  host: 'proxy.example.com',
  port: 1080,
  protocol: 'http',
});
```

#### `loginWithPuppeteerHeadless(username, password, proxy?)`

无头模式登录，后台运行。

```typescript
import { loginWithPuppeteerHeadless } from './puppeteer-login-adapter';

const loginInfo = await loginWithPuppeteerHeadless(
  'your-email@example.com',
  'your-password',
  proxyConfig
);
```

#### `checkPuppeteerAvailable()`

检查 Puppeteer 是否可用。

```typescript
import { checkPuppeteerAvailable } from './puppeteer-login-adapter';

const available = await checkPuppeteerAvailable();
console.log('Puppeteer available:', available);
```

### 扩展和定制

如果需要定制登录流程，可以修改 `src/puppeteer-login-adapter.ts`：

1. **修改浏览器选项**:
   ```typescript
   const launchOptions = {
     headless: false,
     args: [
       '--no-sandbox',
       '--disable-setuid-sandbox',
       // 添加自定义参数
     ],
   };
   ```

2. **修改超时时间**:
   ```typescript
   const code = await waitForAuthCode(page, 300000); // 5 分钟
   ```

3. **添加调试日志**:
   ```typescript
   console.log('[DEBUG]:', await page.content());
   ```

## 打包注意事项

### Electron 应用打包

Puppeteer 在 Electron 应用中需要特殊处理：

1. **在 `electron-builder.yml` 中配置**:
   ```yaml
   files:
     - "!node_modules/puppeteer/.local-chromium/**/*"
   
   asarUnpack:
     - "node_modules/puppeteer/**/*"
   ```

2. **或者使用 `puppeteer-core` + 系统 Chrome**:
   ```bash
   npm install puppeteer-core
   ```
   
   然后在代码中指定 Chrome 路径：
   ```typescript
   const browser = await puppeteer.launch({
     executablePath: '/path/to/chrome',
   });
   ```

### 减小应用体积

如果应用体积是问题，可以：

1. **使用 `puppeteer-core`**: 不包含 Chromium，使用系统 Chrome
2. **按需下载 Chromium**: 首次运行时下载
3. **共享 Chromium**: 多个应用共享同一个 Chromium

## 未来改进

- [ ] 支持更多登录方式（Twitter, Google, etc.）
- [ ] 优化 Chromium 下载和缓存
- [ ] 添加登录状态持久化
- [ ] 支持多账户管理
- [ ] 改进错误处理和重试逻辑

## 参考资料

- [Puppeteer 官方文档](https://pptr.dev/)
- [Pixiv OAuth 文档](https://github.com/upbit/pixivpy)
- [gppt (get-pixivpy-token)](https://github.com/eggplants/get-pixivpy-token)
- [PKCE 规范](https://tools.ietf.org/html/rfc7636)

## 贡献

欢迎贡献代码和反馈！如果你遇到问题或有改进建议：

1. 提交 Issue: https://github.com/your-repo/pixivflow/issues
2. 提交 Pull Request: https://github.com/your-repo/pixivflow/pulls

---

**最后更新**: 2025-11-09  
**版本**: 2.0.0

