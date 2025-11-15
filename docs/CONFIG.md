# 配置指南

PixivFlow 的配置文件位于 `config/standalone.config.json`。本文档详细说明所有配置选项。

---

## 📋 配置文件位置

- **默认路径**：`config/standalone.config.json`
- **示例文件**：`config/standalone.config.example.json`

首次使用可以复制示例文件：

```bash
cp config/standalone.config.example.json config/standalone.config.json
```

### 使用命令行管理配置

除了手动编辑配置文件，还可以使用命令行工具快速管理配置：

```bash
# 查看配置
pixivflow config show

# 设置配置项（会自动备份原配置）
pixivflow config set storage.downloadDirectory ./my-downloads
pixivflow config set storage.illustrationDirectory ./my-illustrations

# 验证配置
pixivflow config validate

# 备份配置
pixivflow config backup

# 恢复配置
pixivflow config restore
```

**查看目录信息**：

```bash
# 查看所有目录路径
pixivflow dirs

# 查看详细目录信息
pixivflow dirs --verbose
```

---

## 🔐 认证配置

```json
{
  "pixiv": {
    "refreshToken": "YOUR_REFRESH_TOKEN",
    "clientId": "MOBrBDS8blbauoSck0ZfDbtuzpyT",
    "clientSecret": "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj",
    "deviceToken": "pixiv",
    "userAgent": "PixivAndroidApp/5.0.234 (Android 11; Pixel 6)"
  }
}
```

#### 示例 1b：多标签 OR 搜索（逐个标签检索并合并）

```json
{
  "targets": [
    {
      "type": "novel",
      "tag": "風景 イラスト オリジナル",  
      "tagRelation": "or",
      "limit": 10,
      "mode": "search",
      "searchTarget": "partial_match_for_tags",
      "sort": "popular_desc"
    }
  ]
}
```

**说明**：
- `refreshToken`：通过 `npm run login` 自动获取，无需手动填写
- `clientId` 和 `clientSecret`：Pixiv API 凭证，通常不需要修改
- `deviceToken`：设备令牌，默认值为 `"pixiv"`，通常不需要修改
- `userAgent`：用户代理字符串，通常不需要修改

---

## 📥 下载目标配置

`targets` 数组定义了要下载的内容。每个目标是一个对象：

### 基础配置

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    }
  ]
}
```

### 配置选项

| 选项 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `type` | string | 内容类型 | `"illustration"`（插画）或 `"novel"`（小说） |
| `tag` | string | 搜索标签 | `"風景"` 或 `"明日方舟 アークナイツ"`（多标签用空格分隔） |
| `tagRelation` | string | 标签关系 | `"and"`（必须同时包含，默认）或 `"or"`（包含任意一个） |
| `limit` | number | 下载数量限制 | `20`（建议范围 1-1000） |
| `mode` | string | 下载模式 | `"search"`（搜索）或 `"ranking"`（排行榜） |
| `searchTarget` | string | 搜索范围 | `"partial_match_for_tags"`（部分匹配）<br>`"exact_match_for_tags"`（精确匹配）<br>`"title_and_caption"`（标题和说明） |
| `sort` | string | 排序方式 | `"date_desc"`（最新）<br>`"popular_desc"`（最受欢迎）<br>`"date_asc"`（最旧） |
| `minBookmarks` | number | 最低收藏数 | `500` |
| `startDate` / `endDate` | string | 日期范围 | `"2024-01-01"`（YYYY-MM-DD 格式） |
| `random` | boolean | 随机选择 | `true` 表示从搜索结果中随机选择 |
| `restrict` | string | 限制类型 | `"public"`（公开）或 `"private"`（私有） |

> 关于 `tagRelation`：
> - `and`（默认）：把整串 `tag` 作为同时匹配的多个标签（空格分隔），要求作品同时包含所有标签。
> - `or`：会把 `tag` 按空格拆分为多个标签，按标签逐个串行检索；各标签结果会被合并并按作品 `id` 去重，然后再按 `sort` 排序并按 `limit` 截断。
> - 为降低速率限制风险，`or` 模式会在相邻标签检索之间加入延迟（使用 `download.requestDelay`）。建议把该值设置为 1500~3000ms。

### 排行榜配置（仅当 `mode="ranking"` 时）

| 选项 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `rankingMode` | string | 排行榜模式 | `"day"`（日榜）<br>`"week"`（周榜）<br>`"month"`（月榜）<br>`"day_male"`（男性向日榜）<br>`"day_female"`（女性向日榜）<br>`"day_ai"`（AI 日榜）<br>`"week_original"`（原创周榜）<br>`"week_rookie"`（新人周榜）<br>`"day_r18"`（R18 日榜）<br>`"day_male_r18"`（男性向 R18 日榜）<br>`"day_female_r18"`（女性向 R18 日榜） |
| `rankingDate` | string | 排行榜日期 | `"2024-01-01"`（YYYY-MM-DD 格式）或 `"YESTERDAY"`（昨天） |
| `filterTag` | string \| null | 过滤标签 | `"風景"` 或 `null`（不过滤） |

### 单作品下载配置

| 选项 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `illustId` | number | 单个插画ID | `12345678`（从 URL `https://www.pixiv.net/artworks/12345678` 中获取） |
| `novelId` | number | 单篇小说ID | `26132156`（从 URL `https://www.pixiv.net/novel/show.php?id=26132156` 中获取） |
| `seriesId` | number | 小说系列ID | `14690617`（从 URL `https://www.pixiv.net/novel/series/14690617` 中获取） |

**注意**：使用单作品下载时，`tag` 字段是可选的（可以设置为 `"single"` 作为标识）。

### 小说专用配置

| 选项 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `languageFilter` | string | 语言过滤 | `"chinese"`（仅中文）<br>`"non-chinese"`（仅非中文）<br>不设置则下载所有语言 |
| `detectLanguage` | boolean | 启用语言检测 | `true`（默认）或 `false` |

### 配置示例

#### 示例 1：多标签搜索

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "明日方舟 アークナイツ アーミヤ",
      "tagRelation": "and",
      "limit": 30,
      "mode": "search",
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

#### 示例 2：按收藏数筛选

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 50,
      "mode": "search",
      "minBookmarks": 1000,
      "sort": "popular_desc"
    }
  ]
}
```

#### 示例 3：排行榜下载

```json
{
  "targets": [
    {
      "type": "illustration",
      "mode": "ranking",
      "rankingMode": "day",
      "rankingDate": "YESTERDAY",
      "limit": 10
    }
  ]
}
```

#### 示例 4：小说系列下载

```json
{
  "targets": [
    {
      "type": "novel",
      "seriesId": 14690617,
      "limit": 50
    }
  ]
}
```

#### 示例 5：单插画下载

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "single",
      "illustId": 12345678
    }
  ]
}
```

**说明**：从 URL `https://www.pixiv.net/artworks/12345678` 中提取插画ID `12345678`。

#### 示例 6：单篇小说下载

```json
{
  "targets": [
    {
      "type": "novel",
      "tag": "single",
      "novelId": 26132156
    }
  ]
}
```

**说明**：从 URL `https://www.pixiv.net/novel/show.php?id=26132156` 中提取小说ID `26132156`。

#### 示例 7：语言过滤（仅中文小说）

```json
{
  "targets": [
    {
      "type": "novel",
      "tag": "原神",
      "limit": 20,
      "languageFilter": "chinese",
      "detectLanguage": true
    }
  ]
}
```

---

## 🌐 网络配置

```json
{
  "network": {
    "timeoutMs": 30000,
    "retries": 3,
    "retryDelay": 1000,
    "proxy": {
      "enabled": false,
      "host": "127.0.0.1",
      "port": 7890,
      "protocol": "http",
      "username": "",
      "password": ""
    }
  }
}
```

**说明**：
- `timeoutMs`：请求超时时间（毫秒），默认 30000（30秒）
- `retries`：失败重试次数，默认 3
- `retryDelay`：重试延迟（毫秒），默认 1000（1秒）
- `proxy`：代理配置（可选）
  - `protocol`：支持 `http`、`https`、`socks4`、`socks5`

**提示**：也可以通过环境变量设置代理，优先级更高：
```bash
export all_proxy=socks5://127.0.0.1:6153
```

---

## 💾 存储配置

```json
{
  "storage": {
    "databasePath": "./data/pixiv-downloader.db",
    "downloadDirectory": "./downloads",
    "illustrationDirectory": "./downloads/illustrations",
    "novelDirectory": "./downloads/novels",
    "illustrationOrganization": "flat",
    "novelOrganization": "flat"
  }
}
```

**快速设置目录路径**：

可以使用命令行快速设置目录路径，无需手动编辑配置文件：

```bash
# 设置下载目录
pixivflow config set storage.downloadDirectory ./my-downloads

# 设置插画目录
pixivflow config set storage.illustrationDirectory ./my-illustrations

# 设置小说目录
pixivflow config set storage.novelDirectory ./my-novels

# 设置数据库路径
pixivflow config set storage.databasePath ./data/my-db.db
```

**查看目录信息**：

```bash
# 查看所有目录路径
pixivflow dirs

# 查看详细目录信息（包括绝对路径、是否存在等）
pixivflow dirs --verbose
```

### 目录组织方式

| 模式 | 说明 | 目录结构示例 |
|------|------|-------------|
| `flat` | 扁平结构（默认） | `illustrations/123456_标题_1.jpg` |
| `byAuthor` | 按作者组织 | `illustrations/作者名/123456_标题_1.jpg` |
| `byTag` | 按标签组织 | `illustrations/标签名/123456_标题_1.jpg` |
| `byDate` | 按作品创建日期组织（YYYY-MM） | `illustrations/2024-12/123456_标题_1.jpg` |
| `byDay` | 按作品创建日期组织（YYYY-MM-DD） | `illustrations/2024-12-25/123456_标题_1.jpg` |
| `byDownloadDate` | 按下载日期组织（YYYY-MM） | `illustrations/2024-12/123456_标题_1.jpg` |
| `byDownloadDay` | 按下载日期组织（YYYY-MM-DD） | `illustrations/2024-12-25/123456_标题_1.jpg` |
| `byAuthorAndTag` | 按作者和标签 | `illustrations/作者名/标签名/123456_标题_1.jpg` |
| `byDateAndAuthor` | 按作品创建日期和作者 | `illustrations/2024-12/作者名/123456_标题_1.jpg` |
| `byDayAndAuthor` | 按作品创建日期和作者 | `illustrations/2024-12-25/作者名/123456_标题_1.jpg` |
| `byDownloadDateAndAuthor` | 按下载日期和作者 | `illustrations/2024-12/作者名/123456_标题_1.jpg` |
| `byDownloadDayAndAuthor` | 按下载日期和作者 | `illustrations/2024-12-25/作者名/123456_标题_1.jpg` |

---

## ⏰ 定时任务配置

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai",
    "maxExecutions": null,
    "minInterval": null,
    "timeout": null,
    "maxConsecutiveFailures": null,
    "failureRetryDelay": null
  }
}
```

**说明**：
- `enabled`：是否启用定时任务，默认 `false`
- `cron`：Cron 表达式，默认 `"0 3 * * *"`（每天凌晨3点）
- `timezone`：时区，默认 `"Asia/Shanghai"`

### Cron 表达式速查

| 表达式 | 说明 |
|--------|------|
| `0 * * * *` | 每小时执行 |
| `0 */6 * * *` | 每 6 小时执行 |
| `0 2 * * *` | 每天 2:00 执行 |
| `0 0 * * 0` | 每周日 0:00 执行 |
| `0 0 1 * *` | 每月 1 号 0:00 执行 |

---

## 📥 下载配置

```json
{
  "download": {
    "concurrency": 3,
    "requestDelay": 500,
    "dynamicConcurrency": true,
    "minConcurrency": 1,
    "maxRetries": 3,
    "retryDelay": 2000,
    "timeout": 60000
  }
}
```

**说明**：
- `concurrency`：最大并发下载数，默认 3（建议范围 1-10）
- `requestDelay`：API 请求之间的最小延迟（毫秒），默认 500（0.5秒）
- `dynamicConcurrency`：是否启用动态并发调整，默认 `true`
  - 当检测到速率限制（429错误）时，自动降低并发数
- `minConcurrency`：动态调整时的最小并发数，默认 1
- `maxRetries`：每个下载的最大重试次数，默认 3
- `retryDelay`：重试延迟（毫秒），默认 2000（2秒）
- `timeout`：下载超时时间（毫秒），默认 60000（60秒）

> 速率限制建议：若使用 `tagRelation: "or"`（会对多个标签顺序检索并在标签之间施加延迟），推荐将 `requestDelay` 适当调高（例如 1500~3000ms），以进一步降低 429 的概率。

---

## 🔧 其他配置

```json
{
  "logLevel": "info",
  "initialDelay": 0
}
```

**说明**：
- `logLevel`：日志级别，可选 `"debug"`、`"info"`、`"warn"`、`"error"`，默认 `"info"`
- `initialDelay`：启动延迟（毫秒），用于测试或延迟启动，默认 0

---

## 📚 相关文档

- [快速开始指南](./QUICKSTART.md)
- [使用指南](./USAGE.md)
- [登录指南](./LOGIN.md)

