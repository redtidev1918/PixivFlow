# Electron 构建资源

此目录包含 Electron 应用打包所需的资源文件。

## 图标文件

为了构建 Electron 应用，您需要提供以下图标文件：

### Windows
- `icon.ico` - Windows 图标文件（建议尺寸：256x256 或更大，包含多个尺寸）

### macOS
- `icon.icns` - macOS 图标文件（建议尺寸：1024x1024，包含多个尺寸）

### Linux
- `icon.png` - PNG 图标文件（建议尺寸：512x512 或更大）

## 如何创建图标

### 方法 1: 使用在线工具
1. 准备一个 1024x1024 的 PNG 图标
2. 使用在线工具转换：
   - Windows ICO: https://convertio.co/png-ico/
   - macOS ICNS: https://cloudconvert.com/png-to-icns

### 方法 2: 使用命令行工具

#### macOS (需要安装 iconutil)
```bash
# 创建 iconset 目录结构
mkdir icon.iconset
# 添加不同尺寸的图标
cp icon-16x16.png icon.iconset/icon_16x16.png
cp icon-32x32.png icon.iconset/icon_16x16@2x.png
cp icon-32x32.png icon.iconset/icon_32x32.png
cp icon-64x64.png icon.iconset/icon_32x32@2x.png
cp icon-128x128.png icon.iconset/icon_128x128.png
cp icon-256x256.png icon.iconset/icon_128x128@2x.png
cp icon-256x256.png icon.iconset/icon_256x256.png
cp icon-512x512.png icon.iconset/icon_256x256@2x.png
cp icon-512x512.png icon.iconset/icon_512x512.png
cp icon-1024x1024.png icon.iconset/icon_512x512@2x.png

# 转换为 icns
iconutil -c icns icon.iconset -o icon.icns
```

#### Windows (使用 ImageMagick)
```bash
magick convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

## 临时解决方案

如果没有图标文件，electron-builder 会使用默认图标。但建议为应用创建自定义图标。

## 文件清单

- ✅ `entitlements.mac.plist` - macOS 权限配置文件
- ⚠️ `icon.ico` - Windows 图标（需要创建）
- ⚠️ `icon.icns` - macOS 图标（需要创建）
- ⚠️ `icon.png` - Linux 图标（需要创建）


