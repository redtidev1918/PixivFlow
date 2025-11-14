# 配置文件说明

本目录包含 PixivFlow 的配置文件。所有示例配置文件已整理到 `examples/` 目录中。

## 📁 目录结构

```
config/
├── standalone.config.json          # 实际使用的配置文件（需要自行创建）
├── examples/                        # 示例配置文件目录
│   ├── standalone.config.example.json      # 完整配置示例
│   ├── standalone.config.simple.json       # 简化快速开始
│   ├── standalone.config.ranking.json      # 排行榜下载示例
│   ├── standalone.config.novel-chinese.json # 中文小说下载示例
│   ├── specific-download.example.json      # 特定下载任务示例
│   ├── yesterday-popular-novel.zh.json    # 昨日热门中文小说示例
│   ├── yesterday-ranking-illustration.json # 昨日日榜插画示例
│   ├── multi-tag-or-limit.zh.json          # 多标签并集示例
│   └── README.md                           # 示例文件详细说明
├── backups/                        # 备份文件目录（自动生成）
├── data/                          # 数据目录（自动生成）
│   └── metadata/                  # 元数据目录
└── README.md                      # 本文件
```

## 📁 示例配置文件列表

所有示例文件位于 `examples/` 目录中，详细说明请查看 [examples/README.md](examples/README.md)。

### 主要示例文件

1. **`standalone.config.example.json`** - 完整配置示例
   - 包含所有可用配置选项
   - 每个选项都有详细的中文注释说明
   - 适合学习和参考

2. **`standalone.config.simple.json`** - 简化快速开始 ⭐ 推荐新手
   - 配置简洁明了
   - 只包含最常用的选项
   - 适合新手快速上手

3. **`standalone.config.ranking.json`** - 排行榜下载示例
   - 包含各种排行榜模式的示例
   - 日榜、周榜、月榜配置示例

4. **`standalone.config.novel-chinese.json`** - 中文小说下载示例
   - 包含中文小说下载的各种配置示例
   - 语言过滤配置示例

5. **`specific-download.example.json`** - 特定下载任务示例
   - 包含10个实际使用场景的配置示例
   - 随机下载、质量过滤、时间范围等场景

### 快速使用示例

- **`yesterday-popular-novel.zh.json`** - 昨日热门中文小说
- **`yesterday-ranking-illustration.json`** - 昨日日榜插画
- **`multi-tag-or-limit.zh.json`** - 多标签并集 + 中文过滤

---

## 🚀 快速开始

### 第一次使用

1. **获取 refreshToken**
   ```bash
   # 如果已全局安装
   pixivflow login
   
   # 或从源码运行
   npm run login
   ```
   登录后会自动保存 refreshToken。

2. **选择配置文件**
   ```bash
   # 推荐新手使用简化配置
   cp config/examples/standalone.config.simple.json config/standalone.config.json
   ```

3. **修改配置**
   - 如果 refreshToken 没有自动填充，手动修改配置文件中的 `refreshToken`
   - 根据需要修改 `targets` 数组中的标签和数量

4. **开始下载**
   ```bash
   # 如果已全局安装
   pixivflow download
   
   # 或从源码运行
   npm run download
   ```

### 使用示例配置文件

你也可以直接使用示例配置文件，无需复制：

```bash
# 方式 1：使用命令行参数
pixivflow download --config "$(pwd)/config/examples/yesterday-popular-novel.zh.json"

# 方式 2：使用环境变量
export PIXIV_DOWNLOADER_CONFIG="$(pwd)/config/examples/yesterday-popular-novel.zh.json"
pixivflow download
```

---

## 📝 配置说明

### 必需配置项

- `pixiv.refreshToken` - Pixiv 刷新令牌（通过 `pixivflow login` 获取）

### 常用配置项

- `targets` - 下载目标数组（至少需要一个）
  - `type` - 类型：`illustration`（插画）或 `novel`（小说）
  - `tag` - 搜索标签
  - `limit` - 下载数量限制
  - `mode` - 下载模式：`search`（搜索）或 `ranking`（排行榜）

### 可选配置项

- `logLevel` - 日志级别：`debug` | `info` | `warn` | `error`
- `network.proxy` - 代理配置（如需使用代理）
- `storage.illustrationOrganization` - 插画目录组织方式
- `download.concurrency` - 并发下载数（建议 1-10）
- `scheduler` - 定时任务配置

---

## 💡 使用建议

1. **新手用户**：使用 `examples/standalone.config.simple.json`
2. **排行榜下载**：使用 `examples/standalone.config.ranking.json`
3. **中文小说下载**：使用 `examples/standalone.config.novel-chinese.json`
4. **特定场景**：参考 `examples/specific-download.example.json` 中的示例
5. **深入学习**：查看 `examples/standalone.config.example.json` 了解所有选项
6. **快速示例**：直接使用 `examples/` 目录中的快速示例文件

---

## ⚠️ 注意事项

1. **不要提交包含真实 refreshToken 的配置文件到 Git**
2. **所有示例文件中的 `YOUR_REFRESH_TOKEN` 都需要替换为实际值**
3. **配置文件使用 JSON 格式，注意语法正确性**
4. **修改配置后建议先测试少量下载，确认配置正确**
5. **备份文件会自动保存到 `backups/` 目录**

---

## 📚 更多信息

- 示例文件详细说明：查看 [examples/README.md](examples/README.md)
- 详细配置说明：查看 `docs/CONFIG.md`
- 项目文档：查看 `docs/` 目录
- 问题反馈：查看项目 Issues
