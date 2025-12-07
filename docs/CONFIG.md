# 配置手册

配置文件路径：`config/standalone.config.json`

## 快速管理

### 初始化
首次使用请复制示例文件：
```bash
cp config/standalone.config.example.json config/standalone.config.json
```

### 命令行工具
无需手动编辑 JSON，使用 CLI 即可修改配置：

```bash
# 查看当前配置
pixivflow config show

# 修改配置（自动备份）
pixivflow config set storage.downloadDirectory ./my-downloads
pixivflow config set storage.illustrationDirectory ./my-illustrations

# 校验配置格式
pixivflow config validate

# 备份与恢复
pixivflow config backup
pixivflow config restore
```

查看目录详情：
```bash
pixivflow dirs          # 路径列表
pixivflow dirs --verbose # 详细信息
```

---

## 认证 (Auth)

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

- `refreshToken`: 运行 `npm run login` 自动获取。
- 其他字段通常保持默认即可。

---

## 下载目标 (Targets)

`targets` 数组定义下载任务。

### 基础示例
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

### 核心参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `type` | `illustration` (插画) / `novel` (小说) | - |
| `tag` | 搜索关键词，多标签用空格分隔 | `"明日方舟 アークナイツ"` |
| `tagRelation` | `and` (全匹配, 默认) / `or` (任意匹配) | - |
| `limit` | 下载数量限制 | `20` |
| `mode` | `search` (搜索) / `ranking` (排行榜) | - |
| `searchTarget` | `partial_match_for_tags` (标签部分匹配)<br>`exact_match_for_tags` (标签精确匹配)<br>`title_and_caption` (标题/简介) | - |
| `sort` | `date_desc` (最新)<br>`popular_desc` (热门)<br>`date_asc` (最旧) | - |
| `minBookmarks` | 最小收藏数过滤 | `500` |
| `startDate`/`endDate` | 日期范围 (YYYY-MM-DD) | `"2024-01-01"` |
| `random` | `true` 表示随机从结果中选取 | - |
| `restrict` | `public` (公开) / `private` (私密) | - |

> **关于 `or` 模式**：
> `or` 模式会将标签拆分后逐个搜索，最后合并去重。
> 建议配合 `download.requestDelay` (1500~3000ms) 使用，以防触发限流。

### 排行榜 (`mode="ranking"`)

| 参数 | 说明 |
|------|------|
| `rankingMode` | `day`, `week`, `month`, `day_male`, `day_female`, `day_ai`, `week_original`, `week_rookie`, `day_r18` 等 |
| `rankingDate` | 日期 (YYYY-MM-DD) 或 `"YESTERDAY"` |
| `filterTag` | 结果中二次过滤标签，`null` 为不过滤 |

### 定向下载 (ID/User)

支持直接下载指定 ID 或画师作品。此时 `tag` 字段可随意填写（建议设为 `"single"` 或 `"user-xxx"` 以便识别）。

| 参数 | 说明 | URL 示例 |
|------|------|----------|
| `illustId` | 插画 ID | `artworks/12345678` |
| `novelId` | 小说 ID | `novel/show.php?id=26132156` |
| `seriesId` | 小说系列 ID | `novel/series/14690617` |
| `userId` | 画师 ID (下载全集) | `users/123456` |

### 小说专用

| 参数 | 说明 |
|------|------|
| `languageFilter` | `chinese` (仅中文) / `non-chinese` (非中文)。留空则不限。 |
| `detectLanguage` | 是否启用语言检测 (默认 `true`) |

---

## 常用配置组合

### 组合搜索
搜索同时包含 "明日方舟" 和 "阿米娅" 的插画，下载 30 张。
```json
{
  "type": "illustration",
  "tag": "明日方舟 アーミヤ",
  "tagRelation": "and",
  "limit": 30,
  "mode": "search",
  "searchTarget": "partial_match_for_tags"
}
```

### 收藏数筛选
搜索 "风景" 且收藏数 > 1000 的热门图。
```json
{
  "type": "illustration",
  "tag": "風景",
  "limit": 50,
  "mode": "search",
  "minBookmarks": 1000,
  "sort": "popular_desc"
}
```

### 每日排行
下载昨日插画日榜前 10 名。
```json
{
  "type": "illustration",
  "mode": "ranking",
  "rankingMode": "day",
  "rankingDate": "YESTERDAY",
  "limit": 10
}
```

### 画师全集
```json
{
  "type": "illustration",
  "tag": "user",
  "userId": "123456",
  "limit": 100  // 不填默认 30
}
```

### 中文小说
```json
{
  "type": "novel",
  "tag": "原神",
  "languageFilter": "chinese"
}
```

---

## 网络设置 (Network)

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
      "protocol": "http" // http, https, socks4, socks5
    }
  }
}
```

也可直接使用环境变量（优先级更高）：
```bash
export all_proxy=socks5://127.0.0.1:6153
```

---

## 存储路径 (Storage)

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

CLI 快捷设置：
```bash
pixivflow config set storage.downloadDirectory ./new-path
```

### 目录结构 (`organization`)

| 模式 | 路径示例 |
|------|----------|
| `flat` (默认) | `illustrations/123456_title_p0.jpg` |
| `byAuthor` | `illustrations/AuthorName/123456_title_p0.jpg` |
| `byTag` | `illustrations/TagName/123456_title_p0.jpg` |
| `byDate` | `illustrations/2024-12/123456_title_p0.jpg` |
| `byDay` | `illustrations/2024-12-25/123456_title_p0.jpg` |
| `byAuthorAndTag` | `illustrations/AuthorName/TagName/...` |

---

## 定时任务 (Scheduler)

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *", // 每天凌晨 3 点
    "timezone": "Asia/Shanghai"
  }
}
```

常用 Cron：
- `0 * * * *`: 每小时
- `0 */6 * * *`: 每 6 小时
- `0 2 * * *`: 每天 02:00

---

## 下载控制 (Download)

```json
{
  "download": {
    "concurrency": 3,         // 并发数 (建议 1-10)
    "requestDelay": 500,      // API 请求间隔 (ms)
    "dynamicConcurrency": true, // 遇 429 自动降速
    "maxRetries": 3,
    "timeout": 60000
  }
}
```
