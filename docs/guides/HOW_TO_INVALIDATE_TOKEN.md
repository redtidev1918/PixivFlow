# 如何使 Pixiv Token 失效

本文档说明如何使 Pixiv 的 access token 和 refresh token 失效。

## 方法一：在 Pixiv 网站上更改密码（推荐，唯一可靠方法）

**⚠️ 这是唯一能彻底使 token 在服务器端失效的方法！**

### 为什么必须更改密码？

Pixiv API **不提供标准的 token revocation（撤销）端点**。这意味着：
- ❌ 无法通过 API 调用使 token 在服务器端失效
- ❌ 清除本地 token 只是删除了本地存储，服务器端的 token 仍然有效
- ✅ **只有更改密码才能彻底使所有 token 在服务器端失效**

### 步骤：

1. 访问 [Pixiv 设置页面](https://www.pixiv.net/setting_user.php)
2. 登录你的 Pixiv 账户
3. 找到"密码"或"パスワード"（Password）选项
4. 输入当前密码和新密码
5. 保存更改
6. **更改密码后，所有现有的 access token 和 refresh token 都会立即失效**

### 优点：
- ✅ **彻底使所有 token 在服务器端失效**
- ✅ 即使 token 已泄露，也无法再使用
- ✅ 提高账户安全性
- ✅ 无需技术操作

### 缺点：
- ⚠️ 需要重新登录所有使用该账户的应用和设备
- ⚠️ 需要记住新密码

## 方法二：清除本地存储的 Token（⚠️ 不能使服务器端 token 失效）

**⚠️ 警告：这只会清除本地存储的 token，不会使服务器端的 token 失效！**

如果 token 已经泄露，**必须使用方法一（更改密码）**才能真正使 token 失效。

### 2.1 通过 Web UI 清除

1. 打开 Web UI
2. 访问认证页面
3. 点击"登出"或"Logout"按钮
4. 系统会自动：
   - 尝试调用服务器端撤销端点（Pixiv 可能不支持）
   - 清除配置文件中的 refresh token
   - 清除数据库中的 access token 和 refresh token
   - 显示警告和更改密码的说明

API 端点：`POST /api/auth/logout`

响应示例：
```json
{
  "success": true,
  "localCleared": true,
  "serverRevocation": {
    "attempted": true,
    "success": false
  },
  "message": "Tokens cleared from local storage. Server-side revocation not available.",
  "warning": "Local token clearing does not invalidate tokens on Pixiv server. To truly invalidate tokens, change your password immediately.",
  "instructions": {
    "method": "Change Pixiv Password",
    "description": "Changing your Pixiv password is the most reliable way to invalidate all existing tokens on the server side.",
    "url": "https://www.pixiv.net/setting_user.php",
    "steps": [...]
  }
}
```

### 2.2 获取使 token 失效的说明

API 端点：`GET /api/auth/invalidate-instructions`

返回如何更改密码使 token 失效的详细说明。

### 2.3 手动编辑配置文件

直接编辑配置文件 `config/standalone.config.json`，将 `refreshToken` 字段设置为空字符串：

```json
{
  "pixiv": {
    "refreshToken": ""
  }
}
```

**注意**：这只是清除本地存储，服务器端的 token 仍然有效！

## 方法三：刷新 Token 使其失效

**注意：这个方法不一定有效，取决于 Pixiv API 的行为。**

当你刷新 token 时，如果 Pixiv API 返回了**新的 refresh_token**，那么**旧的 refresh_token 会失效**。但有时 API 会返回相同的 refresh_token，此时旧的仍然有效。

### 步骤：

1. 使用旧的 refresh_token 刷新：
   ```bash
   pixivflow refresh OLD_REFRESH_TOKEN
   ```

2. 如果返回了新的 refresh_token，旧的就会失效
3. 如果返回了相同的 refresh_token，旧的仍然有效

## 方法四：注销 Pixiv 账户（不推荐）

**⚠️ 警告：这是不可逆的操作！**

注销账户会：
- 删除所有账户数据
- 使所有 token 失效
- **永久删除账户，无法恢复**

### 步骤：

1. 访问 [Pixiv 账户设置页面](https://www.pixiv.net/setting_user.php)
2. 找到"账户注销"或"Account Deletion"选项
3. 按照提示完成注销流程

**强烈不推荐此方法，除非你真的想永久删除账户。**

## 重要说明

### 1. Token 失效的区别（⚠️ 关键理解）

- **服务器端失效**：在 Pixiv 服务器上使 token 失效（**只有更改密码才能实现**）
  - ✅ 彻底使 token 无法使用
  - ✅ 即使有人获得了你的 token，也无法使用
  - ✅ **这是唯一能真正使 token 失效的方法**

- **本地清除**：只清除本地存储的 token
  - ⚠️ **如果 token 已泄露，仍然可能被他人使用**
  - ⚠️ **必须配合更改密码才能真正使 token 失效**
  - ⚠️ Pixiv API 不提供 token revocation 端点，无法通过 API 撤销 token

### 2. 如果 Token 已泄露

如果你的 refresh_token 已经泄露（例如提交到了 Git 仓库），**必须立即执行以下操作**：

1. **立即更改 Pixiv 密码**（方法一）
   - 这会使所有现有的 token 失效
   - 包括泄露的 token

2. **清除本地存储的 token**（方法二）
   - 清除配置文件中的 token
   - 清除数据库中的 token

3. **重新登录获取新 token**
   - 使用新密码重新登录
   - 获取新的 refresh_token
   - 更新配置文件

### 3. 预防措施

1. **永远不要提交包含真实 Token 的配置文件到 Git**
2. **使用 .gitignore 排除配置文件**
3. **定期更改密码**（建议每 3-6 个月）
4. **使用环境变量存储敏感信息**（如果可能）

## 项目中的实现

### 清除 Token 的代码位置

- **Database.deleteToken()**: `src/storage/Database.ts`
  - 从数据库中删除 token

- **clearConfigToken()**: `src/utils/login-helper.ts`
  - 清除配置文件中的 refresh token

- **POST /api/auth/logout**: `src/webui/routes/auth.ts`
  - Web UI 的登出端点，会清除配置文件和数据库中的 token

## 常见问题

### Q: 清除本地 token 后，服务器端的 token 还能用吗？

A: **是的！** 清除本地 token 只是删除了本地存储，服务器端的 token 仍然有效。如果有人获得了你的 refresh_token，仍然可以使用它。**要真正使 token 失效，必须更改密码。**

### Q: 为什么不能通过 API 撤销 token？

A: Pixiv API 不提供标准的 token revocation（撤销）端点。虽然项目会尝试调用可能的撤销端点，但这些端点通常不存在或不可用。**更改密码是唯一可靠的方法。**

### Q: 更改密码后，需要重新登录吗？

A: 是的。更改密码后，所有现有的 token 都会失效，需要重新登录获取新的 token。

### Q: 如何检查 token 是否已失效？

A: 尝试使用 token 刷新 access_token，如果返回 401 错误，说明 token 已失效。

```bash
# 使用项目中的验证功能
pixivflow refresh YOUR_REFRESH_TOKEN
```

### Q: Token 失效后，下载任务会怎样？

A: 如果 token 失效，下载任务会失败并返回 401 错误。需要重新登录获取新 token 后，才能继续下载。

## 参考资源

- [Pixiv 账户设置](https://www.pixiv.net/setting_user.php)
- [OAuth2 Token Revocation (RFC 7009)](https://tools.ietf.org/html/rfc7009)
- [项目中的 Token 刷新文档](./HOW_TO_REFRESH_TOKEN.md)

