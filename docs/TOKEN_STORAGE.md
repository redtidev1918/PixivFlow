# Token 存储位置说明

## 概述

Pixiv 的认证 token（refreshToken）采用**统一存储为主，配置文件自动同步**的策略：

### 核心原则

1. **统一存储是主存储**：Token 主要存储在用户级别的统一位置（基于数据库路径）
2. **配置文件自动同步**：加载配置时，如果配置文件是占位符，自动从统一存储读取并同步到配置文件
3. **双向同步**：登录时同时更新配置文件和统一存储；配置文件有有效 token 时也会同步到统一存储

这种设计允许用户在切换配置文件时自动使用已登录的 token，无需重复登录。

## 1. 统一存储（主存储）

### 存储位置

Token 存储在用户级别的统一位置，基于数据库路径确定：
- 如果配置了 `storage.databasePath`，token 存储在数据库所在目录的 `.pixiv-refresh-token` 文件
- 如果没有配置数据库路径，存储在 `~/.pixiv-downloader/.pixiv-refresh-token`

### 工作原理

1. **登录时**：Token 同时保存到配置文件和统一存储（统一存储是主存储）
2. **加载配置时**：
   - 如果配置文件中的 token 是占位符（`YOUR_REFRESH_TOKEN`），自动从统一存储读取
   - 如果从统一存储读取到 token，**立即同步到配置文件**（确保配置文件始终有真实 token）
   - 如果配置文件中有有效 token，优先使用配置文件中的 token，并同步到统一存储
3. **验证时**：
   - 如果配置文件是占位符但统一存储有 token，验证通过（配置文件会自动同步）
   - 如果两者都没有 token，验证失败，需要登录

### 优势

- ✅ **跨配置文件共享**：登录一次，所有配置文件都可以使用
- ✅ **自动同步**：切换配置文件时自动从统一存储读取并同步到配置文件
- ✅ **配置文件始终有效**：加载后配置文件会自动更新为真实 token，验证不会失败
- ✅ **向后兼容**：如果配置文件已有有效 token，会同步到统一存储

## 2. 配置文件存储

### 配置文件路径

Token 存储在配置文件的 `pixiv.refreshToken` 字段中。配置文件路径的确定顺序：

1. **命令行参数**：如果通过参数指定了 `configPath`
2. **环境变量**：`PIXIV_DOWNLOADER_CONFIG` 环境变量
3. **默认路径**：`config/standalone.config.json`（相对于项目根目录）

### Electron 应用中的路径

在 Electron 应用中，配置文件位于：
```
{userData}/PixivFlow/config/standalone.config.json
```

其中 `{userData}` 是 Electron 的用户数据目录：
- **macOS**: `~/Library/Application Support/Electron/PixivFlow/`
- **Windows**: `%APPDATA%\Electron\PixivFlow\`
- **Linux**: `~/.config/Electron/PixivFlow/`

### 配置文件结构

```json
{
  "pixiv": {
    "clientId": "MOBrBDS8blbauoSck0ZfDbtuzpyT",
    "clientSecret": "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj",
    "deviceToken": "pixiv",
    "refreshToken": "YOUR_ACTUAL_REFRESH_TOKEN_HERE",  // ← Token 存储在这里
    "userAgent": "PixivAndroidApp/5.0.234 (Android 11; Pixel 6)"
  },
  ...
}
```

### Token 更新机制

当系统刷新 access token 时，如果 Pixiv 返回了新的 refresh token，系统会**同时更新配置文件和统一存储**，确保 token 始终是最新的。

相关代码位置：
- `src/utils/login-helper.ts` - `updateConfigWithToken()` 函数
- `src/pixiv/AuthClient.ts` - 自动更新逻辑（第 94-120 行）
- `src/utils/token-manager.ts` - 统一存储管理

## 2. 辅助存储：数据库缓存

### 数据库路径

数据库路径由配置文件中的 `storage.databasePath` 指定，默认值：
- 命令行模式：`./data/pixiv-downloader.db`
- Electron 应用：`{userData}/PixivFlow/data/pixiv-downloader.db`

### 数据库中的 Token 存储

数据库中的 `tokens` 表用于缓存：
- **Access Token**：临时的访问令牌（会过期，通常 1 小时）
- **Refresh Token**：刷新令牌的缓存副本

**注意**：数据库中的 token 只是缓存，**配置文件才是唯一真实来源**。

### 数据库表结构

```sql
CREATE TABLE tokens (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON 格式的 AccessTokenStore
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

存储的键名：
- `pixiv_access_token`：Access token 缓存
- `pixiv_refresh_token`：Refresh token 缓存（可选）

## 3. Token 生命周期

### 登录流程

1. 用户通过 WebUI 或命令行登录
2. 获取到 `refreshToken` 和 `accessToken`
3. **同时保存到两个位置**：
   - 配置文件：`config.pixiv.refreshToken = refreshToken`
   - 统一存储：保存到 `.pixiv-refresh-token` 文件
4. 同时缓存到数据库（可选）

### 配置加载流程

1. 读取配置文件
2. 检查配置文件中的 token：
   - 如果有效，使用配置文件中的 token，并同步到统一存储
   - 如果是占位符或缺失，从统一存储读取
3. 如果从统一存储读取到 token，自动更新配置文件

### 刷新流程

1. 使用当前有效的 `refreshToken` 刷新 access token
2. 如果 Pixiv 返回新的 `refreshToken`，**同时更新配置文件和统一存储**
3. 更新数据库缓存

### 登出流程

1. 调用 `/api/auth/logout` API
2. 将配置文件中的 `refreshToken` 设置为 `"YOUR_REFRESH_TOKEN"`（占位符）
3. 清除统一存储中的 token
4. 清除数据库中的 token 缓存

## 4. 如何查看 Token

### 查看配置文件中的 Token

```bash
# 直接查看配置文件
cat config/standalone.config.json | grep refreshToken

# 使用 jq 工具（如果已安装）
cat config/standalone.config.json | jq .pixiv.refreshToken
```

### 查看统一存储中的 Token

```bash
# 如果数据库路径是 ./data/pixiv-downloader.db
cat data/.pixiv-refresh-token

# 如果数据库路径是绝对路径，查看数据库所在目录
cat $(dirname /path/to/database.db)/.pixiv-refresh-token

# 默认位置（如果没有配置数据库路径）
cat ~/.pixiv-downloader/.pixiv-refresh-token
```

### 查看数据库中的 Token

```bash
# 使用 sqlite3 命令行工具
sqlite3 data/pixiv-downloader.db "SELECT key, value FROM tokens;"
```

## 5. 常见问题

### Q: Token 存在哪里？

**A**: 主要存储在配置文件中（`config/standalone.config.json` 的 `pixiv.refreshToken` 字段），数据库只是缓存。

### Q: 为什么配置文件中的 Token 是 `"YOUR_REFRESH_TOKEN"`？

**A**: 这表示还没有登录，或者已经登出。需要重新登录来设置真实的 token。

### Q: 如何手动设置 Token？

**A**: 直接编辑配置文件，将 `refreshToken` 字段设置为你的实际 token 值。

### Q: Token 会自动更新吗？

**A**: 是的，当系统刷新 access token 时，如果 Pixiv 返回了新的 refresh token，系统会同时更新配置文件和统一存储。

### Q: 切换配置文件后需要重新登录吗？

**A**: 不需要！新的统一存储机制会自动从统一存储读取 token。只要你在任何一个配置文件中登录过，其他配置文件都会自动使用这个 token。

### Q: 统一存储的 token 在哪里？

**A**: 统一存储的 token 文件位置基于数据库路径：
- 如果数据库路径是 `./data/pixiv-downloader.db`，token 文件在 `./data/.pixiv-refresh-token`
- 如果数据库路径是绝对路径，token 文件在数据库所在目录的 `.pixiv-refresh-token`
- 如果没有配置数据库路径，默认在 `~/.pixiv-downloader/.pixiv-refresh-token`

### Q: 配置文件路径在哪里？

**A**: 
- 命令行模式：项目根目录下的 `config/standalone.config.json`
- Electron 应用：`{userData}/PixivFlow/config/standalone.config.json`
- 可通过环境变量 `PIXIV_DOWNLOADER_CONFIG` 自定义

## 6. 相关代码文件

- `src/config.ts` - 配置文件加载和路径解析，自动从统一存储补充 token
- `src/utils/token-manager.ts` - **统一存储管理**（新增）
- `src/utils/login-helper.ts` - Token 更新和清除函数，同时更新配置文件和统一存储
- `src/pixiv/AuthClient.ts` - Token 刷新和自动更新逻辑
- `src/webui/routes/auth.ts` - WebUI 认证 API
- `src/storage/Database.ts` - 数据库 Token 缓存

