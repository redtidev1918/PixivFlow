# 📋 配置文件使用指南

## 核心理念

**所有下载任务都通过配置文件实现，无需修改源代码！**

PixivFlow 的设计理念是：通过配置文件定义下载任务，使用通用的 `download` 命令执行。如果某个任务无法通过配置文件实现，那说明通用功能需要增强，而不是添加特定脚本。

## 🎯 如何实现特定下载任务

### 方法一：修改现有配置文件

1. **编辑配置文件**（通常是 `config/standalone.config.json`）
2. **修改 `targets` 数组**，添加或修改下载目标
3. **运行通用命令**：`pixivflow download` 或 `npm run download`

### 方法二：使用示例配置文件

1. **复制示例配置**：
   ```bash
   cp config/specific-download.example.json config/standalone.config.json
   ```

2. **修改配置**（如需要）：
   - 更新 `refreshToken`（如果还没有登录）
   - 调整 `targets` 数组中的下载目标

3. **运行下载**：
   ```bash
   pixivflow download
   ```

### 方法三：使用 --config 参数指定配置文件

```bash
# 使用自定义配置文件
pixivflow download --config config/my-custom-config.json
```

## 📝 配置文件结构

### 基本结构

```json
{
  "pixiv": {
    "refreshToken": "YOUR_REFRESH_TOKEN"
  },
  "targets": [
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 10,
      "mode": "search"
    }
  ]
}
```

### targets 数组说明

`targets` 是一个数组，可以包含多个下载目标。每个目标会被**顺序执行**。

#### 支持的 target 类型

1. **illustration**（插画/图片）
2. **novel**（小说）

## 📖 完整配置选项说明

### 必填字段

| 字段 | 说明 | 类型 | 示例 |
|------|------|------|------|
| `type` | 内容类型 | `"illustration"` 或 `"novel"` | `"illustration"` |

### 基础配置字段

| 字段 | 说明 | 类型 | 默认值 | 示例 |
|------|------|------|--------|------|
| `tag` | 搜索标签（支持多个标签，用空格分隔，表示AND关系，作品必须同时包含所有标签） | `string` | - | `"原神"` 或 `"明日方舟 アークナイツ"` |
| `limit` | 每次运行下载数量限制 | `number` | - | `10` |
| `mode` | 下载模式 | `"search"` 或 `"ranking"` | `"search"` | `"search"` |

### 搜索相关字段（mode="search" 时使用）

| 字段 | 说明 | 可选值 | 默认值 | 示例 |
|------|------|--------|--------|------|
| `searchTarget` | 搜索范围 | `"partial_match_for_tags"`（部分匹配标签）<br>`"exact_match_for_tags"`（精确匹配标签）<br>`"title_and_caption"`（标题和说明） | `"partial_match_for_tags"` | `"partial_match_for_tags"` |
| `sort` | 排序方式 | `"date_desc"`（按日期降序，最新优先）<br>`"date_asc"`（按日期升序，最旧优先）<br>`"popular_desc"`（按人气降序，收藏最多优先） | `"date_desc"` | `"popular_desc"` |
| `restrict` | 内容限制 | `"public"`（公开）<br>`"private"`（私有） | `"public"` | `"public"` |

### 排行榜相关字段（mode="ranking" 时使用）

| 字段 | 说明 | 可选值 | 默认值 | 示例 |
|------|------|--------|--------|------|
| `rankingMode` | 排行榜模式 | `"day"`（日榜）<br>`"week"`（周榜）<br>`"month"`（月榜）<br>`"day_male"`（男性向日榜）<br>`"day_female"`（女性向日榜）<br>`"day_ai"`（AI作品日榜）<br>`"week_original"`（原创周榜）<br>`"week_rookie"`（新人周榜）<br>`"day_r18"`（R18日榜）<br>`"day_male_r18"`（男性向R18日榜）<br>`"day_female_r18"`（女性向R18日榜） | `"day"` | `"day"` |
| `rankingDate` | 排行榜日期 | `"YYYY-MM-DD"` 格式或 `"YESTERDAY"` | 今天 | `"2024-01-15"` 或 `"YESTERDAY"` |
| `filterTag` | 过滤标签（从排行榜结果中筛选包含此标签的作品） | `string` 或 `null` | `null`（不过滤） | `"アークナイツ"` |

### 筛选条件字段

| 字段 | 说明 | 类型 | 示例 |
|------|------|------|------|
| `minBookmarks` | 最低收藏数（只下载收藏数大于等于此值的作品） | `number` | `500` |
| `startDate` | 开始日期（只下载此日期之后的作品） | `"YYYY-MM-DD"` | `"2024-01-01"` |
| `endDate` | 结束日期（只下载此日期之前的作品） | `"YYYY-MM-DD"` | `"2024-12-31"` |

### 特殊下载模式字段

| 字段 | 说明 | 类型 | 示例 |
|------|------|------|------|
| `random` | 是否随机选择（从搜索结果中随机选择，而不是按顺序下载） | `boolean` | `true` |
| `seriesId` | 小说系列ID（仅 `type="novel"` 时有效，下载整个系列） | `number` | `14690617` |
| `novelId` | 单篇小说ID（仅 `type="novel"` 时有效，下载单篇小说） | `number` | `26132156` |

> **💡 提示**：
> - 当指定 `seriesId` 或 `novelId` 时，`tag` 和 `mode` 字段会被忽略
> - `seriesId` 和 `novelId` 不能同时使用
> - 使用 `seriesId` 时，`limit` 表示最多下载系列中的多少篇小说（默认下载全部）

## 🎨 下载任务类型详解

### 1. 标签搜索下载（最常用）

#### 1.1 基础标签搜索

**场景**：下载包含特定标签的作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 20,
      "mode": "search"
    }
  ]
}
```

#### 1.2 多标签搜索（AND关系）

**场景**：下载同时包含多个标签的作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "明日方舟 アークナイツ アーミヤ",
      "limit": 30,
      "mode": "search",
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

**说明**：
- 在 `tag` 字段中用**空格分隔多个标签**，表示作品必须**同时包含**所有这些标签（AND关系）
- 支持中文、日文、英文标签混合使用
- 建议使用 `"searchTarget": "partial_match_for_tags"` 以获得更好的匹配效果

#### 1.3 按收藏数筛选

**场景**：只下载收藏数较高的高质量作品

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

#### 1.4 按日期范围筛选

**场景**：下载特定时间段内的作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "オリジナル",
      "limit": 100,
      "mode": "search",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "sort": "date_desc"
    }
  ]
}
```

**日期过滤逻辑说明**：

当使用日期范围筛选时，系统会根据排序方式采用不同的策略：

**使用 `date_desc` 排序（默认，从新到旧）**：
- 从最新作品开始搜索，逐个向下查找
- 遇到晚于 `endDate` 的作品：**跳过**（不加入结果），但**继续搜索**
- 遇到在时间区间内的作品：**加入结果**
- 遇到早于 `startDate` 的作品：**停止搜索**（不再继续）

**使用 `date_asc` 排序（从旧到新）**：
- 从最早作品开始搜索，逐个向上查找
- 遇到早于 `startDate` 的作品：**跳过**（不加入结果），但**继续搜索**
- 遇到在时间区间内的作品：**加入结果**
- 遇到晚于 `endDate` 的作品：**停止搜索**（不再继续）

**使用 `popular_desc` 排序（按人气降序，收藏最多优先）**：
- ⚠️ **重要**：`popular_desc` 模式下的日期过滤行为与 `date_desc` 不同
- 系统会先获取更多结果（最多 10 倍于 `limit`），然后按日期过滤
- 因为人气排序不按时间顺序，无法提前停止搜索，需要获取足够的结果后再过滤
- 如果日期范围内结果不足，系统会发出警告并记录详细信息
- 建议：如果主要目标是按日期范围筛选，优先使用 `date_desc` 排序以获得更好的性能

**示例**：
假设时间区间为 `2025-11-08` 到 `2025-11-09`，使用默认 `date_desc` 排序：

```
搜索结果顺序（从新到旧）：
2025-11-10 ❌ 跳过（晚于 endDate），继续搜索
2025-11-09 ✅ 加入结果（在区间内）
2025-11-09 ✅ 加入结果（在区间内）
2025-11-08 ✅ 加入结果（在区间内）
2025-11-08 ✅ 加入结果（在区间内）
2025-11-07 ⛔ 停止搜索（早于 startDate）
```

这样可以高效地获取指定时间范围内的作品，避免继续获取范围外的作品。

**日期格式要求**：
- 日期格式必须为 `YYYY-MM-DD`（例如：`2024-01-15`）
- 系统会自动验证日期格式和有效性（如 `2024-02-30` 会被拒绝）
- 系统会检查 `startDate <= endDate`，无效范围会返回错误
- 所有日期使用 UTC 时区处理，确保跨时区一致性

#### 1.5 随机下载

**场景**：从搜索结果中随机选择作品下载（适合每日随机壁纸等场景）

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 1,
      "mode": "search",
      "random": true,
      "minBookmarks": 500
    }
  ]
}
```

**说明**：
- `random: true` 时，会先获取 `limit` 数量的搜索结果，然后从中随机选择一个下载
- 适合用于每日随机壁纸、随机推荐等场景

#### 1.6 按不同排序方式下载

**场景A**：下载最新作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 20,
      "mode": "search",
      "sort": "date_desc"
    }
  ]
}
```

**场景B**：下载最受欢迎的作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 20,
      "mode": "search",
      "sort": "popular_desc"
    }
  ]
}
```

**场景C**：下载最早的作品（考古向）

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 20,
      "mode": "search",
      "sort": "date_asc"
    }
  ]
}
```

### 2. 排行榜下载

#### 2.1 下载今日排行榜

**场景**：下载今日排行榜前N名作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 10,
      "mode": "ranking",
      "rankingMode": "day"
    }
  ]
}
```

#### 2.2 从排行榜中筛选特定标签

**场景**：从今日排行榜中筛选包含特定标签的作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "アークナイツ",
      "limit": 20,
      "mode": "ranking",
      "rankingMode": "day",
      "filterTag": "アークナイツ"
    }
  ]
}
```

**说明**：
- `filterTag` 用于从排行榜结果中筛选包含该标签的作品
- 如果排行榜中符合标签的作品较少，可能需要获取更多排名作品才能达到 `limit` 数量

#### 2.3 下载指定日期的排行榜

**场景**：下载历史某一天的排行榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 50,
      "mode": "ranking",
      "rankingMode": "day",
      "rankingDate": "2024-01-15"
    }
  ]
}
```

#### 2.4 下载周榜/月榜

**场景A**：下载本周排行榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 30,
      "mode": "ranking",
      "rankingMode": "week"
    }
  ]
}
```

**场景B**：下载本月排行榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 50,
      "mode": "ranking",
      "rankingMode": "month"
    }
  ]
}
```

#### 2.5 下载分类排行榜

**场景A**：下载男性向排行榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 20,
      "mode": "ranking",
      "rankingMode": "day_male"
    }
  ]
}
```

**场景B**：下载女性向排行榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 20,
      "mode": "ranking",
      "rankingMode": "day_female"
    }
  ]
}
```

**场景C**：下载AI作品排行榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 20,
      "mode": "ranking",
      "rankingMode": "day_ai"
    }
  ]
}
```

**场景D**：下载原创作品周榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 30,
      "mode": "ranking",
      "rankingMode": "week_original"
    }
  ]
}
```

**场景E**：下载新人作品周榜

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 30,
      "mode": "ranking",
      "rankingMode": "week_rookie"
    }
  ]
}
```

#### 2.6 下载昨天排行榜

**场景**：下载昨天的排行榜（使用 `YESTERDAY` 占位符）

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 10,
      "mode": "ranking",
      "rankingMode": "day",
      "rankingDate": "YESTERDAY"
    }
  ]
}
```

### 3. 小说下载

#### 3.1 标签搜索小说

**场景**：下载包含特定标签的小说

```json
{
  "targets": [
    {
      "type": "novel",
      "tag": "オリジナル",
      "limit": 20,
      "mode": "search",
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

#### 3.2 下载小说系列

**场景**：下载整个小说系列**

从 URL `https://www.pixiv.net/novel/series/14690617` 中提取系列ID `14690617`

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

**说明**：
- `seriesId` 优先级高于 `tag` 和 `mode`
- `limit` 表示最多下载系列中的多少篇小说（默认下载全部）
- 已下载的小说会自动跳过

#### 3.3 下载单篇小说

**场景**：下载指定ID的单篇小说

从 URL `https://www.pixiv.net/novel/show.php?id=26132156` 中提取小说ID `26132156`

```json
{
  "targets": [
    {
      "type": "novel",
      "novelId": 26132156
    }
  ]
}
```

**说明**：
- `novelId` 优先级最高，会忽略其他字段
- 不需要 `limit` 字段（只下载一篇）

#### 3.4 小说排行榜下载

**场景**：从小说排行榜中下载

```json
{
  "targets": [
    {
      "type": "novel",
      "tag": "オリジナル",
      "limit": 20,
      "mode": "ranking",
      "rankingMode": "day",
      "filterTag": "オリジナル"
    }
  ]
}
```

### 4. 组合筛选条件

#### 4.1 多条件组合

**场景**：下载2024年收藏数超过1000的高质量作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 100,
      "mode": "search",
      "minBookmarks": 1000,
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "sort": "popular_desc"
    }
  ]
}
```

#### 4.2 多标签 + 筛选条件

**场景**：下载同时包含多个标签且收藏数较高的作品

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "明日方舟 アークナイツ アーミヤ",
      "limit": 50,
      "mode": "search",
      "minBookmarks": 500,
      "sort": "popular_desc",
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

### 5. 多目标组合下载

**场景**：同时配置多个不同的下载任务

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 20,
      "mode": "search",
      "sort": "popular_desc"
    },
    {
      "type": "illustration",
      "tag": "アークナイツ",
      "limit": 20,
      "mode": "search",
      "sort": "popular_desc"
    },
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 10,
      "mode": "ranking",
      "rankingMode": "day"
    },
    {
      "type": "novel",
      "tag": "オリジナル",
      "limit": 10,
      "mode": "search"
    }
  ]
}
```

**说明**：
- 多个目标会**按顺序执行**
- 每个目标独立配置，互不影响
- 适合同时下载多个不同标签或不同类型的作品

## 🔧 高级配置

### 完整配置示例

参考 `config/standalone.config.example.json` 查看完整的配置示例，包括：
- 网络配置（代理、超时等）
- 存储配置（下载目录、数据库路径、目录组织方式）
- 下载配置（并发数、重试次数等）
- 调度器配置（定时任务）

### 存储配置 - 目录组织

PixivFlow 支持多种目录组织方式，让下载的文件更有条理：

```json
{
  "storage": {
    "illustrationDirectory": "./downloads/illustrations",
    "illustrationOrganization": "byAuthorAndTag",
    "novelDirectory": "./downloads/novels",
    "novelOrganization": "byDateAndAuthor"
  }
}
```

**支持的组织模式**：
- `flat` - 扁平结构（默认）
- `byAuthor` - 按作者组织
- `byTag` - 按标签组织
- `byDate` - 按日期组织（YYYY-MM）
- `byDay` - 按日组织（YYYY-MM-DD）
- `byAuthorAndTag` - 按作者和标签
- `byDateAndAuthor` - 按日期和作者
- `byDayAndAuthor` - 按日和作者

> **💡 重要提示**：
> - 使用 `byDate` 或 `byDay` 模式时，会在日期文件夹下自动创建 `novels` 和 `illustrations` 子文件夹，分别存放小说和图片
> - 例如：`{baseDir}/2024-12-25/novels/` 和 `{baseDir}/2024-12-25/illustrations/`
> - 这样可以方便地在同一个日期文件夹下区分不同类型的内容

详细说明请参考 [STANDALONE-SETUP-GUIDE.md](STANDALONE-SETUP-GUIDE.md#4-存储配置)。

### 下载配置

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

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `concurrency` | 最大并发下载数（建议范围 1-10） | `3` |
| `requestDelay` | API 请求之间的最小延迟（毫秒），用于避免速率限制 | `500` |
| `dynamicConcurrency` | 是否启用动态并发调整。当检测到速率限制（429错误）时，自动降低并发数 | `true` |
| `minConcurrency` | 动态调整时的最小并发数，不会低于此值 | `1` |
| `maxRetries` | 每个下载的最大重试次数 | `3` |
| `retryDelay` | 重试延迟（毫秒） | `2000` |
| `timeout` | 下载超时时间（毫秒） | `60000` |

#### 并发控制说明

PixivFlow 提供了智能的并发控制机制，帮助您避免触发 Pixiv API 的速率限制：

1. **请求延迟控制**：每个 API 请求之间会自动添加 `requestDelay` 毫秒的延迟，有效降低触发速率限制的概率。

2. **动态并发调整**（默认启用）：
   - 当检测到速率限制（429 错误）时，系统会自动将并发数减半
   - 并发数不会低于 `minConcurrency` 设置的值
   - 连续成功请求后，系统会逐步恢复并发数
   - 系统会记录详细的日志，包括并发数变化信息

3. **队列式处理**：使用队列而非批次处理，保持稳定的并发数，任务完成后立即启动新任务，提高资源利用率。

**推荐配置**：
- 如果经常遇到速率限制，可以：
  - 增加 `requestDelay`（例如 1000-2000ms）
  - 降低 `concurrency`（例如 1-2）
  - 保持 `dynamicConcurrency: true` 以自动适应
- 如果网络稳定且很少遇到速率限制，可以：
  - 适当增加 `concurrency`（例如 3-5）
  - 保持较小的 `requestDelay`（例如 300-500ms）

### 定时任务配置

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

**Cron 表达式速查**：

| 表达式 | 说明 |
|--------|------|
| `0 * * * *` | 每小时执行 |
| `0 */6 * * *` | 每 6 小时执行 |
| `0 2 * * *` | 每天 2:00 执行 |
| `0 0 * * 0` | 每周日 0:00 执行 |
| `0 0 1 * *` | 每月 1 号 0:00 执行 |

## ❓ 常见问题

### Q: 如何添加新的下载任务？

**A:** 只需在配置文件的 `targets` 数组中添加新的目标对象，无需修改代码。

### Q: 如果配置文件无法实现某个需求怎么办？

**A:** 这说明通用功能需要增强。请：
1. 检查是否有遗漏的配置选项
2. 如果确实无法实现，可以提出功能需求或提交 Issue
3. **不要**创建特定脚本来绕过这个问题

### Q: 可以同时运行多个不同的配置文件吗？

**A:** 可以，但需要分别运行：
```bash
# 运行第一个配置
pixivflow download --config config/config1.json

# 运行第二个配置
pixivflow download --config config/config2.json
```

或者使用调度器，为不同的配置文件设置不同的定时任务。

### Q: 多标签搜索时，标签的顺序重要吗？

**A:** 不重要。`"明日方舟 アークナイツ"` 和 `"アークナイツ 明日方舟"` 效果相同。

### Q: 如何从 Pixiv URL 中提取 ID？

**A:** 
- **小说系列**：从 `https://www.pixiv.net/novel/series/14690617` 中提取 `14690617`
- **单篇小说**：从 `https://www.pixiv.net/novel/show.php?id=26132156` 中提取 `26132156`
- **插画**：从 `https://www.pixiv.net/artworks/12345678` 中提取 `12345678`（目前不支持直接下载，需要通过标签搜索）

### Q: 排行榜下载时，为什么筛选标签后下载很慢？

**A:** 因为需要为每个作品获取详细信息来检查标签。如果不需要筛选，建议不使用 `filterTag`，直接下载排行榜作品。

### Q: `random: true` 时，`limit` 的含义是什么？

**A:** `limit` 表示从搜索结果中获取多少个作品，然后从中随机选择一个下载。例如 `limit: 100` 会获取前100个结果，然后随机选择1个。

### Q: 如何下载特定作者的所有作品？

**A:** 目前不支持直接按作者ID下载。可以通过搜索作者名作为标签来下载，但可能不够精确。建议使用 Pixiv 的收藏功能，然后下载收藏的作品。

### Q: 下载的小说保存在哪里？

**A:** 默认保存在 `./downloads/novels/` 目录。可以通过 `storage.novelDirectory` 配置自定义路径。

### Q: 如何避免重复下载？

**A:** 程序会自动检查数据库，已下载的作品不会重复下载。数据库路径由 `storage.databasePath` 配置（默认 `./data/pixiv-downloader.db`）。

## 📚 更多资源

- `config/standalone.config.example.json` - 基础配置示例
- `config/specific-download.example.json` - 特定任务配置示例
- `config/standalone.config.ranking.json` - 排行榜下载配置示例
- [STANDALONE-SETUP-GUIDE.md](STANDALONE-SETUP-GUIDE.md) - 详细设置指南
- [RANKING_DOWNLOAD_GUIDE.md](RANKING_DOWNLOAD_GUIDE.md) - 排行榜下载指南
