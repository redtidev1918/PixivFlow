# 登录指南

## 登录方式优先级

1. **pixiv-token-getter** (默认): Node.js 库，无需依赖。
2. **Puppeteer**: 自动回退方案。
3. **Python gppt**: 仅作最后的备选。

> 推荐使用 Node.js 方式，**无需安装 Python**。

## 快速登录

### 交互式 (CLI)

```bash
pixivflow login
```

按提示输入用户名和密码即可。Token 会自动保存到 `config/standalone.config.json`。

### 静默登录 (Headless)

适合 CI/CD 或无头环境：

```bash
pixivflow login-headless
```

## 常见问题

**Q: 登录失败 (认证错误)**
A: 检查账号密码。若开启了两步验证，暂不支持，请使用 cookie 方式（如支持）或暂时关闭 2FA。

**Q: Token 过期 (401 Unauthorized)**
A: 运行 `pixivflow login` 重新登录。`refresh_token` 会自动刷新，但若长期未使用可能失效。

**Q: 必须安装 Python 吗？**
A: 不需要。只有当 Node.js 登录方式全部失效时，才需要 Python + `gppt`。

## 安全须知

- `refresh_token` 等同于密码，**切勿泄露**。
- 配置文件 `config/standalone.config.json` 应加入 `.gitignore`。
- 如泄露，请立即在 Pixiv 修改密码。
