# 查找已下载文件指南（命令行方法）

本指南介绍如何**不依赖前端**，通过命令行查找刚刚下载的文件。

> **注意**：所有方法都不需要打开 WebUI 前端界面，可以直接在终端中使用。

## 最简单的方法：按下载日期组织文件

**推荐方式**：通过配置文件的组织模式，让系统自动按下载日期组织文件，这样今天下载的文件会自动放在今天的文件夹中，昨天下载的放在昨天的文件夹中。

### 配置方法

在配置文件中设置 `illustrationOrganization` 或 `novelOrganization` 为以下模式之一：

- `byDownloadDay` - 按下载日期（年月日）组织：`下载目录/2024-01-15/文件名`
- `byDownloadDate` - 按下载月份组织：`下载目录/2024-01/文件名`
- `byDownloadDayAndAuthor` - 按下载日期和作者组织：`下载目录/2024-01-15/作者名/文件名`
- `byDownloadDateAndAuthor` - 按下载月份和作者组织：`下载目录/2024-01/作者名/文件名`

### 配置示例

```json
{
  "storage": {
    "downloadDirectory": "./downloads",
    "illustrationOrganization": "byDownloadDay",
    "novelOrganization": "byDownloadDay"
  }
}
```

配置后，新下载的文件会自动按下载日期组织：
- 今天（2024-01-15）下载的文件 → `downloads/2024-01-15/文件名`
- 昨天（2024-01-14）下载的文件 → `downloads/2024-01-14/文件名`

这样你就可以直接通过文件夹结构找到不同日期下载的文件，无需查询数据库或使用 API。

> **提示**：`byDownloadDay` 使用下载日期（当前日期），而 `byDay` 使用作品的创建日期。如果你想要按下载日期组织，请使用 `byDownloadDay` 而不是 `byDay`。

## 方法一：使用 API 查询（推荐）

需要确保 WebUI 服务正在运行（默认端口 3000）。

### 1. 查询最近下载的文件（默认最近50个）

```bash
# 查询所有类型最近下载的文件
curl http://localhost:3000/api/files/recent

# 只查询插画
curl http://localhost:3000/api/files/recent?type=illustration

# 只查询小说
curl http://localhost:3000/api/files/recent?type=novel

# 指定返回数量（例如最近10个）
curl "http://localhost:3000/api/files/recent?limit=10"
```

### 2. 查询今天下载的文件

```bash
# 查询今天下载的所有文件
curl http://localhost:3000/api/files/recent?filter=today

# 查询今天下载的插画
curl http://localhost:3000/api/files/recent?filter=today&type=illustration
```

### 3. 查询昨天下载的文件

```bash
# 查询昨天下载的所有文件
curl http://localhost:3000/api/files/recent?filter=yesterday

# 查询昨天下载的小说
curl http://localhost:3000/api/files/recent?filter=yesterday&type=novel
```

### 4. 查询最近7天/30天下载的文件

```bash
# 最近7天
curl http://localhost:3000/api/files/recent?filter=last7days

# 最近30天
curl http://localhost:3000/api/files/recent?filter=last30days
```

## API 响应格式

```json
{
  "files": [
    {
      "pixivId": "12345678",
      "type": "illustration",
      "tag": "tag_name",
      "title": "作品标题",
      "filePath": "/path/to/file.jpg",
      "relativePath": "tag_name/file.jpg",
      "author": "作者名",
      "userId": "12345",
      "downloadedAt": "2024-01-15T10:30:00.000Z",
      "exists": true,
      "size": 1024000,
      "modified": "2024-01-15T10:30:00.000Z",
      "name": "file.jpg",
      "extension": ".jpg"
    }
  ],
  "total": 1,
  "filter": "today",
  "type": "illustration"
}
```

## 方法二：在文件列表中查看下载时间

文件列表API现在会显示每个文件的下载时间：

```bash
# 列出文件，按下载时间排序
curl http://localhost:3000/api/files/list?type=illustration&sort=downloadedAt&order=desc

# 列出指定目录的文件
curl http://localhost:3000/api/files/list?type=illustration&path=tag_name
```

响应中每个文件会包含 `downloadedAt` 字段：

```json
{
  "files": [
    {
      "name": "file.jpg",
      "path": "tag_name/file.jpg",
      "type": "file",
      "size": 1024000,
      "modified": "2024-01-15T10:30:00.000Z",
      "downloadedAt": "2024-01-15T10:30:00.000Z",
      "extension": ".jpg"
    }
  ]
}
```

## 方法三：直接查询数据库

如果你熟悉 SQL，也可以直接查询数据库：

```bash
# 使用 sqlite3 命令行工具
sqlite3 data/pixiv-downloader.db

# 查询今天下载的文件
SELECT pixiv_id, type, title, file_path, downloaded_at 
FROM downloads 
WHERE date(downloaded_at) = date('now')
ORDER BY downloaded_at DESC;

# 查询昨天下载的文件
SELECT pixiv_id, type, title, file_path, downloaded_at 
FROM downloads 
WHERE date(downloaded_at) = date('now', '-1 day')
ORDER BY downloaded_at DESC;

# 查询最近10个下载的文件
SELECT pixiv_id, type, title, file_path, downloaded_at 
FROM downloads 
ORDER BY downloaded_at DESC 
LIMIT 10;
```

## 实用示例

### 示例1：找到刚刚下载的文件

```bash
# 查询最近5个下载的文件
curl "http://localhost:3000/api/files/recent?limit=5"
```

### 示例2：区分今天和昨天下载的文件

```bash
# 今天下载的文件
curl "http://localhost:3000/api/files/recent?filter=today" > today_downloads.json

# 昨天下载的文件
curl "http://localhost:3000/api/files/recent?filter=yesterday" > yesterday_downloads.json
```

### 示例3：使用 jq 处理 JSON 响应

```bash
# 只显示文件路径和下载时间
curl "http://localhost:3000/api/files/recent?filter=today" | \
  jq '.files[] | {filePath, downloadedAt, title}'

# 统计今天下载的文件数量
curl "http://localhost:3000/api/files/recent?filter=today" | \
  jq '.total'
```

## 注意事项

1. **文件可能已被移动或删除**：API 返回的 `exists` 字段会告诉你文件是否仍然存在
2. **路径格式**：`filePath` 是绝对路径，`relativePath` 是相对于下载目录的相对路径
3. **时区**：`downloadedAt` 使用 UTC 时间，需要根据你的时区进行转换
4. **性能**：查询大量文件时，建议使用 `limit` 参数限制返回数量

## 相关 API

- `GET /api/files/list` - 列出文件系统中的文件（带下载时间）
- `GET /api/files/recent` - 从数据库查询最近下载的文件
- `GET /api/stats/downloads` - 获取下载统计信息

