# 配置参考

> **English:** Every configuration option explained: config file discovery
> and precedence, the `pixiv` credential block, all 20+ `targets` fields
> (search / ranking / single-ID modes), storage directory organization
> (12 modes), scheduler parameters, network and proxy settings, download
> performance tuning, environment variable overrides, and date placeholders.

一份配置文件决定 PixivFlow 收什么、存哪、什么时候跑。本文按配置块逐项说明;只想要能跑的最小配置,先看[快速开始](QUICKSTART.md)。

## 配置文件在哪

默认路径:`config/standalone.config.json`(仓库根目录下的 `config/`)。

实际查找顺序:

1. 命令行参数 `--config <path>`;
2. 环境变量 `PIXIV_DOWNLOADER_CONFIG`;
3. 自动检测:在配置目录中找到第一个可用配置文件;
4. 回退到默认路径。

多份配置可用 `pixivflow config` 管理(切换、备份、恢复)。
不想手写就跑交互式向导:

```bash
pixivflow setup
```

## 最小可用配置

登录命令会自动填好 `pixiv` 段,你只需要关心 `targets`:

```json
{
  "logLevel": "info",
  "scheduler": { "enabled": false },
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 20 }
  ]
}
```

带 `_` 前缀的键会被忽略,可以用作注释。

## pixiv 认证凭据

| 字段 | 说明 |
| --- | --- |
| `clientId` / `clientSecret` | Pixiv OAuth 应用凭据,默认值即官方 App 的公开值,一般不改 |
| `deviceToken` | 固定填 `"pixiv"` |
| `refreshToken` | 登录核心凭据,由 `login` / `refresh` 写入 |
| `userAgent` | API 请求 UA,保持默认即可 |

不要手工编造或粘贴别人的 refreshToken;获取方式见 [LOGIN](LOGIN.md)。

## targets 下载目标

数组,每项描述一类要收集的内容,条件之间是 AND 关系。

### 公共字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | 必填 | `illustration`(插画)或 `novel`(小说) |
| `limit` | number | 单次执行最多下载多少个 |
| `minBookmarks` | number | 最低收藏数门槛 |
| `startDate` / `endDate` | string | 发布日期范围 `YYYY-MM-DD`,支持占位符见[下文](#日期占位符) |

### 搜索模式字段(`mode: "search"`,默认)

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `tag` | string | 搜索标签;空格分隔多个标签 |
| `tagRelation` | `and` / `or` | 多标签时要求全部包含(默认)还是任一命中 |
| `searchTarget` | `partial_match_for_tags` / `exact_match_for_tags` / `title_and_caption` | 匹配方式 |
| `sort` | `date_desc` / `date_asc` / `popular_desc` | 结果排序 |
| `restrict` | `public` / `private` | 作品可见性范围 |
| `random` | boolean | 从结果中随机挑选一个下载 |

### 排行榜模式字段(`mode: "ranking"`)

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `rankingMode` | 见下 | 榜单类型 |
| `rankingDate` | `YYYY-MM-DD` | 榜单日期,缺省为今天,支持 `YESTERDAY` 占位符 |
| `filterTag` | string | 只保留含该标签的榜内作品 |

`rankingMode` 全部取值:`day`、`week`、`month`、`day_male`、
`day_female`、`day_ai`、`week_original`、`week_rookie`、`day_r18`、
`day_male_r18`、`day_female_r18`。

### 定向 ID 字段

指定后跳过搜索,精确下载:

| 字段 | 适用 | 说明 |
| --- | --- | --- |
| `illustId` | illustration | 单幅插画,如 URL `artworks/12345678` 中的数字 |
| `novelId` | novel | 单本小说,如 `novel/show.php?id=26132156` 中的 id |
| `seriesId` | novel | 整个小说系列,`novel/series/{id}` |
| `userId` | 两者 | 该用户的全部作品 |

这些字段与 URL 直链等价——不确定时直接用 [`--url`](USAGE.md#url-直链下载) 最省事。

### 小说专用字段

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `languageFilter` | `chinese` / `non-chinese` | 语言过滤;短于 50 字符的作品无法可靠判断,默认放行 |
| `detectLanguage` | boolean(默认 true) | 记录检测结果并写入元数据 |

## storage 存储与目录组织

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `databasePath` | `./data/pixiv-downloader.db` | SQLite 数据库位置 |
| `downloadDirectory` | `./downloads` | 下载根目录 |
| `illustrationDirectory` | `{根}/illustrations` | 插画目录,相对或绝对路径 |
| `novelDirectory` | `{根}/novels` | 小说目录 |
| `illustrationOrganization` / `novelOrganization` | `flat` | 目录组织方式,见下表 |

目录组织的 12 种模式:

| 模式 | 目录结构 |
| --- | --- |
| `flat` | 全部平铺在一个目录 |
| `byAuthor` | 按画师名 |
| `byTag` | 按首个标签 |
| `byDate` | 按作品创建月份 `YYYY-MM` |
| `byDay` | 按作品创建日 `YYYY-MM-DD` |
| `byDownloadDate` | 按下载月份 |
| `byDownloadDay` | 按下载日 |
| `byAuthorAndTag` | 画师 → 标签 两级 |
| `byDateAndAuthor` | 创建月 → 画师 |
| `byDayAndAuthor` | 创建日 → 画师 |
| `byDownloadDateAndAuthor` | 下载月 → 画师 |
| `byDownloadDayAndAuthor` | 下载日 → 画师 |

修改 `*_Organization` 后已存在的文件不会自动搬家,执行
`pixivflow normalize` 归位。

## scheduler 定时任务

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | false | 为 true 时裸命令 `pixivflow` 直接进入调度器 |
| `cron` | `0 3 * * *` | 标准 cron 表达式,常用见下表 |
| `timezone` | `Asia/Shanghai` | IANA 时区名 |
| `maxExecutions` | 不限 | 总执行次数上限,达到即退出(适合限量采集) |
| `minInterval` | 0(ms) | 两次执行的最小间隔,触发过密则跳过 |
| `timeout` | 不限 | 单次任务超时时间(ms),超时终止本次任务 |
| `maxConsecutiveFailures` | 不限 | 连续失败 N 次后停止调度器 |
| `failureRetryDelay` | 0(ms) | 失败后的等待间隔 |

常用 cron 写法:

| 表达式 | 含义 |
| --- | --- |
| `0 3 * * *` | 每天 03:00 |
| `0 */6 * * *` | 每 6 小时 |
| `30 21 * * *` | 每天 21:30 |
| `0 9 * * 1` | 每周一 09:00 |

## network 网络与代理

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `timeoutMs` | 30000 | API 请求超时(ms) |
| `retries` | 3 | 失败重试次数 |
| `retryDelay` | 1000 | 重试间隔(ms) |

代理:`network.proxy` 完整字段为 `enabled / host / port / protocol(http·https·socks4·socks5) / username / password`。

环境变量注入规则(容器部署常用):设置 `ALL_PROXY` / `all_proxy` >
`HTTPS_PROXY` > `HTTP_PROXY`(取第一个非空值)且配置未显式启用代理时,
程序自动解析并启用该代理,支持 http 与 socks 协议。详见
[DOCKER · 环境变量](DOCKER.md#环境变量参考)。

## download 性能与稳定性调优

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `concurrency` | 3 | 并发下载数 |
| `requestDelay` | 500 | 相邻 API 请求最小间隔(ms),防限流 |
| `dynamicConcurrency` | true | 触发限流时自动降低并发 |
| `minConcurrency` | 1 | 动态调整的下限 |
| `maxRetries` | 3 | 单文件最大重试次数 |
| `retryDelay` | 2000 | 文件级重试间隔(ms) |
| `timeout` | 60000 | 单文件下载超时(ms) |

调大并发不一定会更快——Pixiv 服务端限流很敏感,遇到大量
429 时优先增大 `requestDelay` 而不是堆并发。

## 其他顶层字段

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `logLevel` | `info` | `debug` / `info` / `warn` / `error` |
| `initialDelay` | 0 | 启动后的延迟(ms),调试用 |

## 环境变量覆盖

同名环境变量会覆盖配置文件的对应字段,优先级高于 JSON:

| 变量 | 覆盖的目标 |
| --- | --- |
| `PIXIV_REFRESH_TOKEN` | `pixiv.refreshToken` |
| `PIXIV_CLIENT_ID` / `PIXIV_CLIENT_SECRET` | OAuth 凭据 |
| `PIXIV_DOWNLOAD_DIR` | `storage.downloadDirectory` |
| `PIXIV_DATABASE_PATH` | `storage.databasePath` |
| `PIXIV_ILLUSTRATION_DIR` / `PIXIV_NOVEL_DIR` | 类型子目录 |
| `PIXIV_LOG_LEVEL` | `logLevel` |
| `PIXIV_SCHEDULER_ENABLED` | `scheduler.enabled`(`true`/`false`) |
| `PIXIV_DOWNLOADER_CONFIG` | 直接指定配置文件路径 |

Docker 部署正是基于这套机制,完整对照见 [DOCKER](DOCKER.md)。

## 日期占位符

`startDate`、`endDate`、`rankingDate` 三个字段支持两个占位符,
执行时替换为当天日期:

- `YESTERDAY` — 昨天(每天定时收昨天新作的推荐写法);
- `TODAY` — 今天。

配合 scheduler 使用:「昨天的日榜」这类目标无需每日改配置。

---

## 相关文档

- [USAGE](USAGE.md) — 各下载模式的整体用法与示例
- [LOGIN](LOGIN.md) — refreshToken 从哪里来
- [DOCKER](DOCKER.md) — 环境变量与容器的对应关系
- [../config/examples/](../config/examples/) — 官方示例配置合集
