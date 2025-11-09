#!/bin/bash

# Electron 构建脚本 - 带详细进度显示
# 参考 VSCode、Obsidian 等开源项目的最佳实践

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 切换到脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    log_error "请在 webui-frontend 目录下运行此脚本"
    exit 1
fi

# 设置代理（如果提供）
if [ -n "$1" ]; then
    export https_proxy="$1"
    export http_proxy="$1"
    export all_proxy="$1"
    log_info "使用代理: $1"
fi

# 步骤 1: 检查依赖
log_info "步骤 1/5: 检查依赖..."
if [ ! -d "node_modules" ]; then
    log_warn "node_modules 不存在，正在安装依赖..."
    npm install
else
    log_success "依赖已安装"
fi

# 步骤 2: 构建前端
log_info "步骤 2/5: 构建前端 (TypeScript + Vite)..."
npm run build
log_success "前端构建完成"

# 步骤 3: 检查 Electron 安装
log_info "步骤 3/5: 检查 Electron 安装..."
if [ ! -f "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ] && [ ! -f "node_modules/.bin/electron" ]; then
    log_warn "Electron 未正确安装，正在重新安装..."
    log_info "这可能需要几分钟，请耐心等待..."
    npm install electron --force
    log_success "Electron 安装完成"
else
    log_success "Electron 已安装"
fi

# 步骤 4: 检查构建资源
log_info "步骤 4/5: 检查构建资源..."
MISSING_ICONS=()
if [ ! -f "build/icon.icns" ]; then
    MISSING_ICONS+=("icon.icns (macOS)")
fi
if [ ! -f "build/icon.ico" ]; then
    MISSING_ICONS+=("icon.ico (Windows)")
fi
if [ ! -f "build/icon.png" ]; then
    MISSING_ICONS+=("icon.png (Linux)")
fi

if [ ${#MISSING_ICONS[@]} -gt 0 ]; then
    log_warn "缺少以下图标文件（将使用默认图标）:"
    for icon in "${MISSING_ICONS[@]}"; do
        echo "  - $icon"
    done
    log_info "提示: 参考 build/README.md 了解如何创建图标"
else
    log_success "所有图标文件已就绪"
fi

# 检查后端构建
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ ! -d "$PROJECT_ROOT/dist" ]; then
    log_warn "后端未构建，正在构建后端..."
    cd "$PROJECT_ROOT"
    npm run build
    cd "$SCRIPT_DIR"
    log_success "后端构建完成"
else
    log_success "后端已构建"
fi

# 步骤 5: 使用 electron-builder 打包
log_info "步骤 5/5: 使用 electron-builder 打包应用..."
log_info "这可能需要几分钟，请查看下方进度..."

# 设置详细日志
export DEBUG=electron-builder:*
export ELECTRON_BUILDER_CACHE=/tmp/electron-builder-cache

# 根据平台选择构建命令
PLATFORM=$(uname -s)
case "$PLATFORM" in
    Darwin)
        log_info "检测到 macOS，构建 arm64 架构..."
        npx electron-builder --mac --arm64 --config electron-builder.yml 2>&1 | tee /tmp/electron-build.log
        ;;
    Linux)
        log_info "检测到 Linux，构建 x64 架构..."
        npx electron-builder --linux --x64 --config electron-builder.yml 2>&1 | tee /tmp/electron-build.log
        ;;
    MINGW*|MSYS*|CYGWIN*)
        log_info "检测到 Windows，构建 x64 架构..."
        npx electron-builder --win --x64 --config electron-builder.yml 2>&1 | tee /tmp/electron-build.log
        ;;
    *)
        log_error "未知平台: $PLATFORM"
        exit 1
        ;;
esac

# 检查构建结果
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    log_success "构建完成！"
    log_info "输出目录: release/"
    ls -lh release/ 2>/dev/null || log_warn "请检查 release/ 目录"
else
    log_error "构建失败，请查看日志: /tmp/electron-build.log"
    exit 1
fi

