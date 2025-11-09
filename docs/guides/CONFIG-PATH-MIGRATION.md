# 配置路径迁移指南

## 概述

PixivFlow 支持自动检测和修复配置文件中的路径问题，使项目可以在不同环境之间轻松迁移。

## 功能特性

### 1. 自动路径修复

项目在加载配置时会自动检测并修复以下问题：

- **绝对路径转相对路径**：如果配置中的绝对路径位于项目根目录内，会自动转换为相对路径
- **路径不存在修复**：如果配置的路径不存在，会尝试使用默认路径
- **自动保存修复**：修复后的配置会自动保存回配置文件

### 2. 手动路径迁移

使用 `migrate-config` 命令可以手动迁移配置路径：

```bash
# 预览将要进行的更改（不实际修改文件）
npm run start migrate-config --dry-run

# 或者指定配置文件
npm run start migrate-config --config config/standalone.config.json --dry-run

# 执行迁移
npm run start migrate-config

# 使用 JSON 输出格式
npm run start migrate-config --json
```

## 使用场景

### 场景 1：项目迁移到新环境

当你将项目从一个目录迁移到另一个目录时：

1. **自动修复**：项目启动时会自动检测并修复路径
2. **手动迁移**：也可以手动运行迁移命令

```bash
# 在新环境中运行
npm run start migrate-config
```

### 场景 2：配置文件包含绝对路径

如果你的配置文件中包含绝对路径（如 `/Users/username/project/data/db.db`）：

1. **自动转换**：项目会自动将其转换为相对路径（如 `./data/db.db`）
2. **保持可移植性**：转换后的配置文件可以在任何环境中使用

### 场景 3：路径不存在

如果配置的路径在新环境中不存在：

1. **自动修复**：系统会尝试使用默认路径
2. **日志记录**：所有修复操作都会记录在日志中

## 配置路径说明

### 支持的路径字段

以下配置字段支持自动迁移：

- `storage.databasePath` - 数据库文件路径
- `storage.downloadDirectory` - 下载根目录
- `storage.illustrationDirectory` - 插画保存目录
- `storage.novelDirectory` - 小说保存目录

### 路径解析规则

1. **相对路径**：相对于项目根目录解析
2. **绝对路径**：
   - 如果在项目根目录内，自动转换为相对路径
   - 如果在项目根目录外，保持绝对路径（但会记录警告）

### 默认路径

如果配置的路径不存在，系统会尝试以下默认路径：

- `databasePath`: `./data/pixiv-downloader.db`
- `downloadDirectory`: `./downloads`
- `illustrationDirectory`: `./downloads/illustrations`（相对于 downloadDirectory）
- `novelDirectory`: `./downloads/novels`（相对于 downloadDirectory）

## 示例

### 示例 1：自动修复

**原始配置**（包含绝对路径）：
```json
{
  "storage": {
    "databasePath": "/Users/username/project/data/pixiv-downloader.db",
    "downloadDirectory": "/Users/username/project/downloads"
  }
}
```

**修复后**（自动转换为相对路径）：
```json
{
  "storage": {
    "databasePath": "./data/pixiv-downloader.db",
    "downloadDirectory": "./downloads"
  }
}
```

### 示例 2：手动迁移

```bash
$ npm run start migrate-config --dry-run

[i]: Migrating configuration paths in: config/standalone.config.json
[i]: Dry run mode - no changes will be made

[+]: Found 2 path(s) to migrate:
  - databasePath:
    Old: /Users/username/project/data/pixiv-downloader.db
    New: ./data/pixiv-downloader.db
    Reason: Converted absolute path to relative path (within project root)
  - downloadDirectory:
    Old: /Users/username/project/downloads
    New: ./downloads
    Reason: Converted absolute path to relative path (within project root)

[i]: This was a dry run. Use without --dry-run to apply changes.
```

## 最佳实践

1. **使用相对路径**：在配置文件中尽量使用相对路径，提高可移植性
2. **定期检查**：在项目迁移后，运行 `migrate-config` 命令检查路径配置
3. **备份配置**：在执行迁移前，建议备份配置文件
4. **查看日志**：所有自动修复操作都会记录在日志中，可以查看 `data/pixiv-downloader.log`

## 故障排除

### 问题 1：迁移后路径仍然不正确

**解决方案**：
1. 检查项目根目录是否正确
2. 确认路径是否在项目根目录内
3. 手动编辑配置文件

### 问题 2：自动修复没有生效

**解决方案**：
1. 检查日志文件 `data/pixiv-downloader.log`
2. 手动运行 `migrate-config` 命令
3. 确认配置文件格式正确

### 问题 3：路径在项目根目录外

如果路径在项目根目录外（如 `/var/data/pixiv.db`），系统会：
- 保持绝对路径不变
- 记录警告日志
- 如果路径不存在，尝试使用默认路径

## 技术细节

### 自动修复时机

自动修复在以下时机触发：
1. 加载配置文件时（`loadConfig` 函数）
2. 在应用环境变量覆盖之后
3. 在验证配置之前

### 修复逻辑

1. 检查路径是否为绝对路径
2. 如果是绝对路径且在项目根目录内，转换为相对路径
3. 如果路径不存在，尝试使用默认路径
4. 保存修复后的配置到文件

### 日志记录

所有修复操作都会记录：
- 修复的字段
- 旧路径和新路径
- 修复原因

查看日志：
```bash
tail -f data/pixiv-downloader.log | grep "Auto-fixed"
```

## 相关命令

- `npm run start migrate-config` - 手动迁移配置路径
- `npm run start migrate-config --dry-run` - 预览迁移更改
- `npm run start migrate-config --json` - JSON 格式输出

