# 示例配置文件

示例可以直接使用：复制到 `config/standalone.config.json`，或用 `--config`、
`PIXIV_DOWNLOADER_CONFIG` 指向它。用前把 `YOUR_REFRESH_TOKEN` 换成实际值，或运行
`pixivflow login --config <示例文件路径>` 自动写入。

| 文件 | 适用场景 | 要点 |
| --- | --- | --- |
| `standalone.config.example.json` | 了解全部选项 | 含所有配置项与逐项注释 |
| `standalone.config.simple.json` | 快速开始 | 只保留最常用的选项 |
| `standalone.config.ranking.json` | 主要下载排行榜 | `mode: "ranking"` 与 `rankingMode`、`rankingDate` 示例 |
| `standalone.config.novel-chinese.json` | 主要下载中文小说 | 语言过滤与时间范围过滤 |
| `specific-download.example.json` | 特定场景 | 10 个场景：随机、质量过滤、时间范围、多标签 OR、系列与单作品、语言过滤 |

以下三个示例可直接引用，不必复制：

| 文件 | 内容 |
| --- | --- |
| `yesterday-popular-novel.zh.json` | 昨日热门中文小说 Top 10：搜索 + `sort: "popular_desc"` + `YESTERDAY` + 仅中文 |
| `yesterday-ranking-illustration.json` | 昨日日榜插画 Top 10：排行榜模式，不依赖标签 |
| `multi-tag-or-limit.zh.json` | 多标签并集（`tagRelation: "or"`）+ 总量 10 + 仅中文 + 昨天 |

## 常用字段

- `rankingMode`：`day`、`week`、`month`、`day_male`、`day_female`、`day_ai`、`week_original`、`week_rookie`、`day_r18`、`day_male_r18`、`day_female_r18`
- `languageFilter`：`chinese` 仅中文，`non-chinese` 仅非中文，`null` 不过滤；配套 `detectLanguage` 默认 `true`
- `startDate` / `endDate`：支持占位符 `LAST_7_DAYS`、`YESTERDAY`，运行时换算为实际日期
- `tagRelation`：`and` 全部命中，`or` 任意命中
- 其余字段（`minBookmarks`、`filterTag`、`restrict`、`random`、`illustId`、`novelId`、`seriesId`、`userId`、`searchTarget`）见 [docs/CONFIG.md](../../docs/CONFIG.md)

## 用法

```bash
cp config/examples/standalone.config.simple.json config/standalone.config.json

pixivflow download --config "$(pwd)/config/examples/yesterday-popular-novel.zh.json"

export PIXIV_DOWNLOADER_CONFIG="$(pwd)/config/examples/multi-tag-or-limit.zh.json"
pixivflow download

pixivflow login --config "$(pwd)/config/examples/yesterday-popular-novel.zh.json"
```

不要提交含真实 `refreshToken` 的配置文件；改了配置先用小批量下载验证。
更多见 [config/README.md](../README.md) 与 [docs/CONFIG.md](../../docs/CONFIG.md)。
