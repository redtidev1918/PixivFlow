# 使用指南

## 基础命令

支持全局 CLI (`pixivflow`) 或源码脚本 (`npm run`)。

### 立即下载

执行配置文件中定义的所有任务：
```bash
pixivflow download
```

### URL 下载
无需修改配置，直接下载指定资源：

```bash
# 插画
pixivflow download --url "https://www.pixiv.net/artworks/12345678"

# 小说
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=26132156"

# 画师全集 (默认下载插画，上限 30)
pixivflow download --url "https://www.pixiv.net/users/123456"
```

### 随机下载
随机下载一张推荐作品（用于测试或发现）：

```bash
pixivflow random          # 插画
pixivflow random --novel  # 小说
```

### 定时任务
启动调度器，按 Cron 表达式自动运行：

```bash
pixivflow scheduler
```

---

## 进阶功能

### 搜索技巧

- **多标签**: 
  - `and` (默认): 同时包含 `A` 和 `B`。
  - `or`: 包含 `A` 或 `B`。
- **排序**: `popular_desc` (热门), `date_desc` (最新)。
- **筛选**: 
  - `minBookmarks`: 最小收藏数。
  - `startDate`/`endDate`: 日期范围。

### 文件管理

查看当前存储路径：
```bash
pixivflow dirs
```

修改存储路径：
```bash
pixivflow config set storage.downloadDirectory /path/to/downloads
```

### 并发与流控

默认配置已自动处理限流 (429)。如遇频繁失败，可调整 `config/standalone.config.json`：

```json
{
  "download": {
    "concurrency": 1,        // 降低并发
    "requestDelay": 1500,    // 增加间隔
    "dynamicConcurrency": true
  }
}
```

---

## 服务器部署

### PM2 (推荐)

```bash
npm install -g pm2
pm2 start "pixivflow scheduler" --name pixivflow
pm2 save
pm2 startup
```

### Systemd

创建 `/etc/systemd/system/pixivflow.service`:

```ini
[Unit]
Description=PixivFlow Downloader
After=network.target

[Service]
Type=simple
User=your-user
ExecStart=/usr/bin/pixivflow scheduler
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now pixivflow
```

---

## 常见问题

**Q: 找不到匹配作品？**
A: 检查标签拼写，或降低 `minBookmarks` 门槛。

**Q: 下载速度慢？**
A: Pixiv 图片服务器在海外，建议配置代理 (`network.proxy`)。

**Q: 遇到已删除/私有作品？**
A: 程序会自动跳过并记录，属正常现象。
