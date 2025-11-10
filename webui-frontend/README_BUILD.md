# 🚀 快速构建指南

## 最简单的构建方式

```bash
cd webui-frontend
npm run electron:build
```

这会构建当前平台的应用。

## 构建所有平台

```bash
cd webui-frontend
npm run electron:build:all
```

或使用脚本：

```bash
cd webui-frontend
bash build-all-platforms.sh
```

## 构建特定平台

### Windows
```bash
npm run electron:build:win
```

### macOS
```bash
npm run electron:build:mac
```

### Linux
```bash
npm run electron:build:linux
```

## 构建产物

构建完成后，应用会在 `webui-frontend/release/` 目录下。

## 更多信息

详细文档请参考：[BUILD_GUIDE.md](./BUILD_GUIDE.md)

