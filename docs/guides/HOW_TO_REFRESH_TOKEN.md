# 如何刷新 Pixiv Token

本文档说明如何刷新 Pixiv 的 refresh token 和 access token。

## 方法一：使用命令行刷新（推荐）

### 1. 使用配置文件中的 refresh_token 刷新

如果你已经在配置文件中保存了 refresh_token，可以直接使用：

```bash
# 从配置文件读取 refresh_token 并刷新
pixivflow refresh $(node -e "console.log(require('./config/standalone.config.json').pixiv.refreshToken)")
```

或者更简单的方式，直接编辑配置文件获取 refresh_token，然后：

```bash
# 替换 YOUR_REFRESH_TOKEN 为实际的 token
pixivflow refresh YOUR_REFRESH_TOKEN
```

### 2. 指定配置文件路径

```bash
pixivflow refresh YOUR_REFRESH_TOKEN --config /path/to/your/config.json
```

### 3. JSON 格式输出

```bash
pixivflow refresh YOUR_REFRESH_TOKEN --json
```

## 方法二：自动刷新（无需手动操作）

项目中的 `PixivAuth` 类会在以下情况**自动刷新** access_token：

1. **访问 API 时自动检查**：如果 access_token 即将过期（提前 60 秒），会自动使用 refresh_token 刷新
2. **自动更新配置文件**：如果 API 返回了新的 refresh_token，会自动更新配置文件
3. **自动更新数据库**：新的 token 会保存到数据库中

**你不需要手动刷新 access_token**，系统会自动处理。

## 方法三：通过 Web UI 刷新

如果使用 Web UI：

1. 打开 Web UI
2. 访问认证页面
3. 点击"刷新 Token"按钮
4. 系统会自动使用配置文件中的 refresh_token 刷新

API 端点：`POST /api/auth/refresh`

## 方法四：使用 Python 脚本刷新

```python
import requests

url = "https://oauth.secure.pixiv.net/auth/token"
headers = {
    "User-Agent": "PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)",
    "Content-Type": "application/x-www-form-urlencoded"
}
data = {
    "client_id": "MOBrBDS8blbauoSck0ZfDbtuzpyT",
    "client_secret": "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj",
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "include_policy": "true"
}

response = requests.post(url, headers=headers, data=data)
if response.status_code == 200:
    tokens = response.json()
    print(f"新的 access_token: {tokens['access_token']}")
    print(f"新的 refresh_token: {tokens['refresh_token']}")
    # 更新配置文件
else:
    print(f"刷新失败: {response.status_code} {response.text}")
```

## 方法五：使用 cURL 刷新

```bash
curl -X POST https://oauth.secure.pixiv.net/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "User-Agent: PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)" \
  -d "client_id=MOBrBDS8blbauoSck0ZfDbtuzpyT" \
  -d "client_secret=lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=YOUR_REFRESH_TOKEN" \
  -d "include_policy=true"
```

## 刷新后的操作

### 1. 检查刷新结果

刷新成功后，命令会显示：

```
[+]: Token refreshed successfully!
[i]: New token: xxxxxxxxxxxxxxxxxxxx...
[+]: Refresh token updated in config: config/standalone.config.json
```

### 2. 验证新 token

```bash
# 测试下载，验证 token 是否有效
pixivflow download
```

### 3. 查看配置文件

刷新后，新的 refresh_token 会自动保存到配置文件中：

```json
{
  "pixiv": {
    "refreshToken": "新的 refresh_token"
  }
}
```

## 重要说明

### Refresh Token 的行为

1. **可能返回相同的 token**：Pixiv API 有时会返回相同的 refresh_token，这是正常的 OAuth2 行为
2. **可能返回不同的 token**：如果返回不同的 refresh_token，旧的会失效，必须使用新的
3. **自动处理**：项目代码会自动检测并处理这两种情况

### Access Token vs Refresh Token

- **Access Token**：用于访问 API，有效期约 1 小时，**自动刷新**，无需手动操作
- **Refresh Token**：用于获取新的 access_token，有效期很长（30+ 天），需要定期刷新

### 何时需要刷新 Refresh Token

- 如果 refresh_token 即将过期（虽然很少见）
- 如果收到 401 错误，说明 refresh_token 可能已失效
- 定期刷新以确保 token 始终有效（可选）

## 常见问题

### Q: 刷新后旧的 refresh_token 还能用吗？

A: 取决于 API 返回的结果：
- 如果返回**相同的** refresh_token，旧的仍然有效
- 如果返回**不同的** refresh_token，旧的会失效，必须使用新的

### Q: 需要多久刷新一次？

A: 
- **Access Token**：无需手动刷新，系统自动处理（约每小时）
- **Refresh Token**：理论上不需要频繁刷新，但建议：
  - 如果收到 401 错误，立即刷新
  - 可以每月刷新一次（可选）

### Q: 刷新失败怎么办？

A: 
1. 检查 refresh_token 是否正确
2. 检查网络连接
3. 如果 refresh_token 已失效，需要重新登录：
   ```bash
   pixivflow login
   ```

### Q: 如何查看当前的 refresh_token？

A: 
```bash
# 查看配置文件
cat config/standalone.config.json | grep refreshToken

# 或使用 jq（如果已安装）
cat config/standalone.config.json | jq .pixiv.refreshToken
```

## 完整示例

```bash
# 1. 查看当前的 refresh_token
cat config/standalone.config.json | grep refreshToken

# 2. 刷新 token（替换 YOUR_TOKEN 为实际的 token）
pixivflow refresh YOUR_TOKEN

# 3. 验证新 token
pixivflow download

# 4. 查看更新后的配置文件
cat config/standalone.config.json | grep refreshToken
```

## 相关文档

- [PIXIV_TOKEN_REFRESH.md](../api/PIXIV_TOKEN_REFRESH.md) - 详细的 API 文档
- [LOGIN_GUIDE.md](./LOGIN_GUIDE.md) - 登录指南
- [START_HERE.md](./START_HERE.md) - 新手入门指南

