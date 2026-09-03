# 📝 更新日志

所有重要的项目变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [2.10.27] - 2026-09-03

### 修复
- 🐛 **中文小说被语言过滤误伤**：franc-min 对"中日混合"文本（Pixiv 中文小说正文
  常混入日文标签/角色名/拟声词）会把中文误判为日文，导致 `languageFilter: chinese`
  的目标在数十个候选里一篇中文都不投递。新增 `refineFrancCode`——用 Unicode 假名
  字符（ひらがな/カタカナ）占比做二次校验：franc 判 `jpn` 但假名占 CJK <10% 且
  汉字 >20% 时修正为 `cmn`（中文）；真日文（假名占比高）与英/韩等不受影响。
- 🧪 新增 `language-detection.test.ts`（假名修正 3 例）；559 项测试全过。

## [2.10.26] - 2026-09-02

### 新增 · 自我修复（self-healing）
- 🔁 **漏跑补跑**：守护进程启动时检查每个计划——若其最近一次执行早于某个已错过的
  cron 触发点（守护进程下线/崩溃/部署窗口），立即补跑一轮，不再静默丢档；
  只补跑一次且记录执行（重启不会重复触发），全新计划不回填，热重载不触发。
  由 `scheduler_executions` 表驱动，用 cron-parser 精确计算（新增依赖
  `cron-parser@4.9.0`，自带类型）。
- ⏱️ **卡死看门狗**：未显式配置 `timeout` 的计划自动获得 30 分钟上限
  （`DEFAULT_SCHEDULE_TIMEOUT_MS`），卡死的下载运行会被中止并释放共享队列；
  `run-once`（重抓）同样为每个计划套看门狗，超时中止并报错退出，
  杜绝子进程无限挂起。
- 🩺 **数据库启动完整性自检**：守护进程与 `run-once` 启动时对 pixivflow.db 执行
  `PRAGMA quick_check`；结构损坏时自动把损坏文件（含 -wal/-shm）隔离为
  `.corrupt-<时间戳>` 并重建空库，随后向各审核群发送恢复通知（每日幂等）。
  迁移/schema 类错误不会被误判为损坏。

### 清理（审计驱动）
- 移除运行时路径死代码：`handleDownloadResult` 未用的 `displayTag` 参数、
  `DownloadManager` 构造后从未读取的 `client`/`database` 属性、从未调用的
  `requestDelayMs()`、`IllustrationDownloader` 未用的 `tags` 析构、
  webui 中未使用的 import（`express`/`readFileSync`/`isPlaceholderToken`/
  `watchFile`/`unwatchFile`）等；公共 API 参数与界面签名保留不动。
- 新增测试：漏跑补跑 3 例、看门狗 3 例、数据库自检/隔离 2 例。

## [2.10.25] - 2026-09-02

### 新增
- 🆕 **一次性命令 `pixivflow run-once`**（别名 `refetch` / `now`）：加载配置后
  把所有**启用的调度计划各跑一轮**（与定时任务完全相同的下载/去重/投递路径），
  完成后即退出。这是审核群「🔄 重抓/换一张」按钮的后端——此前 TelePost 调用
  `pixivflow scheduler run`，而那是调度**守护进程**的别名（`longRunning`，
  永不退出），导致重抓子进程必然 1500 秒超时。守护进程本身行为不变，
  `scheduler` 仅保留别名 `s`（`run` 别名移除，避免误启守护进程）。

### 重构
- 抽出 `src/commands/scheduler-runtime.ts` 共享运行时：守护进程与 `run-once`
  共用同一套配置解析、token 维护、目标选择与下载执行逻辑，杜绝行为分叉。
- 新增 `run-once` 命令测试（正常运行、无启用计划、失败传播、注册/别名）。

## [2.10.24] - 2026-09-01

### 新增
- 🔔 **下载硬失败通知审核群**：目标在投递过程中发生硬失败（如超长标题写入
  `ENAMETOOLONG`、网络/权限错误等导致该目标整条失败）时，现在会通过交付目标的
  `notificationUrl` 向审核群发送"❌ 下载失败"通知（含目标与错误摘要，错误超长时
  截断），并持久化进 outbox 幂等重试。此前只有"候选耗尽"（无匹配）会通知，
  下载硬失败是静默的，审核员只能靠日志发现。门控：目标已配置
  `delivery.target`（即存在通知通道）即发送；无通知端点的目标由投递校验拦下并
  仅记警告。插画与小说目标均生效。
- 🧪 新增硬失败通知测试（有投递目的地才发送、无投递目的地不发送）。

## [2.10.23] - 2026-09-01

### 修复
- 🐛 **超长标题小说下载失败（ENAMETOOLONG）**：`sanitizeFileName` 此前只替换
  非法字符、不限制长度。当某天热榜选中标题为中文长句的小说（如
  29012719，标题约 110 个 CJK 字符）时，文件名超过 Linux 单文件名 255 字节
  上限，导致缓存写入 `ENAMETOOLONG`，整条目标硬失败（随后该目标不会触发"无
  匹配"通知）。现按 **UTF-8 字节数**截断到 230 字节（保留扩展名与 pixiv id 前缀，
  逐码点截断不切断多字节字符），并为 `findUniquePath` 的 ` (n)` 后缀留余量。
- 🧪 新增 4 项 `sanitizeFileName` 测试（短名不变、非法字符替换、超长截断、多
  字节完整性）。

## [2.10.22] - 2026-09-01

### 维护
- 🧹 删除一批未使用的导入（`path`、`ConfigManager`、`createTopicPipeline`、
  `saveTokenToStorage`、`NetworkError`、`delay`、`LoginInfo` 等），零行为变化，
  `tsc` 与 538 项测试全绿。
- 📝 文档：CONFIG.md 的投递模板变量列表补全 `{{bookmarkCount}}`/`{{viewCount}}`
  （收藏/浏览热度）以及此前遗漏的 `{{link}}`/`{{topicTag}}`/`{{rankingDate}}`/
  `{{publishedDate}}`/`{{language}}`。

## [2.10.21] - 2026-09-01

### 修复
- 📦 使用 npm 10 重建锁文件，使 Node.js 22 默认 npm 的 `npm ci`
  与 Node.js 24 / npm 11 得到相同依赖树；修复 2.10.20 首次远端测试暴露的锁文件缺项。

### 维护
- 🧹 删除重复的 GitHub Pages 工作流；文档变更现在只构建、部署一次。

## [2.10.20] - 2026-09-01

### 安全与维护
- 🔐 生产运行时基线升级到 Node.js 22.12+，Docker 改用 Node.js 24 LTS，
  CI 覆盖 Node.js 22 / 24，停止依赖已结束安全维护的 Node.js 18 / 20。
- 📦 升级 `pixiv-token-getter` 2.2.1 与 `node-cron` 4.6，
  `npm audit --omit=dev` 从 7 项降为 0 项。

### 文档
- 📚 README、快速开始、Docker、Termux 与静态站点统一标注当前运行时要求。

## [2.10.19] - 2026-09-01

### 改进
- 📨 **通知持久化**：最终无候选通知现在与作品投递共用 delivery
  outbox，进程重启或下游短暂不可用时不再丢失，并沿用有界指数退避。
- 🔐 升级 Axios、Express、Undici、Socket.IO 及其兼容的间接依赖，
  生产依赖审计由 21 项降至 7 项；剩余项来自需要 Node 20/22
  大版本的 node-cron/Puppeteer 上游链，保留 Node 18 LTS 兼容。

### 测试
- 🧪 新增跨进程重启恢复无候选通知的 outbox 回归测试。

## [2.10.18] - 2026-08-31

### 新增
- ⭐ **投递模板支持热度数据**：新增 `{{bookmarkCount}}`（收藏数）与
  `{{viewCount}}`（浏览数）两个模板变量，取自 Pixiv 作品的 `total_bookmarks` /
  `total_view`；大数字以紧凑形式渲染（如 `1.2k`、`34.6w`），接口未返回时为空串。
  可写进投稿简介，作为"热门依据"。
- 🧪 新增热度变量渲染测试。

## [2.10.17] - 2026-08-31

### 新增
- 🔎 **中文小说有界回退**：`noMatchPolicy.lookbackDays` 可在目标日没有目标语言
  小说时逐日向前检查，最多 7 天；主题与语言条件不会被静默放宽，命中后立即停止。
- 🔔 **空结果通知**：`noMatchPolicy.notify` 配合交付目标 `notificationUrl`，可在
  候选耗尽后向下游运维端点发送幂等通知，而不是只留一条本地日志。

### 修复
- 🧾 空结果只写一条 execution log，不再由结果处理与外层异常处理重复记录。
- 🧪 新增逐日回退、命中停止、候选耗尽通知与认证 JSON 通知投递测试。

## [2.10.16] - 2026-08-31

### 修复
- 🐛 `mode: "topic"` 插画按热度保留有界递补池，再由下载计划批量剔除已下载 PID；同一发布日期第二次执行若 Top-1 已投稿，会自动选择下一部未下载作品，不再空跑。
- 🧪 新增回归测试覆盖 `limit: 1` 时请求 20 个候选并把完整热度顺序交给下载去重管线；常规递补池仍受 100 个候选上限约束。

## [2.10.15] - 2026-08-31

### 新增
- 🔞 **精确暴露 Pixiv `x_restrict` 等级**：下载产物和可持久投递 outbox
  现在保留原始整数，HTTP multipart 新增 `{{xRestrict}}`、
  `{{xRestrictLabel}}` 和 `{{xRestrictTag}}` 模板变量，可区分全年龄、R-18
  与 R-18G，也不会把内容等级强制绑定为下游遮罩策略。

## [2.10.14] - 2026-08-30

### 新增
- 📤 **Telegraph（telegra.ph）相册上传**：新增「Telegraph（telegra.ph）相册
  上传」配置指南——配合 [telepress](https://github.com/redtidev1918/telepress)
  的 `/publish/gallery` REST 端点，用现有 `httpMultipart` 交付目标即可把插画
  自动发布成 Telegra.ph 相册（自动分页、`#标签` 与来源链接页脚、R-18 提示），
  无需改动任何 PixivFlow 代码。

## [2.10.13] - 2026-08-30

### 新增
- 📦 **缓存容量硬上限**：新增 `storage.cacheMaxSizeMB`（`0` 关闭）。`pixivflow
  maintain` 会在按天清理后，将最旧的完整作品成组淘汰到容量线以下，避免 1 GiB
  小卷在保留期到达前被异常多页作品填满，也不会主动清理投递 outbox。

### 修复
- 🧩 缓存清理改为按作品分组，多页插画的图片与元数据会一起淘汰，不再逐个文件
  删除后过早移除下载记录。

## [2.10.12] - 2026-08-30

### 新增
- 🗜️ **缓存保留清理**：`pixivflow maintain` 现在会清理超过
  `storage.cacheRetentionDays`（默认 14 天，0 关闭）的下载缓存文件并同步删除
  对应下载记录——配合 `deleteAfterDelivery=false`，缓存有界增长、不再占满卷。
- 🛡️ **`maxPageCount` 页数上限**（target 级，默认不限）：超过该页数的插画直接跳过，
  杜绝 20+ 页原图在 512 MiB 机器上触发下载+相册上传的内存尖峰。

## [2.10.11] - 2026-08-30

### 新增
- 📅 **投稿模板新变量**：`{{rankingDate}}`（JST 榜单日，YYYY-MM-DD，自动解析
  TODAY/YESTERDAY/字面日期）、`{{publishedDate}}`（作品 Pixiv 发布日期，取自
  create_date）、`{{language}}`（小说检测语言，如 `Chinese (Mandarin) (cmn)`；
  插画为空）。渠道观众一眼就能看出这份投稿是「哪一天的热门作品、什么时候发布的」。

## [2.10.10] - 2026-08-30

### 新增
- 🤖 **AI 标签过滤**：`excludeAI: true` 时除 Pixiv 官方 `illust_ai_type === 2` 外，
  还匹配作品标签中的 AI 标记（生成AI / AI生成 / Generative AI / AI-generated 等，
  含翻译名），官方字段缺失或尚未标注的 AI 作品也能被拦住。纯文本匹配，零额外开销。
- 🔍 **可选文件元数据检查 `aiMetadataCheck`**（target 级，默认关闭）：下载完成后
  读取首页文件头部 2 MiB，扫描 AI 生成工具写入的元数据标记（Stable Diffusion 的
  `parameters=` PNG tEXt、NovelAI 的 EXIF 等），命中则跳过投递（仍记为已下载，
  避免以后重复拉取）。单次有界读，无像素分析、无模型推理，512 MiB 机器零压力。

### 修复
- 无（行为保持兼容：`excludeAI` 语义增强但默认关闭项不变）。

## [2.10.9] - 2026-08-30

### 修复
- 💾 **低内存机器下载多页作品时强制回收页缓冲**：每页图片保存后立即调用
  `global.gc()`（配合 `NODE_OPTIONS=--expose-gc`）。`fetch().arrayBuffer()`
  返回的 ArrayBuffer 属于 V8 外部内存，不受 `--max-old-space-size` 限制，
  默认 GC 节奏下会在下载 20+ 页作品时持续累积，使 node RSS 涨到 512 MiB
  机器无法承受的水平（健康检查开始超时/被标记 critical）。
  显式 GC 后单页缓冲即刻释放，下载进程 RSS 保持平稳。

## [2.10.8] - 2026-08-30

### 修复
- 📚 **小说正文改用 gallery-dl 验证过的 webview 主路径**：优先请求 `/webview/v2/novel` 并解析嵌入的 `novel.text`，旧 `/v1/novel/text` 与 Web AJAX 保留为两级回退。
- 🛡️ 三条正文来源均要求返回非空字符串；HTTP 200 但正文为空或结构异常不再被误判为成功，也不会生成只有标题/元数据头的 `.txt` 投稿。
- 🧪 新增空 webview、空 App API、AJAX 回退及全部来源耗尽的回归测试。

## [2.10.7] - 2026-08-30

### 新增
- 🚫 **可验证的非 AI 插画筛选**：插画目标新增 `excludeAI: true`，依据 Pixiv 返回的 `illust_ai_type=2` 元数据，在 Topic 热度排序前排除 AI 作品；其他下载模式也在规划阶段统一过滤。缺失/未知标记默认保留，避免误杀。
- 🇨🇳 **中文小说热度回填**：`languageFilter: "chinese"` 不再只检测总体 Top 1；新增 `languageCandidateLimit`（默认 20），按热度串行检查完整正文，跳过非中文后继续下一部，直到补足 `limit`。
- 🔒 新增 `strictLanguageFilter: true`，正文过短或检测失败时拒绝投稿，适合“只允许中文小说”的严格计划。

### 修复
- 🧵 语言回填强制单并发，保持热度顺序并避免多个候选同时越过 `limit` 造成超额投稿。

## [2.10.6] - 2026-08-30

### 修复
- 📖 **小说正文不再为空**：正确解包 Pixiv `getNovelText` 返回的 `{ novel_text }`，避免把响应对象拼成 `[object Object]`，导致下载与投稿的 `.txt` 只有标题/标签头而没有正文。
- 🛡️ 当所有正文回退均为空时跳过该小说，不写数据库、不生成空文件，也不会把无正文文档送入审核群。

## [2.10.5] - 2026-08-30

### 新增
- 🏷️ **投稿模板变量扩展**：新增 `{{link}}`（按类型生成 Pixiv 永久链接：插画 `artworks/{id}`、小说 `novel/show.php?id={id}`）、`{{topicTag}}`（topic 模式取主题词、否则取配置 tag，避免标签空项）、`{{spoiler}}`（R-18 作品 `x_restrict>0` 自动为 `true`，普通作品 `false`）。投稿不再需要硬编码 `spoiler: true` 或手动拼链接。

---

## [2.10.4] - 2026-08-30

### 修复
- 🏷️ **Topic 投稿标签不再丢失**：`mode: "topic"` 目标现在把主题名作为统一 `{{tag}}` 传给 delivery，修复 TelePost 投稿最终只剩 `#pixiv` 的问题。
- 🧭 Topic 目标的下载日志与内部标签不再显示 `unknown`，统一按 `filterTag → tag → topic` 解析。

### 新增
- 🧩 HTTP multipart delivery 新增 `{{topic}}` 与 `{{workTags}}` 模板变量；插画和小说下载结果会携带作品自身的 Pixiv 标签。
- 📦 双 Bot 模板默认投稿 `Pixiv + 计划主题 + 作品标签`，与 TelePost 2.10.4 的有序去重配合使用。

---

## [2.10.3] - 2026-08-29

### 新增
- 🔞 **`topicDiscovery.includeR18`**：允许主题下载包含 R-18 作品（不限 NSFW）。Pixiv 插画搜索默认带 `filter=for_ios` 会过滤 R-18，开启后移除该过滤；采样（discovery）、采集（collection）与背景频率估计全部贯通。小说搜索本来就包含 R-18，不受影响。目标级配置示例：`{ "mode": "topic", "topic": "丸呑み", "topicDiscovery": { "includeR18": true } }`。

---

## [2.10.2] - 2026-08-29

### 修正
- 🎯 **排名语义修正**：`metadata` 相关性只作为接受门槛（gate），不再参与排序。通过 `minMetadataScore` 的候选之间完全按 `calculatePopularityScore()`（收藏 + 浏览/1000）热度排名；`limit=1` 仍用 O(n) 取最大值。此前“带 seed tag 的作品永远优先于更高热度的相关作品”的旧逻辑已移除（`relevanceTier`/`rankCompare` 删除）。
- 🔍 **autocomplete 独立召回**：Pixiv autocomplete 明确关联、但未出现在本次样本共现中的 Tag 现在也会以低置信度（固定 0.27 分、`occurrences=0`）进入检索空间，排在一切有共现证据的 Tag 之后，且仍受 `maxTags` 限制。三类可信度：autocomplete+共现（高）> 仅共现（正常）> 仅 autocomplete（低）。通用平台 Tag（R-18/オリジナル/女の子 等）仍被排除。
- 🐛 依赖 `better-sqlite3` 升级 `^11.10.0 → ^12.2.0`：修复 Node 22/24 下进程退出时 GC 触发 `RemoveEnvironmentCleanupHook` 断言崩溃（影响本地 CLI 与 CI 稳定性；Fly 运行时为 Node 20 不受影响）。
- 🧠 **256 MB 内存实测通过**（Fly 256 MB 机器、Linux cgroup、生产镜像、真实 Pixiv API、`NODE_OPTIONS=--max-old-space-size=128`）：topic 发现 / 采集 / 双 target 下载全程 `exit 0`、`oom_killed=false`、无重启；全进程峰值 RSS ≈ **106 MB**、堆峰值 `heapUsed ≈ 33 MB`（远低于 128 MB 堆上限），距 256 MB 上限余量约 150 MB。

---

## [2.10.1] - 2026-08-29

### 修复
- 🐛 Topic 缓存目录改为从实际 SQLite 文件的绝对位置推导（`Database.getDatabasePath()` 规范化为绝对路径）。此前当 `storage.databasePath` 为相对路径且进程 CWD 与数据库目录不一致时（如容器 CLI），`topic-cache/` 可能写到工作目录而非数据卷，导致缓存无法随卷持久化；现在 CLI 与调度器在任意工作目录下都把缓存放在数据库同级目录。

---

## [2.10.0] - 2026-08-29

### 新增
- ✨ **语义主题下载 `mode: "topic"`**：从“按明确 Tag 下载”扩展为“只给一个 Topic，自动推导检索空间”。例如 `topic: "ボテ腹"` 会通过 Pixiv autocomplete + 近期作品标签共现自动发现 `妊娠/妊婦/膨腹/臨月` 等相关 Tag，搜索目标日期作品 → 去重 → 轻量 Metadata 相关性过滤 → 本地热度排序 → 下载 Top N；不需要用户事先研究和维护相关 Tag 表
- ✨ `pixivflow topic resolve <topic>`：查看自动推导出的相关 Tag 空间（带相关度/共现/特异性，`--refresh` 强制刷新、`--type` 区分插画/小说）
- ✨ `pixivflow topic test <topic> --date YESTERDAY`：dry-run 预览某天的候选数与 Top N，不下载
- ✨ Topic 空间按 `topic + 插画/小说` 分别缓存到数据卷的 `topic-cache/`（默认 7 天，原子写），容器重建不丢；刷新失败自动降级到旧缓存、再降级到仅用种子 Tag，调度器不中断

### 设计与边界
- 🧠 **零 AI**：不依赖任何 LLM/VLM/Embedding/本地模型/向量库，只用 Pixiv 自身的 Tag/共现/标题/描述做可解释统计（PMI 式特异性打分自动压低 R-18/オリジナル 等通用 Tag）
- 🪶 **低资源**：相关 Tag ≤ 12、采样 ≤ 100、候选池 ≤ 250、串行低并发请求、候选对象字段裁剪、`limit=1` 走 O(n) 选取，适配 256 MB Docker VPS
- 🧭 相关性作为接受门槛、通过后按本地热度排序（⚠️ 2.10.0 初始实现为“相关性优先于热度”，已在 2.10.2 修正为纯热度排名，见下）；插画/小说 Tag 空间独立；相关 Tag 永不递归扩散（depth=1，围绕原始 Topic）

---

## [2.9.0] - 2026-08-29

### 新增
- ✨ `pixivflow tags discover <种子词>`：相关 Tag 发现。结合 Pixiv 官方标签联想接口（`/v2/search/autocomplete`）与作品标签共现统计——分别抽样最近插画/小说，按覆盖率与联想排名加权打分，帮你找到主题相关但文字不近似的标签（例如下载「西瓜肚」时发现日文等价标签 `ボテ腹`、`膨腹`）
- ✨ `pixivflow tags apply <清单> --target <id> --select <tag1,tag2>`：人工确认后把所选 Tag 原子写入配置，自动设为 `tagRelation: or`，运行中的 scheduler 经配置热重载生效，无需重启
- ✨ 发现结果按种子词与参数哈希缓存（默认 7 天），存于数据库同级 `tag-discovery/` 目录，避免重复请求

### 安全与边界
- 🛡️ `discover` 只生成候选清单，绝不改动下载计划；`apply` 仅接受清单内的标签白名单，写入前整份校验配置并自动备份（`.tag-apply.bak`），再以临时文件 + 原子替换发布，失败不触碰原配置
- 🛡️ 抽样量有界（默认每类 60，上限 200）、候选数与缓存周期均可配置，适配低内存 / 限带宽部署
- 🔒 移除误被 Git 跟踪的配置备份模板，并在 `.gitignore` 补充 `config/backups/` 与 `*.tag-apply.bak` 规则，防止真实配置入库

---

## [2.8.0] - 2026-08-29

### 改进
- 🔁 delivery outbox 新增持久化指数退避，默认 5 分钟起步、最长 6 小时，避免远端不可用时每个计划都重复上传
- 💾 outbox 状态更新改为临时文件 + 原子替换，进程中断时不再容易留下半写 JSON
- ✅ 新增延迟重试、到期恢复和配置范围校验测试
- 🛡️ npm 发版固定使用受支持的 Node 22，并在 publish 前执行版本、构建与完整测试门禁

---

## [2.7.0] - 2026-08-29

### 新增
- ✨ `schedules[]` 单进程多计划调度：每个计划拥有独立 Cron、时区、target 组、执行限制和历史计数
- ✨ SSH 友好的配置热重载：文件监听或 `SIGHUP` 触发完整校验与原子调度表替换，无效更新自动回退旧快照
- ✨ Fly 双 Bot 低内存缓存投递模板 `config/fly-two-bots.example.json`

### 改进
- 🔧 多计划共享 Pixiv 客户端、SQLite 与文件服务，全局有界串行队列避免并发下载造成内存峰值
- 🔧 `YESTERDAY` / `TODAY` 改为每次计划执行前解析，长期运行不会冻结在启动日期
- 🔧 SQLite 默认页缓存由 64 MiB 下调到 8 MiB，并支持 `PIXIV_DB_CACHE_KB` 覆盖
- ✅ 调度历史按 schedule id 隔离，旧单 `scheduler` 配置保持兼容

---

## [2.6.0] - 2026-08-28

### 新增
- ✨ 下载 target 新增 `storageMode: "persistent" | "cache"`：默认永久留存；缓存模式在交付成功后清理作品文件与元数据 sidecar
- ✨ 通用命名交付目标：首个 provider 为流式 `httpMultipart`，URL、method、headers、文件字段、普通表单字段及成功判定均可配置，不绑定具体投稿服务
- ✨ target 可选择 delivery target 并覆盖表单字段，支持作品变量模板和任意环境变量插值
- ✨ 持久化 delivery outbox：交付失败保留文件及任务清单，下次运行自动重试，防止数据库判重后漏投

### 改进
- 🔧 multipart 文件采用流式传输，避免大文件或多文件投稿时整体载入内存
- ✅ 新增交付成功、立即重试、跨运行恢复、成功清理及持久化模式回归测试

---
## [2.5.0] - 2026-08-27

### 新增
- ✨ WebUI 原生 HTTPS：设置 `WEBUI_TLS_CERT` / `WEBUI_TLS_KEY` 后以 TLS 监听，配合 Basic Auth 即可在无反代的情况下安全暴露（自签证书亦可）；仅设其一则拒绝启动

---
## [2.4.0] - 2026-08-27

### 新增
- ✨ WebUI 可选 HTTP Basic Auth：同时设置 `WEBUI_USERNAME` / `WEBUI_PASSWORD` 后，静态页、API 与 Socket.IO 握手全部需要认证（`/api/health`、`/health` 例外）；未设置则维持原行为。公网部署不再裸奔

---
## [2.3.0] - 2026-08-27

### 新增
- ✨ 动图（ugoira）支持：自动下载 帧 zip （原始尺寸优先，失败降级 medium）并写入 帧延迟侧车 JSON
- ✨ 小说正文获取新增 webview 回退（/webview/v2/novel，参考 gallery-dl）：修复部分作品 /v1/novel/text 404 的问题
- ✨ 图片/搜索结果类型字段兼容（illust_type / type）

### 修复
- 🐛 健康检查与 token 刷新遵循 network.proxy（随 2.2.1 发布）后续完善：ajax 回退不再携带 App Bearer 凭据，避免 web 端拒绝

---
## [2.2.1] - 2026-08-27

### 修复
- 🐛 健康检查的连通性探测现在遵循 `network.proxy`（此前用裸 `https.get`，代理环境下恒为误报 Timeout）
- 🐛 登录令牌刷新（AuthClient）同样改走代理 dispatcher，修复代理服务器上 token 维护失败的问题

---
## [2.2.0] - 2026-08-27

### 新增
- ✨ `pixivflow refresh -`：支持从 stdin 读取 refreshToken（`cat token.txt | pixivflow refresh -`），不进 shell 历史与进程列表
- ✨ `login-headless --password-stdin`：密码经 stdin 传入，避免进 shell 历史
- ✨ `login` 成功后提示如何把 token 搬运到无浏览器服务器
- ✨ 文档：LOGIN 补充无头服务器三种登录路径与安全建议

---
## [2.1.1] - 2026-08-27

### 变更
- 📦 依赖升级：pixiv-token-getter 2.0.0 → 2.1.0（登录库，地板升至 ^2.1.0）。全量测试 461/461 通过。

---
## [2.1.0] - 2026-08-27

### 新增
- ✨ WebUI 实时任务推送：新增 Socket.IO `download` 事件（活动任务快照 + 最近 40 条日志，150ms 合并去抖），前端直写缓存，进度/状态更新降至亚秒
- ✨ `GET /health` 别名路由，便于容器健康检查与反向代理探测
- ✨ `PIXIV_WEBUI_AUTO_PORT=true` 时 WebUI 自动改用下一个空闲端口
- ✨ WebUI URL 端点接入共享解析器，支持全部 10 种链接形态（此前系列/用户页等会返回 400）

### 修复
- 🐛 WebUI 停止任务此前仅触发无人监听的 AbortController，下载不会真正中断；现改为协作式取消，状态正确落库为 stopped
- 🐛 调度器 `items_downloaded` 恒为 0：改为以数据库基线差值统计
- 🐛 调度器 `timeout` 现会真正中断作业，且不再误报为 failed
- 🐛 docker-compose webui 健康检查探测错误端点且参数形式错误，恒为 unhealthy

### 变更
- 📦 Dockerfile 前端缺失时自动浅克隆 pixivflow-webui；`SKIP_WEBUI_BUILD=true` 可产出 API-only 镜像
- 🧹 发布脚本仓库地址修正为 redtidev1918/PixivFlow
- 📚 文档站全面重写（信息架构 + 视觉 + 双向交叉链接）

---

## [2.0.20] - 2025-11-12

### 新增
- ✨ 添加 `pixivflow dirs` 命令，用于查看所有目录路径信息
  - 支持 `--verbose` 选项查看详细目录信息（绝对路径、是否存在等）
- ✨ 增强 `pixivflow config set` 命令功能
  - 支持快速设置存储目录路径（downloadDirectory、illustrationDirectory、novelDirectory 等）
  - 自动备份原配置，确保配置安全

### 改进
- 🔧 更新文档，添加目录管理和配置设置命令的详细说明
  - 更新 README.md 和 README_EN.md
  - 更新 docs/USAGE.md 添加目录管理章节
  - 更新 docs/CONFIG.md 添加命令行配置管理说明
- 🔧 改进配置管理体验
  - 提供更便捷的目录路径设置方式
  - 增强配置验证和错误提示

---

## [2.0.42] - 2026-08-27

### 变更

- 📦 **包元数据迁移**：仓库、主页、Issue 链接与作者信息从旧账号
  (zoidberg-xgd) 迁移至 [redtidev1918](https://github.com/redtidev1918)，
  本次发布使 npm 页面上的这些字段同步更新。
- 📚 新增 [发版指南](../RELEASING.md) 与 Node 18/20/22 测试矩阵
  （CI 质量门禁）。
- 🧹 文档清理：README 双语结构与文档导航更新。


## [未发布]

### 新增
- ✨ 完整的 TypeScript 重构
  - 重构项目架构，采用依赖注入模式
  - 改进代码组织和模块化
  - 增强类型安全和错误处理
  - 优化性能和可维护性

### 改进
- 🔧 优化项目文档结构
  - 简化文档组织，采用扁平化结构
  - 更新文档路径和链接
  - 改进文档导航和可读性
- 🔧 改进 WebUI 静态文件查找逻辑
  - 添加对 npm 全局安装路径的检测
  - 改进找不到前端文件时的提示信息
  - 提供更清晰的使用说明和步骤指导
- 🔧 统一命令行输出语言为英文
  - 将目录信息输出（`directory-info.ts`）从中文改为英文，保持与 CLI 命令输出的一致性
  - 将配置向导（`setup-wizard.ts`）的所有交互提示和输出从中文改为英文
  - 改进国际化支持，所有命令行输出统一使用英文

---

## [2.0.0] - 2025-11-11

### 新增
- ✨ 完整的 TypeScript 重写
- ✨ 独立的命令行工具，无需浏览器扩展
- ✨ 定时任务支持（Cron 表达式）
- ✨ 智能去重功能（SQLite 数据库）
- ✨ 断点续传功能
- ✨ 自动重试机制
- ✨ 详细的日志系统
- ✨ 配置向导（交互式设置）
- ✨ 多种下载模式（搜索、排行榜）
- ✨ 支持插画和小说下载
- ✨ 灵活的筛选条件（标签、收藏数、日期范围）
- ✨ 随机下载功能
- ✨ 完整的脚本工具集
- ✨ 健康检查功能
- ✨ 自动监控和维护脚本
- ✨ 代理支持（HTTP/HTTPS/SOCKS5）
- ✨ OAuth 2.0 PKCE 认证流程
- ✨ 支持多种登录方式
  - pixiv-token-getter 适配器
  - Puppeteer 登录
  - Python gppt 登录
- ✨ 支持动态并发调整，自动处理速率限制
- ✨ 支持语言检测和过滤（小说）
- ✨ 支持多标签搜索
- ✨ 支持排行榜下载
- ✨ 支持小说系列下载
- ✨ 支持文件组织方式配置
- ✨ 提供 WebUI 管理界面
- ✨ 提供 Docker 支持
- ✨ 提供丰富的脚本工具
- ✨ 发布到 npm，支持 `npm install -g pixivflow` 一键安装
  - npm 包名：`pixivflow`
  - npm 地址：https://www.npmjs.com/package/pixivflow
  - 版本：2.0.0

### 改进
- 🔧 优化下载性能
- 🔧 改进错误处理
- 🔧 增强日志可读性
- 🔧 优化配置管理
- 🔧 优化错误处理机制
- 🔧 优化日志系统

### 修复
- 🐛 修复各种已知问题

### 文档
- 📚 完整的 README
- 📚 详细的使用教程
- 📚 新手指南
- 📚 快速开始指南
- 📚 登录指南
- 📚 配置指南
- 📚 脚本使用指南
- 📚 测试指南
- 📚 更新文档，添加 npm 安装方式说明

---

## [1.0.0] - 初始版本

### 新增
- 🎉 初始发布
- 基本的下载功能
- 简单的配置系统

---

## 版本说明

### 版本号格式

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 变更类型

- **新增**：新功能
- **改进**：现有功能的改进
- **修复**：Bug 修复
- **移除**：已移除的功能
- **安全**：安全相关的修复
- **文档**：文档更新

---

## 链接

- [GitHub Releases](https://github.com/redtidev1918/PixivFlow/releases)
- [完整文档](../README.md)

---

**注意**：详细的变更记录请查看 [GitHub Releases](https://github.com/redtidev1918/PixivFlow/releases)。

---

## 📦 已发布版本索引

npm 包 `pixivflow` 自 2.0.0 起的全部发布记录（数据源：npm registry）。
2.0.20 及更早版本的逐条变更见上方章节；其余版本的变更详情请查看
[GitHub 提交历史](https://github.com/redtidev1918/PixivFlow/commits/master)
或对应版本的 npm 页面。

| 版本 | 发布日期 |
| --- | --- |
| [`2.0.0`](https://www.npmjs.com/package/pixivflow/v/2.0.0) | 2025-11-11 |
| [`2.0.1`](https://www.npmjs.com/package/pixivflow/v/2.0.1) | 2025-11-11 |
| [`2.0.2`](https://www.npmjs.com/package/pixivflow/v/2.0.2) | 2025-11-11 |
| [`2.0.3`](https://www.npmjs.com/package/pixivflow/v/2.0.3) | 2025-11-11 |
| [`2.0.4`](https://www.npmjs.com/package/pixivflow/v/2.0.4) | 2025-11-11 |
| [`2.0.5`](https://www.npmjs.com/package/pixivflow/v/2.0.5) | 2025-11-11 |
| [`2.0.6`](https://www.npmjs.com/package/pixivflow/v/2.0.6) | 2025-11-11 |
| [`2.0.7`](https://www.npmjs.com/package/pixivflow/v/2.0.7) | 2025-11-11 |
| [`2.0.8`](https://www.npmjs.com/package/pixivflow/v/2.0.8) | 2025-11-11 |
| [`2.0.9`](https://www.npmjs.com/package/pixivflow/v/2.0.9) | 2025-11-11 |
| [`2.0.10`](https://www.npmjs.com/package/pixivflow/v/2.0.10) | 2025-11-11 |
| [`2.0.11`](https://www.npmjs.com/package/pixivflow/v/2.0.11) | 2025-11-11 |
| [`2.0.12`](https://www.npmjs.com/package/pixivflow/v/2.0.12) | 2025-11-11 |
| [`2.0.13`](https://www.npmjs.com/package/pixivflow/v/2.0.13) | 2025-11-11 |
| [`2.0.14`](https://www.npmjs.com/package/pixivflow/v/2.0.14) | 2025-11-11 |
| [`2.0.15`](https://www.npmjs.com/package/pixivflow/v/2.0.15) | 2025-11-11 |
| [`2.0.16`](https://www.npmjs.com/package/pixivflow/v/2.0.16) | 2025-11-11 |
| [`2.0.17`](https://www.npmjs.com/package/pixivflow/v/2.0.17) | 2025-11-11 |
| [`2.0.18`](https://www.npmjs.com/package/pixivflow/v/2.0.18) | 2025-11-11 |
| [`2.0.19`](https://www.npmjs.com/package/pixivflow/v/2.0.19) | 2025-11-12 |
| [`2.0.20`](https://www.npmjs.com/package/pixivflow/v/2.0.20) | 2025-11-12 |
| [`2.0.21`](https://www.npmjs.com/package/pixivflow/v/2.0.21) | 2025-11-12 |
| [`2.0.22`](https://www.npmjs.com/package/pixivflow/v/2.0.22) | 2025-11-12 |
| [`2.0.24`](https://www.npmjs.com/package/pixivflow/v/2.0.24) | 2025-11-12 |
| [`2.0.25`](https://www.npmjs.com/package/pixivflow/v/2.0.25) | 2025-11-12 |
| [`2.0.26`](https://www.npmjs.com/package/pixivflow/v/2.0.26) | 2025-11-12 |
| [`2.0.27`](https://www.npmjs.com/package/pixivflow/v/2.0.27) | 2025-11-13 |
| [`2.0.28`](https://www.npmjs.com/package/pixivflow/v/2.0.28) | 2025-11-13 |
| [`2.0.29`](https://www.npmjs.com/package/pixivflow/v/2.0.29) | 2025-11-13 |
| [`2.0.30`](https://www.npmjs.com/package/pixivflow/v/2.0.30) | 2025-11-13 |
| [`2.0.31`](https://www.npmjs.com/package/pixivflow/v/2.0.31) | 2025-11-13 |
| [`2.0.35`](https://www.npmjs.com/package/pixivflow/v/2.0.35) | 2025-11-15 |
| [`2.0.36`](https://www.npmjs.com/package/pixivflow/v/2.0.36) | 2025-11-15 |
| [`2.0.37`](https://www.npmjs.com/package/pixivflow/v/2.0.37) | 2025-11-15 |
| [`2.0.32`](https://www.npmjs.com/package/pixivflow/v/2.0.32) | 2025-11-15 |
| [`2.0.38`](https://www.npmjs.com/package/pixivflow/v/2.0.38) | 2025-11-16 |
| [`2.0.39`](https://www.npmjs.com/package/pixivflow/v/2.0.39) | 2025-11-19 |
| [`2.0.40`](https://www.npmjs.com/package/pixivflow/v/2.0.40) | 2025-11-19 |
| [`2.0.41`](https://www.npmjs.com/package/pixivflow/v/2.0.41) | 2025-12-07 |
