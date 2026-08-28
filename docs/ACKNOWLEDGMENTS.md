# 参考与致谢

> **English:** Credits and references. PixivFlow stands on the shoulders of
> the Pixiv App API reverse-engineering community and the open-source Node.js
> / React ecosystems. All trademarks belong to their respective owners; this
> project is not affiliated with Pixiv Inc.

PixivFlow 能跑起来,离不开下面这些项目。按影响排序,链接均已在撰写时逐一验证。

## 灵感与参考

| 项目 | 影响 |
| --- | --- |
| [mikf/gallery-dl](https://github.com/mikf/gallery-dl) | v2.3.0 的动图(ugoira)元数据/zip 处理与小说正文 webview 回退直接参考其 pixiv 抽取器;多站点抽取器的容错组织方式也是范本 |
| [azuline/pixiv-api](https://github.com/azuline/pixiv-api) | App API 端点文档最完整的实现之一,novel text / ranking 的语义参照 |
| [akameco/pixiv-app-api](https://github.com/akameco/pixiv-app-api) | Promise 风格 App API 客户端,请求头与分页设计参考 |
| [eggplants/get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) | OAuth(PKCE)登录流程的 Python 先行者;内置 gppt 兜底适配层即基于同一思路 |
| [redtidev1918/pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) | 自维护的登录库(本项目默认登录适配层的底层实现),v2.1.0 起由 Trusted Publishing 发布 |

## 核心依赖 · 后端(Node.js)

| 依赖 | 用途 |
| --- | --- |
| [undici](https://github.com/nodejs/undici) | HTTP 客户端与代理 dispatcher(ProxyAgent) |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 下载记录 / 去重 / 断点数据库 |
| [express](https://github.com/expressjs/express) | WebUI 后端框架 |
| [socket.io](https://github.com/socketio/socket.io) | 日志与任务状态的实时推送 |
| [node-cron](https://github.com/node-cron/node-cron) | 定时调度 |
| [axios](https://github.com/axios/axios) | SOCKS 代理路径的 HTTP 客户端 |
| [https-proxy-agent](https://github.com/TooTallNate/proxy-agents) / [socks-proxy-agent](https://github.com/TooTallNate/proxy-agents) | 代理连接 |
| [franc-min](https://github.com/wooorm/franc) | 小说语言检测(中文过滤) |
| [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) | 登录令牌获取 |

## 核心依赖 · WebUI 前端

| 依赖 | 用途 |
| --- | --- |
| [React 18](https://github.com/facebook/react) + [Ant Design 5](https://github.com/ant-design/ant-design) | 界面框架与组件库 |
| [TanStack Query](https://github.com/TanStack/query) | 服务端状态与缓存 |
| [Zustand](https://github.com/pmndrs/zustand) | 客户端状态 |
| [Socket.IO Client](https://github.com/socketio/socket.io) | 实时通道 |
| [i18next](https://github.com/i18next/i18next) | 中英双语 |
| [Vite](https://github.com/vitejs/vite) | 构建与开发服务器 |
| [Playwright](https://github.com/microsoft/playwright) + [Jest](https://github.com/jestjs/jest) | 端到端与单元测试 |

## 使用规范

- 本项目与 Pixiv Inc.(ピクシブ株式会社)**无任何关联**;Pixiv 及相关商标归其权利人所有。
- 请遵守 Pixiv 服务条款:理性收藏、尊重创作者版权,不要将下载内容用于商业用途或二次分发。
- 依赖商标与版权归属各自的权利人,一并致谢。