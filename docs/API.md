# API 文档 / API Documentation

本文档详细说明 PixivFlow 后端提供的所有 RESTful API 端点。

This document details all RESTful API endpoints provided by the PixivFlow backend.

---

## 下载管理 API / Download Management API

### 获取任务状态 / Get Task Status

获取当前任务状态和历史任务列表。

Get current task status and task history list.

**端点 / Endpoint:** `GET /api/download/status`

**查询参数 / Query Parameters:**
- `taskId` (可选 / optional): 指定任务 ID，获取单个任务状态

**响应示例 / Response Example:**
```json
{
  "data": {
    "activeTask": {
      "taskId": "task_1234567890",
      "status": "running",
      "startTime": "2025-11-16T06:00:00.000Z",
      "progress": {
        "current": 5,
        "total": 10,
        "message": "正在下载..."
      }
    },
    "allTasks": [
      {
        "taskId": "task_1234567890",
        "status": "completed",
        "startTime": "2025-11-16T06:00:00.000Z",
        "endTime": "2025-11-16T06:05:00.000Z"
      }
    ],
    "hasActiveTask": true
  }
}
```

**说明 / Notes:**
- 返回的任务列表包括内存中的当前任务和数据库中的历史任务
- 内存中的任务优先显示（更实时）
- 历史任务在服务器重启后仍然保留

- The returned task list includes both in-memory current tasks and historical tasks from database
- In-memory tasks take precedence (more real-time)
- Historical tasks persist after server restart

---

### 获取下载历史记录 / Get Download History

获取已下载作品的详细历史记录。

Get detailed history of downloaded artworks.

**端点 / Endpoint:** `GET /api/download/history`

**查询参数 / Query Parameters:**
- `page` (可选 / optional, 默认 / default: 1): 页码
- `limit` (可选 / optional, 默认 / default: 20): 每页数量
- `type` (可选 / optional): 筛选类型 (`illustration` 或 / or `novel`)
- `tag` (可选 / optional): 筛选标签
- `author` (可选 / optional): 筛选作者
- `startDate` (可选 / optional): 开始日期
- `endDate` (可选 / optional): 结束日期
- `sortBy` (可选 / optional): 排序字段 (`downloadedAt`, `title`, `author`, `pixivId`)
- `sortOrder` (可选 / optional): 排序顺序 (`asc` 或 / or `desc`)

**响应示例 / Response Example:**
```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "pixivId": "12345678",
        "type": "illustration",
        "tag": "tag1",
        "title": "作品标题",
        "filePath": "/path/to/file.jpg",
        "author": "作者名",
        "userId": "123456",
        "downloadedAt": "2025-11-16T06:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

---

### 删除任务历史记录 / Delete Task History

删除指定的任务历史记录。

Delete a specific task history record.

**端点 / Endpoint:** `DELETE /api/download/history/:taskId`

**路径参数 / Path Parameters:**
- `taskId`: 要删除的任务 ID

**响应示例 / Response Example:**
```json
{
  "data": {
    "success": true,
    "message": "Task history deleted successfully"
  }
}
```

**错误响应 / Error Response:**
```json
{
  "data": {
    "success": false,
    "errorCode": "DOWNLOAD_TASK_NOT_FOUND",
    "message": "Task history not found: task_1234567890"
  }
}
```

**使用示例 / Usage Example:**
```bash
curl -X DELETE http://localhost:3000/api/download/history/task_1234567890
```

---

### 删除所有任务历史记录 / Delete All Task History

删除所有任务历史记录。

Delete all task history records.

**端点 / Endpoint:** `DELETE /api/download/history`

**响应示例 / Response Example:**
```json
{
  "data": {
    "success": true,
    "deletedCount": 10,
    "message": "Successfully deleted 10 task history records"
  }
}
```

**使用示例 / Usage Example:**
```bash
curl -X DELETE http://localhost:3000/api/download/history
```

**警告 / Warning:**
- 此操作不可恢复
- 建议在执行前备份数据

- This operation cannot be undone
- It is recommended to backup data before execution

---

## 任务历史记录说明 / Task History Notes

### 持久化 / Persistence

- 任务历史记录存储在 SQLite 数据库中
- 服务器重启后历史记录仍然保留
- 默认保留最近 100 条任务历史记录

- Task history is stored in SQLite database
- History persists after server restart
- Default to keep the most recent 100 task history records

### 任务状态 / Task Status

任务可能的状态：
- `running`: 正在运行
- `completed`: 已完成
- `failed`: 失败
- `stopped`: 已停止

Possible task statuses:
- `running`: Currently running
- `completed`: Completed successfully
- `failed`: Failed
- `stopped`: Stopped by user

### 数据合并 / Data Merging

`GET /api/download/status` 返回的数据会合并：
1. 内存中的当前任务（实时状态）
2. 数据库中的历史任务（持久化记录）

内存中的任务优先显示，因为它们更实时。

`GET /api/download/status` returns merged data from:
1. In-memory current tasks (real-time status)
2. Database historical tasks (persistent records)

In-memory tasks take precedence as they are more real-time.

---

## 其他 API 端点 / Other API Endpoints

### 认证相关 / Authentication

- `GET /api/auth/status` - 获取认证状态
- `POST /api/auth/login` - 登录
- `POST /api/auth/logout` - 登出

- `GET /api/auth/status` - Get authentication status
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout

### 配置管理 / Configuration Management

- `GET /api/config` - 获取配置
- `PUT /api/config` - 更新配置
- `GET /api/config/backup` - 备份配置
- `POST /api/config/restore` - 恢复配置

- `GET /api/config` - Get configuration
- `PUT /api/config` - Update configuration
- `GET /api/config/backup` - Backup configuration
- `POST /api/config/restore` - Restore configuration

### 统计信息 / Statistics

- `GET /api/stats/overview` - 获取统计概览
- `GET /api/stats/downloads` - 获取下载统计
- `GET /api/stats/files` - 获取文件统计

- `GET /api/stats/overview` - Get statistics overview
- `GET /api/stats/downloads` - Get download statistics
- `GET /api/stats/files` - Get file statistics

### 文件管理 / File Management

- `GET /api/files` - 获取文件列表
- `GET /api/files/:id` - 获取文件详情
- `DELETE /api/files/:id` - 删除文件

- `GET /api/files` - Get file list
- `GET /api/files/:id` - Get file details
- `DELETE /api/files/:id` - Delete file

### 日志 / Logs

- `GET /api/logs` - 获取日志（WebSocket 实时流）

- `GET /api/logs` - Get logs (WebSocket real-time stream)

---

## 错误码 / Error Codes

常见错误码：
- `INVALID_REQUEST` - 无效请求
- `DOWNLOAD_TASK_NOT_FOUND` - 任务未找到
- `DOWNLOAD_HISTORY_FAILED` - 获取历史记录失败
- `DOWNLOAD_STATUS_FAILED` - 获取状态失败

Common error codes:
- `INVALID_REQUEST` - Invalid request
- `DOWNLOAD_TASK_NOT_FOUND` - Task not found
- `DOWNLOAD_HISTORY_FAILED` - Failed to get history
- `DOWNLOAD_STATUS_FAILED` - Failed to get status

---

## 健康检查 / Health Check

**端点 / Endpoint:** `GET /api/health`

**响应示例 / Response Example:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-16T06:00:00.000Z"
}
```

---

**最后更新 / Last Updated:** 2025-11-16

