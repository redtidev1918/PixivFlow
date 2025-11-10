# Pixiv API Token 刷新文档

本文档详细说明如何正确刷新 Pixiv OAuth2 访问令牌（access token）和刷新令牌（refresh token）。

## API 端点

**URL**: `https://oauth.secure.pixiv.net/auth/token`

**方法**: `POST`

## 请求参数

### 必需参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `client_id` | string | Pixiv 客户端 ID |
| `client_secret` | string | Pixiv 客户端密钥 |
| `grant_type` | string | 必须为 `refresh_token` |
| `refresh_token` | string | 旧的刷新令牌（用于获取新的令牌） |
| `include_policy` | string | 必须为 `true` |

### 客户端凭证

项目中使用的是 Pixiv 官方移动应用的客户端凭证：

- **client_id**: `MOBrBDS8blbauoSck0ZfDbtuzpyT`
- **client_secret**: `lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj`

> **注意**: 这些是 Pixiv 官方移动应用的公开凭证，用于模拟官方客户端行为。

## 请求头

### 基本请求头

```
Content-Type: application/x-www-form-urlencoded
User-Agent: PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)
```

或者使用 Android 用户代理：

```
User-Agent: PixivAndroidApp/5.0.234 (Android 11; Pixel 6)
```

### 高级请求头（可选）

`AuthClient` 类中使用了额外的安全头：

```
X-Client-Time: <ISO 8601 格式的时间戳>
X-Client-Hash: <MD5 哈希值>
```

哈希值计算方式：
```typescript
const salt = '28c1fdd170a5204386cb1313c7077b32';
const hash = MD5(time + salt);
```

## 请求示例

### cURL 示例

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

### TypeScript/JavaScript 示例

```typescript
import axios from 'axios';

const response = await axios.post(
  'https://oauth.secure.pixiv.net/auth/token',
  new URLSearchParams({
    client_id: 'MOBrBDS8blbauoSck0ZfDbtuzpyT',
    client_secret: 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj',
    grant_type: 'refresh_token',
    refresh_token: 'YOUR_REFRESH_TOKEN',
    include_policy: 'true',
  }).toString(),
  {
    headers: {
      'user-agent': 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)',
      'app-os-version': '14.6',
      'app-os': 'ios',
      'content-type': 'application/x-www-form-urlencoded',
    },
    timeout: 10000,
  }
);
```

### Python 示例

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
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    expires_in = tokens["expires_in"]
    # 保存新的令牌
else:
    print(f"刷新失败: {response.status_code} {response.text}")
```

## 响应格式

### 成功响应 (200 OK)

```json
{
  "access_token": "新的访问令牌",
  "expires_in": 3600,
  "token_type": "bearer",
  "scope": "权限范围",
  "refresh_token": "新的刷新令牌（可能和旧的一样）",
  "user": {
    "id": "用户ID",
    "name": "用户名",
    "account": "账号",
    "mail_address": "邮箱",
    "is_premium": false,
    "x_restrict": 0,
    "is_mail_authorized": true,
    "profile_image_urls": {
      "px_16x16": "头像URL",
      "px_50x50": "头像URL",
      "px_170x170": "头像URL"
    }
  }
}
```

### 错误响应

#### 400 Bad Request
```json
{
  "has_error": true,
  "errors": {
    "system": {
      "message": "错误消息"
    }
  }
}
```

#### 401 Unauthorized
刷新令牌无效或已过期。

## 重要说明

### 1. Refresh Token 的行为

**重要**: Pixiv API 在刷新 token 时可能会返回**相同的 refresh_token**。这是某些 OAuth2 实现的正常行为：

- 如果返回相同的 refresh_token，旧的 refresh_token **仍然有效**，可以继续使用
- 如果返回不同的 refresh_token，旧的 refresh_token **会失效**，必须使用新的

因此，代码中需要：
1. 检查返回的 refresh_token 是否与旧的不同
2. 如果不同，更新配置文件中的 refresh_token
3. 如果相同，说明这是正常的 OAuth 行为，token 仍然有效

### 2. Access Token 过期时间

- `expires_in`: 通常为 3600 秒（1小时）
- 访问令牌过期后，需要使用 refresh_token 重新获取

### 3. 自动刷新机制

项目中的 `PixivAuth` 类实现了自动刷新机制：

1. 检查缓存的 access_token 是否即将过期（提前 60 秒刷新）
2. 如果过期或即将过期，自动使用 refresh_token 刷新
3. 如果返回新的 refresh_token，自动更新配置文件和数据库

### 4. 错误处理

- 网络错误：自动重试（默认 3 次）
- 401 错误：刷新令牌无效，需要重新登录
- 超时：默认 30 秒超时

## 项目中的实现

### TerminalLogin.refresh()

位置: `src/terminal-login.ts`

```typescript
static async refresh(refreshToken: string): Promise<LoginInfo> {
  const response = await axios.post<OAuthResponse>(
    'https://oauth.secure.pixiv.net/auth/token',
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      include_policy: 'true',
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        'user-agent': USER_AGENT,
        'app-os-version': '14.6',
        'app-os': 'ios',
        'content-type': 'application/x-www-form-urlencoded',
      },
      timeout: TIMEOUT,
    }
  );
  return response.data;
}
```

### PixivAuth.refreshAccessToken()

位置: `src/pixiv/AuthClient.ts`

实现了更完整的刷新逻辑，包括：
- 重试机制
- 自动更新配置文件
- 客户端哈希验证（可选）

## 使用命令行刷新

```bash
# 使用旧的 refresh_token 刷新
pixivflow refresh <old_refresh_token>

# 指定配置文件路径
pixivflow refresh <old_refresh_token> --config <config_path>
```

## 参考资源

- [get-pixivpy-token (gppt)](https://github.com/eggplants/get-pixivpy-token) - 参考实现
- OAuth2 RFC 6749 - 标准规范
- Pixiv 官方移动应用 - 客户端凭证来源

## 常见问题

### Q: 为什么刷新后 refresh_token 没有变化？

A: 这是正常的 OAuth2 行为。某些实现会返回相同的 refresh_token，旧的仍然有效。

### Q: 刷新 token 后旧的 refresh_token 还能用吗？

A: 取决于 API 返回的结果：
- 如果返回相同的 refresh_token，旧的仍然有效
- 如果返回不同的 refresh_token，旧的会失效

### Q: access_token 多久过期？

A: 通常为 3600 秒（1小时），具体以 API 返回的 `expires_in` 为准。

### Q: refresh_token 会过期吗？

A: 理论上不会，但 Pixiv 可能会在某些情况下使 refresh_token 失效（如安全原因、长期未使用等）。

