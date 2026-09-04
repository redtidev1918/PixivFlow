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
| `id` | string | 多计划引用的稳定唯一 id；仅可用字母、数字、`_`、`-`，最长 64 字符 |
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
| `rankingDate` | `YYYY-MM-DD` | 日期,缺省为今天,支持 `YESTERDAY` 占位符 |
| `filterTag` | string | 可选；设置后搜索该日期发布的 tag 作品，并按收藏/浏览热度在本地排序 |

`rankingMode` 全部取值:`day`、`week`、`month`、`day_male`、
`day_female`、`day_ai`、`week_original`、`week_rookie`、`day_r18`、
`day_male_r18`、`day_female_r18`。

未设置 `filterTag` 时会调用 Pixiv 榜单 API，`rankingDate` 表示榜单日期。设置
`filterTag` 时，为了得到“指定 tag 在昨天发布的最热作品”，会用 `rankingDate`
作为单日发布窗口抓取候选，再按热度排序；此时 `rankingMode` 不参与查询。

### 主题模式字段(`mode: "topic"`)

语义主题下载。与 `tag`（精确匹配某个 Pixiv Tag）不同，`topic` 只表达“我要这个主题的作品”，PixivFlow 会自动推导出相关检索空间，你不需要事先研究和维护相关 Tag 表。

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `topic` | string | **必填**。主题词（如 `ボテ腹`），运行时自动扩展为相关 Tag |
| `date` | `YESTERDAY` / `TODAY` / `YYYY-MM-DD` | 单日发布窗口，运行时动态解析；缺省为 `YESTERDAY` |
| `limit` | number | 该主题每天下载 Top N（插画/小说分别配置） |
| `excludeAI` | boolean（默认 false） | 插画目标排除 Pixiv 明确标记为 AI 生成的作品；缺失/未知标记不误杀 |
| `topicDiscovery` | object | 可选高级覆盖，见下，均有默认值 |
| `candidateCollection` | object | 可选高级覆盖，见下 |

`topicDiscovery`：`maxTags`(默认 12)、`sampleWorks`(默认 100)、`cacheDays`(默认 7)、`minScore`(默认 0.22)、`refresh`(默认 false)、`includeR18`(默认 false，设为 `true` 时采样与采集均包含 R-18 作品——Pixiv 插画搜索默认会被 `filter=for_ios` 过滤掉 R-18；小说搜索本来就包含)。
`candidateCollection`：`maxPerTag`(默认 40)、`maxCandidates`(默认 250)、`minMetadataScore`(默认 0.35)。

工作流：Topic →（Pixiv 标签联想 + 近期作品 Tag 共现，PMI 式特异性打分自动压低 R-18/オリジナル 等通用 Tag）→ 相关 Tag 空间 → 分别搜索当天作品 → PID 去重 → 仅用 Tag/标题/描述做轻量相关性过滤（**只作接受门槛**，过 `minMetadataScore` 即视为属于主题）→ 通过的候选之间**完全按本地热度 `calculatePopularityScore()` 排名** → 从有界热度候选池剔除下载历史 → 依次递补至 Top N。插画与小说使用各自独立的 Tag 空间，结果缓存到数据卷 `topic-cache/`（默认 7 天），刷新失败自动降级到旧缓存或仅用主题词本身，不中断调度。同一发布日期重复执行时，已经投稿的第一名不会让任务空跑；`limit=1` 默认保留 20 个插画候选，常规递补池上限 100（用户显式配置更大的 `limit` 时仍会尊重该数量），再由下载计划批量去重。**全程不使用任何 LLM/VLM/Embedding/本地模型。**

能力边界：如果某作品没有任何与主题相关的 Tag/标题/描述（视觉上相关但元数据无关），在不使用视觉模型的前提下无法识别，这是设计取舍而非 Bug。

每日北京时间 10:00 下载昨天“ボテ腹”主题最热非 AI 插画 1 部、中文小说 1 部：

```json
{
  "targets": [
    { "id": "bote-illust", "type": "illustration", "mode": "topic", "topic": "ボテ腹", "date": "YESTERDAY", "limit": 1, "excludeAI": true },
    { "id": "bote-novel",  "type": "novel",       "mode": "topic", "topic": "ボテ腹", "date": "YESTERDAY", "limit": 1,
      "languageFilter": "chinese", "languageCandidateLimit": 20, "strictLanguageFilter": true }
  ],
  "schedules": [
    { "id": "bote-daily", "enabled": true, "cron": "0 10 * * *", "timezone": "Asia/Shanghai",
      "targetIds": ["bote-illust", "bote-novel"] }
  ]
}
```

可用 `pixivflow topic resolve "ボテ腹"` 查看推导出的 Tag 空间，用 `pixivflow topic test "ボテ腹" --date YESTERDAY` dry-run 预览（不下载）。

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
| `languageFilter` | `chinese` / `non-chinese` | 根据完整正文过滤小说语言 |
| `languageCandidateLimit` | 1–100（默认 20） | 按热度依次检测的候选上限；例如 Top 1 不是中文时继续检查下一部，直到补足 `limit` |
| `strictLanguageFilter` | boolean（默认 false） | true 时拒绝正文过短等无法可靠判断语言的小说；要保证“只收中文”时应开启 |
| `noMatchPolicy.lookbackDays` | 0–7（默认 0） | 当天没有目标语言小说时，按日期逐日向前回看；主题和语言条件不会被静默放宽 |
| `noMatchPolicy.notify` | boolean（默认 false） | 最终仍无结果时，通过交付目标的 `notificationUrl` 通知审核群；通知会持久入 outbox 并指数退避重试 |
| `detectLanguage` | boolean(默认 true) | 记录检测结果并写入元数据 |

`mode: "topic"` 会先按热度取 `languageCandidateLimit` 个小说候选，再串行检测完整正文并在达到 `limit` 后停止；这样既保证热度顺序，也避免并发检查造成超额投稿。对“最热 1 部中文小说”的低带宽部署，推荐 `limit: 1`、`languageCandidateLimit: 20`、`strictLanguageFilter: true`。需要“尽量补足且不静默”时，可再设置 `noMatchPolicy: { "lookbackDays": 3, "notify": true }`；它最多检查昨天及之前 3 天，不会退化为日文或无关主题。

#### 操作通知（投递结果通知审核群）

交付目标配置了 `notificationUrl` 后，PixivFlow 可向审核群发送三类运维通知，都写入
delivery outbox 持久化、幂等去重、指数退避重试：

| 触发条件 | 消息 | 说明 |
| --- | --- | --- |
| 候选耗尽（无匹配） | `⚠️ PixivFlow 本次没有可投稿内容` | 受 `noMatchPolicy.notify: true` 控制；需目标自身开启该开关。 |
| **下载硬失败** | `❌ PixivFlow 本次下载失败` | 目标投递过程中发生硬错误（超长标题写入 `ENAMETOOLONG`、网络/权限错误等，导致该目标整条失败）。无需额外开关——只要目标配置了 `delivery.target`（存在通知通道）即发送；无通知端点的目标由投递校验拦下并仅记警告。插画与小说目标均生效。 |
| **计划失败或超时** | `⚠️ PixivFlow 定时任务失败/超时` | 通知该计划涉及的审核群，包含连续失败次数；达到 `maxConsecutiveFailures` 时明确提示计划已自动停止。 |

硬失败消息含目标名称与错误摘要（错误超 200 字符自动截断），并提示可点「🔄 重抓/换一张」
重试或等待下次定时任务。这样即便是静默的下载错误，审核员也能第一时间得知，而不必翻日志。

### target 存储与交付模式

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `storageMode` | `persistent` / `cache` | 默认 `persistent`;`cache` 交付成功后删除本地文件 |
| `delivery.target` | string | 顶层 `delivery.targets` 中的目标名称，cache 模式必填 |
| `delivery.fields` | object | 当前 target 的表单字段覆盖 |

`cache` 模式使用通用命名交付目标。当前内置 provider 是流式
`httpMultipart`，下面的地址和字段仅为示例：

```json
{
  "delivery": {
    "outboxRetryBaseMs": 300000,
    "outboxRetryMaxMs": 21600000,
    "targets": {
      "my-api": {
        "type": "httpMultipart",
        "url": "https://example.test/submissions",
        "notificationUrl": "https://example.test/notifications",
        "method": "POST",
        "headers": { "Authorization": "Bearer ${MY_API_TOKEN}" },
        "fileField": "files",
        "fields": { "title": "{{title}}", "source_id": "{{pixivId}}" },
        "arrayFormat": "comma",
        "success": { "statuses": [201], "jsonPath": "ok", "equals": true },
        "maxAttempts": 3,
        "retryDelayMs": 2000
      }
    }
  }
}
```

字段值支持 `{{title}}`、`{{pixivId}}`、`{{type}}`、`{{tag}}`、`{{topic}}`、
`{{workTags}}`、`{{link}}`、`{{topicTag}}`、`{{spoiler}}`、`{{xRestrict}}`、
`{{xRestrictLabel}}`、`{{xRestrictTag}}`、`{{rankingDate}}`、`{{publishedDate}}`、
`{{language}}`、`{{bookmarkCount}}`、`{{viewCount}}`
模板。`{{bookmarkCount}}`/`{{viewCount}}` 是作品收藏数/浏览数（Pixiv
`total_bookmarks`/`total_view`），大数字紧凑渲染（`1.2k`、`34.6w`），接口
未返回时为空串，可写进简介作为热门依据。`{{xRestrict}}` 保留 Pixiv 原始整数（0=全年龄、1=R-18、2=R-18G）；
`{{xRestrictLabel}}` 输出 `all-ages` / `R-18` / `R-18G`，`{{xRestrictTag}}`
输出适合 Telegram 标签的 `AllAges` / `R18` / `R18G`。这三者与
`{{spoiler}}` 独立，下游可以按频道策略决定是否加遮罩。`{{tag}}` 是统一的目标标签：普通搜索使用 `tag`、标签排行
使用 `filterTag`、语义主题模式使用 `topic`；`{{workTags}}` 是作品自身的 Pixiv
标签，以逗号连接。需要同时投稿来源、计划主题和作品标签时可配置
`"tags": ["Pixiv", "{{tag}}", "{{workTags}}"]`。headers
和 URL 支持 `${ENV_NAME}`。`arrayFormat` 可设 `comma`、`repeat` 或 `json`。

#### Telegraph（telegra.ph）相册上传

把下载的插画自动发布到 [Telegra.ph](https://telegra.ph) 相册页时，可搭配
[telepress](https://github.com/redtidev1918/telepress) 的 REST 服务：
telepress 负责把收到的图片打包、上传并生成带「上一页/下一页」导航的相册页，
PixivFlow 侧无需任何代码改动，只增加一个 `httpMultipart` 目标即可。

先启动 telepress 服务（任选一台机器，与 PixivFlow 同机时用内网地址）：

```bash
pip install "telepress[api]"
telepress-server --host 0.0.0.0 --port 8000
```

然后在 `delivery.targets` 中增加目标：

```json
{
  "delivery": {
    "targets": {
      "telegraph": {
        "type": "httpMultipart",
        "url": "http://127.0.0.1:8000/publish/gallery",
        "fileField": "files",
        "fields": {
          "title": "{{title}}",
          "tags": "{{workTags}}",
          "link": "{{link}}",
          "spoiler": "{{spoiler}}"
        },
        "success": { "statuses": [200], "jsonPath": "ok", "equals": true },
        "maxAttempts": 3,
        "retryDelayMs": 2000
      }
    }
  }
}
```

`title` 作为相册页标题；`tags` 会把作品 Pixiv 标签渲染成 `#标签` 页脚；
`link` 生成指向原作品的来源链接；R-18 作品（`{{spoiler}}` 为 `true`）会在
首页附加成人内容提示。telepress 对单张图片自动压缩到 5 MiB 以内、按 100 张
一页自动分页，返回 `{"ok": true, "url": "...", "files": N}`，因此
`success` 判定 `ok == true`。注意 telepress 相册要求图片文件，小说正文请走
TelePost 等其他渠道。

交付前会把任务写入数据库同目录的 `delivery-outbox/`。作品投递失败不会删除下载文件；
无候选通知也先写入该 outbox，不需要依赖当前进程的内存状态。
下次 `download` 或 scheduler 执行时先检查待投递项。`outboxRetryBaseMs` 默认
`300000`（5 分钟），`outboxRetryMaxMs` 默认 `21600000`（6 小时），失败后指数退避，
避免远端故障时反复消耗带宽。成功后才删除作品文件、元数据 sidecar 和 outbox
清单。`delivery.deleteAfterDelivery: false` 可用于调试时保留文件。

## storage 存储与目录组织

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `databasePath` | `./data/pixiv-downloader.db` | SQLite 数据库位置 |
| `downloadDirectory` | `./downloads` | 下载根目录 |
| `illustrationDirectory` | `{根}/illustrations` | 插画目录,相对或绝对路径 |
| `novelDirectory` | `{根}/novels` | 小说目录 |
| `illustrationOrganization` / `novelOrganization` | `flat` | 目录组织方式,见下表 |
| `cacheRetentionDays` | `14` | `maintain` 清理多少天前的下载缓存；`0` 关闭按时间清理 |
| `cacheMaxSizeMB` | `0` | 下载缓存容量硬上限（MiB）；超限时按完整作品从旧到新清理，`0` 关闭 |

`cacheRetentionDays` 与 `cacheMaxSizeMB` 可同时使用：维护任务先清理过期作品，再在
仍超出容量时淘汰最旧的完整作品。容量清理不会触碰 `delivery-outbox`，因此远端暂时
不可用时的待投递文件仍会保留。1 GiB Fly 卷建议设置 `cacheMaxSizeMB: 384`，为数据库、
审核数据与失败重试预留空间。

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

### 单计划兼容格式

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

计划失败或超时时，只要对应 target 的交付目标配置了 `notificationUrl`，审核群就会收到
持久化运维通知；达到 `maxConsecutiveFailures` 自动停止时会在同一条消息中明确说明。

### 多计划格式

顶层 `schedules[]` 存在时取代旧 `scheduler.cron`。每项继承上表全部运行限制，
并增加：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 计划唯一 id，同时用于日志与独立失败/执行计数 |
| `name` | 否 | 便于辨认的显示名称 |
| `targetIds` | 否 | 本次运行的 target id；省略或空数组代表全部 target |

所有计划仍在一个 PixivFlow 进程内，共享认证、数据库和文件服务。计划同时触发时
进入全局串行队列；同一计划最多保留一个待执行实例，防止故障期间形成无限积压。
建议在 512 MiB 环境把 Cron 错开，并设置 `download.concurrency: 1`。

```json
{
  "schedules": [
    { "id": "bot1", "enabled": true, "cron": "10 5 * * *", "timezone": "Asia/Shanghai", "targetIds": ["bot1-art", "bot1-novel"] },
    { "id": "bot2", "enabled": true, "cron": "30 5 * * *", "timezone": "Asia/Shanghai", "targetIds": ["bot2-art", "bot2-novel"] }
  ]
}
```

`schedulerRuntime` 控制常驻调度器：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `watchConfig` | true | 监听当前配置文件并自动热重载 |
| `reloadDebounceMs` | 500 | 文件替换后的去抖时间，最小 100ms |
| `queueLimit` | 8 | 全局待执行计划上限；同一计划仍只保留一项 |

热重载流程为“读入新快照 → 默认值/路径处理 → 完整校验 → 整表替换”。失败时旧计划
继续运行。正在执行的任务不会被中断；`YESTERDAY` / `TODAY` 在每次真正执行前
重新计算。可热更新 `schedules`、`targets`、`delivery`、`download`；修改
`pixiv`、`network`、`storage` 后应重启进程。除文件监听外也可发送 `SIGHUP`：

```bash
kill -HUP <pixivflow-pid>
```

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
[DOCKER · 环境变量](DOCKER.md#环境变量参考)。健康检查的连通性探测与登录令牌刷新(2.2.1 起)同样遵循该代理。

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
