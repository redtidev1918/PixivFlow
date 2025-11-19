# PixivFlow v2.0.39 更新日志

发布日期：2025-11-19

## 🎉 新功能

### 1. 增强的 Pixiv URL 解析能力
- ✅ 支持更多 URL 格式：
  - 标准格式：`https://www.pixiv.net/artworks/{id}`
  - 多语言路径：`https://www.pixiv.net/en/artworks/{id}`
  - 短格式：`https://www.pixiv.net/i/{id}`
  - 旧版格式：`https://www.pixiv.net/member_illust.php?illust_id={id}`
  - 用户作品：`https://www.pixiv.net/users/{userId}/artworks/{id}`
  - 用户小说：`https://www.pixiv.net/users/{userId}/novels/{id}`
  - 小说系列：`https://www.pixiv.net/novel/series/{id}`
  - 直接ID：`123456` (自动识别为插画)
- ✅ 支持无 `www` 前缀的URL
- ✅ 支持无 `https://` 前缀的URL（自动补全）
- ✅ 新增 25 个单元测试，确保解析准确性

### 2. 增强的登录状态保存机制
- ✅ **三重存储备份**：
  1. 数据库存储（主存储）
  2. 文件系统存储（统一存储）
  3. 配置文件存储（自动同步）
- ✅ **自动备份功能**：
  - 每次保存token时自动创建备份文件
  - 主token文件丢失时自动从备份恢复
  - 双重验证确保写入成功
- ✅ **智能恢复机制**：
  - Token文件损坏时自动尝试从备份恢复
  - 多层fallback确保token永不丢失
  - 详细的日志记录便于问题追踪

### 3. 友好的错误提示系统
- ✅ **智能错误识别**：
  - 自动识别token相关错误
  - 区分认证错误和配置错误
  - 提供针对性的解决方案
- ✅ **清晰的用户指导**：
  - 无token时不再直接报错
  - 提供明确的登录命令提示
  - 美化的错误消息格式
  - 隐藏技术性错误堆栈
- ✅ **多语言支持**：
  - 中英文错误提示
  - 统一的错误代码系统

## 🔧 改进优化

### URL解析器改进
- 改进了URL正则表达式匹配
- 优化了fallback机制
- 增强了错误处理

### Token管理改进
- 重构了token保存逻辑
- 添加了写入验证
- 改进了错误日志

### 错误处理改进
- 统一了错误消息格式
- 改进了ConfigError和AuthenticationError的处理
- 优化了用户体验

## 📝 文档更新
- ✅ 更新了 `download` 命令的帮助文档
- ✅ 添加了所有支持的URL格式示例
- ✅ 创建了URL解析器测试文档

## 🧪 测试
- ✅ 新增 25 个URL解析测试用例
- ✅ 覆盖所有支持的URL格式
- ✅ 测试边界情况和错误处理
- ✅ 所有测试通过 ✓

## 🐛 Bug修复
- 修复了转义字符导致的URL解析失败
- 修复了token保存时可能的竞态条件
- 改进了配置加载时的错误处理

## 📦 依赖更新
无依赖更新

## 🔄 向后兼容性
- ✅ 完全向后兼容
- ✅ 现有配置文件无需修改
- ✅ 现有token自动迁移到新存储系统

## 🎯 使用示例

### 新的URL格式支持
```bash
# 标准格式
pixivflow download --url "https://www.pixiv.net/artworks/123456"

# 多语言路径
pixivflow download --url "https://www.pixiv.net/en/artworks/123456"

# 短格式
pixivflow download --url "https://www.pixiv.net/i/123456"

# 旧版格式
pixivflow download --url "https://www.pixiv.net/member_illust.php?illust_id=123456"

# 用户作品
pixivflow download --url "https://www.pixiv.net/users/123456/artworks/789012"

# 小说
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=26480566"

# 小说系列
pixivflow download --url "https://www.pixiv.net/novel/series/13765174"

# 直接ID
pixivflow download --url "123456"
```

### 友好的错误提示
```bash
# 无token时的提示
$ pixivflow download

Configuration validation failed in /path/to/config.json:
  - pixiv.refreshToken: No valid refresh token found. Please login to authenticate.

💡 You need to login first. Run one of the following commands:
   • Interactive login:  pixivflow login
   • Headless login:     pixivflow login-headless

   These commands will automatically save your refresh token.
```

## 🙏 致谢
感谢所有用户的反馈和建议！

## 📊 统计信息
- 新增代码：~500 行
- 新增测试：25 个
- 修改文件：8 个
- 测试覆盖率：保持高覆盖

---

**完整更新内容请查看**: [GitHub Releases](https://github.com/zoidberg-xgd/PixivFlow/releases/tag/v2.0.39)
