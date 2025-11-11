# 登录指南

PixivFlow 支持多种登录方式，本文档详细说明登录流程和常见问题。

---

## 🔐 登录方式

PixivFlow 会自动选择最佳登录方式，优先级如下：

1. **pixiv-token-getter**（推荐 ⭐）
   - Node.js 库，无需额外依赖
   - 支持交互式和静默登录
   - 默认首选方式

2. **Puppeteer**（Node.js 原生）
   - 如果 pixiv-token-getter 不可用，自动回退
   - 无需 Python，纯 Node.js 实现

3. **Python gppt**（后备方案）
   - 仅在 pixiv-token-getter 和 Puppeteer 都不可用时使用
   - 需要安装 Python 3.9+ 和 `gppt` 包

> 💡 **重要提示**：项目**默认使用 `pixiv-token-getter`**，**不需要 Python**。只有在 pixiv-token-getter 和 Puppeteer 都不可用时，才会使用 Python gppt。

---

## 🚀 快速登录

> 💡 **提示**：如果通过 `npm install -g pixivflow` 全局安装，可以直接使用 `pixivflow login` 命令。

### 方式 1：全局安装方式（npm 安装）

```bash
pixivflow login
```

### 方式 2：源码安装方式

```bash
npm run login
```

程序会自动：
1. 优先使用 pixiv-token-getter 进行登录
2. 如果不可用，自动回退到 Puppeteer
3. 最后才使用 Python gppt（后备方案）
4. 获取 refresh token 并保存到配置文件

**登录流程**：
1. 在终端输入 Pixiv 用户名
2. 输入密码（输入时不会显示）
3. 程序自动完成登录并保存 token

### 方式 3：使用脚本

```bash
./scripts/pixiv.sh login
```

### 方式 4：使用 CLI 命令（源码安装）

```bash
npm run build
node dist/index.js login
```

---

## 📝 登录流程说明

### 交互式登录（默认）

**全局安装方式**：
```bash
pixivflow login
```

**源码安装方式**：
```bash
npm run login
```

**步骤**：
1. 程序提示输入用户名
2. 输入用户名后按回车
3. 程序提示输入密码
4. 输入密码后按回车（输入时不会显示）
5. 程序自动完成登录并保存 token

### 静默登录（headless 模式）

**全局安装方式**：
```bash
pixivflow login-headless
```

**源码安装方式**：
```bash
npm run login:headless
```

**说明**：
- 需要提供用户名和密码
- 适合自动化脚本使用
- 浏览器在后台运行，不显示窗口

---

## 🔄 Token 刷新

refresh token 会自动刷新，无需手动操作。如果遇到认证失败，可以重新登录：

```bash
npm run login
```

---

## ❓ 常见问题

### 问题 1：登录失败

**症状**：提示登录失败或认证错误

**解决方法**：
1. 确认用户名和密码正确
2. 检查网络连接
3. 如果使用代理，检查代理配置
4. 重新运行登录命令

### 问题 2：Token 过期

**症状**：下载时提示 "认证失败" 或 "401 Unauthorized"

**解决方法**：

**全局安装方式**：
```bash
# 重新登录
pixivflow login
```

**源码安装方式**：
```bash
# 重新登录
npm run login
```

### 问题 3：登录方式都不可用

**症状**：pixiv-token-getter 和 Puppeteer 都不可用，需要 Python gppt

**解决方法**：

> 💡 **注意**：这种情况很少见。通常 pixiv-token-getter 或 Puppeteer 应该可用。

如果确实需要 Python gppt（后备方案）：

```bash
# 安装 Python（如果未安装）
# macOS
brew install python3

# 安装 gppt
pip3 install gppt
```

**或者**：检查为什么 pixiv-token-getter 不可用，通常重新安装依赖即可：

```bash
npm install
```

### 问题 4：代理配置

如果需要通过代理登录，可以在配置文件中设置：

```json
{
  "network": {
    "proxy": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 7890,
      "protocol": "http"
    }
  }
}
```

或者使用环境变量：

```bash
export all_proxy=socks5://127.0.0.1:6153
npm run login
```

---

## 🔒 安全提示

- ⚠️ **不要分享配置文件**：`config/standalone.config.json` 包含敏感认证信息
- ⚠️ **不要提交到 Git**：确保配置文件在 `.gitignore` 中
- ⚠️ **定期更新 Token**：定期重新运行登录命令更新认证信息

`refresh_token` 等同于你的账号密码，拥有它即可访问你的 Pixiv 账户。

**如果 refresh_token 泄露**：
1. 立即在 Pixiv 账户设置中撤销授权
2. 修改 Pixiv 账户密码
3. 重新运行登录命令获取新的 token

---

## 📚 相关文档

- [快速开始指南](./QUICKSTART.md)
- [配置指南](./CONFIG.md)
- [使用指南](./USAGE.md)

