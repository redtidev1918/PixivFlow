# 参考与致谢

> **English:** Projects PixivFlow references and depends on. Links verified
> 2026-08. Not affiliated with Pixiv Inc.

以下链接于 2026-08 验证可用。

## 灵感与参考

| 项目 | 参考内容 |
| --- | --- |
| [mikf/gallery-dl](https://github.com/mikf/gallery-dl) | ugoira 元数据/zip 处理;小说正文 webview 回退 |
| [azuline/pixiv-api](https://github.com/azuline/pixiv-api) | App API 端点语义 |
| [akameco/pixiv-app-api](https://github.com/akameco/pixiv-app-api) | 客户端与分页设计 |
| [eggplants/get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) | OAuth(PKCE)登录流程 |

## 同门项目

| 项目 | 说明 |
| --- | --- |
| [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) | 登录库,默认登录适配层的底层实现 |
| [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) | WebUI 前端 |

## 核心依赖

后端(Node.js):[undici](https://github.com/nodejs/undici)(HTTP 与代理 dispatcher)、[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)(存储)、[express](https://github.com/expressjs/express)(WebUI 服务)、[socket.io](https://github.com/socketio/socket.io)(实时推送)、[node-cron](https://github.com/node-cron/node-cron)(调度)、[axios](https://github.com/axios/axios)(SOCKS 路径)、[https-proxy-agent / socks-proxy-agent](https://github.com/TooTallNate/proxy-agents)(代理连接)、[franc-min](https://github.com/wooorm/franc)(语言检测)、[pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter)(登录)。

前端:[React 18](https://github.com/facebook/react)、[Ant Design 5](https://github.com/ant-design/ant-design)、[TanStack Query](https://github.com/TanStack/query)、[Zustand](https://github.com/pmndrs/zustand)、[Socket.IO Client](https://github.com/socketio/socket.io)、[i18next](https://github.com/i18next/i18next)、[Vite](https://github.com/vitejs/vite)、[Playwright](https://github.com/microsoft/playwright)、[Jest](https://github.com/jestjs/jest)。

## 声明

- 本项目与 Pixiv Inc. 无关联;Pixiv 及相关商标归其权利人所有。
- 请遵守 Pixiv 服务条款;下载内容仅供个人收藏,勿商用或二次分发。
- 各依赖许可见其仓库。
