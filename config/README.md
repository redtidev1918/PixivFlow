# 配置文件说明

本目录存放 PixivFlow 的配置。示例配置在 [`examples/`](examples/README.md)，那里同时说明了
每个示例的适用场景。

```
config/
├── standalone.config.json      # 实际使用的配置，自行创建（已在 .gitignore 中）
├── fly-two-bots.example.json   # Fly 双 Bot 部署示例，供 pixivflow-telepost-deploy 使用
├── examples/                   # 示例配置与说明
└── backups/                    # 自动备份，运行后生成
```

## 快速开始

1. 获取 refreshToken：

   ```bash
   pixivflow login          # 已全局安装
   npm run login            # 或从源码运行
   ```

2. 选一份示例作为起点：

   ```bash
   cp config/examples/standalone.config.simple.json config/standalone.config.json
   ```

3. 修改 `refreshToken`（登录未自动写入时）与 `targets`。

4. 开始下载：

   ```bash
   pixivflow download       # 已全局安装
   npm run download         # 或从源码运行
   ```

也可以不复制，直接指向示例文件：

```bash
pixivflow download --config "$(pwd)/config/examples/yesterday-popular-novel.zh.json"

export PIXIV_DOWNLOADER_CONFIG="$(pwd)/config/examples/multi-tag-or-limit.zh.json"
pixivflow download
```

## 配置项

唯一必需项是 `pixiv.refreshToken`。最常改动的是 `targets` 数组，其字段包括 `type`、`tag`、
`tagRelation`、`mode`、`rankingMode`、`limit`、`sort`、`minBookmarks`、`startDate`、`endDate`、
`languageFilter` 等。其余可选顶层项：`logLevel`、`network.proxy`、`storage`、`download`、
`scheduler`。逐项说明见 [docs/CONFIG.md](../docs/CONFIG.md)。

## 注意

- 不要提交含真实 `refreshToken` 的配置文件
- 示例中的 `YOUR_REFRESH_TOKEN` 需要替换为实际值
- 修改配置后先用小批量下载验证；旧配置会自动备份到 `backups/`
