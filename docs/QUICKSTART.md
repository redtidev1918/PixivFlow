# 快速开始

3 分钟上手指南。

## 环境要求

- **Node.js**: 18.0.0+
- **npm**: 9.0.0+
- **Pixiv 账号**

## 推荐方式 (NPM)

直接通过 npm 全局安装是最快捷的方式。

```bash
# 1. 安装
npm install -g pixivflow

# 2. 登录 (交互式)
pixivflow login

# 3. 下载
pixivflow download
```

## 源码方式

```bash
# 1. 安装依赖
npm install

# 2. 登录
npm run login

# 3. 下载
npm run download
```

## 基础配置

配置文件：`config/standalone.config.json`

下载 "风景" 标签的 20 张插画：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    }
  ]
}
```

更多配置详见 [配置手册](./CONFIG.md)。

## 常用命令

| 功能 | NPM (全局) | 源码 |
|------|------------|------|
| **登录** | `pixivflow login` | `npm run login` |
| **下载** | `pixivflow download` | `npm run download` |
| **随机体验** | `pixivflow random` | `npm run random` |
| **定时任务** | `pixivflow scheduler` | `npm run scheduler` |
