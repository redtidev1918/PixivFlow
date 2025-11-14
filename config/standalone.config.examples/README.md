# 示例配置合集（通用标签）
- yesterday-popular-novel.zh.json
  - 昨日热门中文小说 Top 10（搜索模式 + popular_desc + YESTERDAY）
  - 标签：オリジナル（通用原创标签）
- yesterday-ranking-illustration.json
  - 昨日日榜插画 Top 10（排行榜模式）
  - 不依赖标签，直接按 Pixiv 日榜抓取
- multi-tag-or-limit.zh.json
  - 多标签并集（tagRelation: "or"）+ 总量限制 10 + 中文过滤 + 昨天
  - 标签：風景 イラスト オリジナル（通用常见标签）
使用方法（任选其一）：
- 命令行参数：
  pixivflow download --config "$(pwd)/config/standalone.config.examples/yesterday-popular-novel.zh.json"
- 环境变量：
  export PIXIV_DOWNLOADER_CONFIG="$(pwd)/config/standalone.config.examples/multi-tag-or-limit.zh.json"
  pixivflow download
提示：
- 将文件中的 YOUR_REFRESH_TOKEN 替换为你的实际 token，或先运行：
  pixivflow login --config "$(pwd)/config/standalone.config.examples/xxx.json"
  该命令会把登录拿到的 refresh token 写入对应配置。
