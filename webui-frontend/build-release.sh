#!/bin/bash

# 快速构建和发布脚本
# 使用方法: ./build-release.sh [platform]
# platform: mac, win, linux (默认: mac)

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 获取平台参数
PLATFORM=${1:-mac}

log_info "🚀 开始构建 PixivFlow Electron 应用"
log_info "📁 项目根目录: $PROJECT_ROOT"
log_info "📁 脚本目录: $SCRIPT_DIR"
log_info "🖥️  目标平台: $PLATFORM"

# 步骤 1: 检查环境
log_info "步骤 1/4: 检查构建环境..."
cd "$SCRIPT_DIR"
if ! npm run electron:check; then
    log_error "环境检查失败，请修复问题后重试"
    exit 1
fi
log_success "环境检查通过"

# 步骤 2: 构建后端
log_info "步骤 2/4: 构建后端..."
cd "$PROJECT_ROOT"
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
    log_warn "后端未构建，正在构建..."
    npm run build
    log_success "后端构建完成"
else
    log_success "后端已构建，跳过"
fi

# 步骤 3: 构建前端
log_info "步骤 3/4: 构建前端..."
cd "$SCRIPT_DIR"
npm run build
log_success "前端构建完成"

# 步骤 4: 打包 Electron
log_info "步骤 4/4: 打包 Electron 应用..."
log_info "这可能需要几分钟，请耐心等待..."

case "$PLATFORM" in
    mac)
        log_info "构建 macOS (arm64) 版本..."
        npx electron-builder --mac --arm64
        ;;
    mac-x64)
        log_info "构建 macOS (x64) 版本..."
        npx electron-builder --mac --x64
        ;;
    win)
        log_info "构建 Windows 版本..."
        npx electron-builder --win
        ;;
    linux)
        log_info "构建 Linux 版本..."
        npx electron-builder --linux
        ;;
    *)
        log_error "未知平台: $PLATFORM"
        log_info "支持的平台: mac, mac-x64, win, linux"
        exit 1
        ;;
esac

# 检查构建结果
if [ $? -eq 0 ]; then
    log_success "构建完成！"
    log_info "输出目录: $SCRIPT_DIR/release/"
    echo ""
    log_info "构建产物:"
    ls -lh "$SCRIPT_DIR/release/" 2>/dev/null || log_warn "请检查 release/ 目录"
    echo ""
    log_success "🎉 构建成功！应用已准备好发布"
else
    log_error "构建失败，请查看上方错误信息"
    exit 1
fi

