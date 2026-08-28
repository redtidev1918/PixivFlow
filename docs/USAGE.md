# 功能与命令

> **English:** Complete usage reference. Six download modes (URL direct
> download, config-driven search, ranking mode, random, single ID, whole
> user), the ten supported Pixiv URL formats, dedup and resume behavior,
> scheduler semantics, a WebUI overview, and a cheat sheet of all 20 CLI
> commands grouped by category.

PixivFlow 的一切下载行为都由「命令 + 配置」驱动。本章讲清楚每种能力的用法与边界,配置字段细节见 [CONFIG](CONFIG.md)。

## 六种下载模式

| 模式 | 用法 | 一句话说明 |
| --- | --- | --- |
| URL 直链 | `download --url <链接>` | 粘贴即下,自动识别作品类型 |
| 标签搜索 | targets 配置 `mode: "search"`(默认) | 按标签 + 筛选条件批量收集 |
| 排行榜 | targets 配置 `mode: "ranking"` | 从日/周/月榜抓取再按条件过滤 |
| 随机下载 | `random` 命令或 target `random: true` | 从结果中随机挑选,保持惊喜感 |
| 单作品 | URL / `illustId` / `novelId` | 精确下载一幅插画或一本小说 |
| 用户全量 | 用户主页 URL / `userId` | 收取某位用户全部插画或小说 |

## URL 直链下载

`--url` 会覆盖配置文件中的 targets,只下载这一个目标:

```bash
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
```

支持全部 10 种地址形态:

| 格式 | 示例 |
| --- | --- |
| 插画页(标准) | `https://www.pixiv.net/artworks/{id}` |
| 带语言前缀 | `https://www.pixiv.net/en/artworks/{id}` |
| 短链 | `https://www.pixiv.net/i/{id}` |
| 旧版插画页 | `https://www.pixiv.net/member_illust.php?illust_id={id}` |
| 小说 | `https://www.pixiv.net/novel/show.php?id={id}` |
| 小说系列 | `https://www.pixiv.net/novel/series/{id}` |
| 用户主页 | `https://www.pixiv.net/users/{id}` |
| 用户的插画 | `https://www.pixiv.net/users/{uid}/artworks/{id}` |
| 用户的小说 | `https://www.pixiv.net/users/{uid}/novels/{id}` |
| 裸 ID | `123456789`(按插画处理) |

也可以不写入配置文件,临时用 JSON 表达一个目标:

```bash
pixivflow download --targets '[{"type":"novel","tag":"アークナイツ","limit":5}]'
```

## 标签搜索模式

默认模式。核心字段只有四个:

```json
{
  "type": "illustration",
  "tag": "風景",
  "limit": 20,
  "minBookmarks": 500
}
```

进阶能力:

- **多标签组合**:`"tag": "水彩 厚涂"`,配合 `"tagRelation": "or"`
  表示任一命中即可(默认 AND,要求同时含全部标签);
- **排序**:`sort` 取 `date_desc` / `date_asc` / `popular_desc`;
- **匹配方式**:`searchTarget` 取 `partial_match_for_tags` /
  `exact_match_for_tags` / `title_and_caption`;
- **日期窗口**:`startDate` / `endDate`,支持 `YESTERDAY`、`TODAY`
  占位符——每天定时执行时自动滚动到「昨天」;
- **小说语言过滤**:`languageFilter: "chinese"` 只收中文小说,
  `non-chinese` 反之;不足 50 字符、无法可靠判断的作品默认放行。

## 排行榜模式

`mode: "ranking"` 时先拉榜单、再按条件过滤:

```json
{
  "type": "illustration",
  "mode": "ranking",
  "rankingMode": "day",
  "rankingDate": "YESTERDAY",
  "filterTag": "風景",
  "limit": 10
}
```

`rankingMode` 支持 day / week / month / day_male / day_female / day_ai /
week_original / week_rookie 及对应 R18 榜单,完整取值见
[CONFIG · targets](CONFIG.md#targets-下载目标)。

## 去重与断点

每幅作品的下载记录写入 SQLite(默认 `./data/pixiv-downloader.db`):

- 已有记录的作品直接跳过,重复执行安全;
- 文件存在但缺记录时自动对账补录,删库不毁文件;
- 中断后再次执行从断点继续,不会整批重来。

整理已有文件用 `normalize`:按当前目录组织规则把文件归位。

## 定时任务

```bash
pixivflow scheduler
```

行为要点:

- cron 默认 `0 3 * * *`,时区 `Asia/Shanghai`;
- `maxExecutions` 限制总执行次数,`minInterval` 避免触发过密;
- 单次任务可设 `timeout` 超时;`maxConsecutiveFailures` 连续失败达到阈值即停止,`failureRetryDelay` 控制失败后的重试间隔;
- 直接运行 `pixivflow` 不带子命令时:配置中 `scheduler.enabled` 为 true
  则等价于启动 scheduler,否则执行一次 download。

服务器长期运行建议交给 [Docker Compose](DOCKER.md) 管理。

## WebUI

```bash
pixivflow webui     # 监听 3000 端口,浏览器打开 http://localhost:3000
```

提供仪表盘统计、下载任务管理、URL 下载、文件浏览预览、历史记录、实时日志和配置编辑。REST 与 WebSocket 接口细节见 [API](API.md),前端源码在独立仓库 [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui)。Docker 场景直接启用 compose 中的 `pixivflow-webui` 服务即可。

交互组件地图与实时链路说明见前端仓库的 [开发指南](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/DEVELOPMENT_GUIDE.md) 与 [组件目录](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/COMPONENT_GUIDE.md)。

## 全部命令速查

共 20 个命令,分类与 `pixivflow help` 输出一致:

### 认证

| 命令 | 说明 |
| --- | --- |
| `login [-u -p]` | 交互式登录(浏览器授权,也可带账号参数) |
| `login-headless -u -p` | 无图形界面环境登录;`--password-stdin` 可让密码经 stdin 传入 |
| `refresh <token>` | 注入已有 refresh token(别名 login-token / set-token);传 `-` 改从 stdin 读取 |

### 下载

| 命令 | 说明 |
| --- | --- |
| `download [--url \| --targets \| --config]` | 执行一次下载(别名 d) |
| `random` | 从热门标签随机下载一张 |
| `scheduler` | 启动定时任务常驻进程 |

### 配置

| 命令 | 说明 |
| --- | --- |
| `config` | 查看 / 编辑 / 备份 / 恢复配置 |
| `setup` | 交互式配置向导,首次使用推荐 |
| `migrate-config` | 迁移旧版配置路径(绝对路径转相对) |

### 监控与状态

| 命令 | 说明 |
| --- | --- |
| `status` | 下载统计与最近记录 |
| `health` | 健康检查:配置、目录可写性、连通性 |
| `logs` | 查看最近日志 |
| `monitor` | 实时监控进程状态与性能指标 |

### 维护

| 命令 | 说明 |
| --- | --- |
| `backup` | 自动备份配置与数据 |
| `maintain` | 自动维护:清理日志、优化数据库等 |
| `normalize` | 归一化整理已下载文件的目录结构 |
| `dirs` | 显示各类文件的实际保存位置 |

### 工具

| 命令 | 说明 |
| --- | --- |
| `help [command]` | 总帮助或单命令帮助 |
| `version` | 显示版本号 |
| `webui` | 启动 WebUI 服务器 |

---

## 相关文档

- [CONFIG](CONFIG.md) — 每个 target 字段的详细语义
- [API](API.md) — WebUI 后端接口参考
- [DOCKER](DOCKER.md) — 让 scheduler 和 WebUI 在服务器上长期运行
- [SCRIPTS](SCRIPTS.md) — scripts/ 目录的辅助脚本
