#!/bin/bash

# 全平台 Electron 构建脚本
# 支持构建 Windows、macOS 和 Linux 版本
# 
# 使用方法:
#   ./build-all-platforms.sh [平台] [架构]
# 
# 平台选项:
#   all     - 构建所有平台（默认）
#   win     - 仅构建 Windows
#   mac     - 仅构建 macOS
#   linux   - 仅构建 Linux
#
# 架构选项（仅在指定单个平台时有效）:
#   x64     - x64 架构（默认）
#   arm64   - ARM64 架构
#   ia32    - 32位架构（仅 Windows）
#   all     - 所有支持的架构

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# 切换到脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    log_error "请在 webui-frontend 目录下运行此脚本"
    exit 1
fi

# 获取参数
PLATFORM=${1:-all}
ARCH=${2:-all}

log_info "🚀 开始构建 PixivFlow Electron 应用"
log_info "📁 工作目录: $SCRIPT_DIR"
log_info "🖥️  目标平台: $PLATFORM"
log_info "🏗️  目标架构: $ARCH"

# 步骤 1: 检查依赖
log_step "步骤 1/5: 检查依赖..."
if [ ! -d "node_modules" ]; then
    log_warn "node_modules 不存在，正在安装依赖..."
    npm install
else
    log_success "依赖已安装"
fi

# 步骤 2: 构建前端
log_step "步骤 2/5: 构建前端 (TypeScript + Vite)..."
npm run build
log_success "前端构建完成"

# 步骤 3: 检查并构建后端
log_step "步骤 3/5: 检查并构建后端..."
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ ! -d "$PROJECT_ROOT/dist" ] || [ -z "$(ls -A "$PROJECT_ROOT/dist" 2>/dev/null)" ]; then
    log_warn "后端未构建，正在构建后端..."
    cd "$PROJECT_ROOT"
    npm install --production=false
    npm run build
    cd "$SCRIPT_DIR"
    log_success "后端构建完成"
else
    log_success "后端已构建"
fi

# 步骤 4: 检查构建资源
log_step "步骤 4/5: 检查构建资源..."
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

# 步骤 5: 构建 Electron 应用
log_step "步骤 5/5: 使用 electron-builder 打包应用..."
log_info "这可能需要几分钟，请查看下方进度..."

# 设置构建环境变量
export ELECTRON_BUILDER_CACHE=/tmp/electron-builder-cache

# 构建函数
build_platform() {
    local platform=$1
    local arch=$2
    
    log_info "构建 $platform ($arch) 版本..."
    
    case "$platform" in
        win)
            if [ "$arch" = "all" ]; then
                npx electron-builder --win --x64 --ia32 --arm64
            else
                npx electron-builder --win --$arch
            fi
            ;;
        mac)
            if [ "$arch" = "all" ]; then
                npx electron-builder --mac --arm64 --x64
            else
                npx electron-builder --mac --$arch
            fi
            ;;
        linux)
            if [ "$arch" = "all" ]; then
                npx electron-builder --linux --x64 --arm64
            else
                npx electron-builder --linux --$arch
            fi
            ;;
        *)
            log_error "未知平台: $platform"
            return 1
            ;;
    esac
}

# 执行构建
BUILD_SUCCESS=true
BUILD_COUNT=0
FAILED_BUILDS=()

if [ "$PLATFORM" = "all" ]; then
    # 构建所有平台
    log_info "构建所有平台的所有架构..."
    
    # 检测当前平台，优先构建当前平台
    CURRENT_PLATFORM=$(uname -s)
    case "$CURRENT_PLATFORM" in
        Darwin)
            log_info "当前在 macOS 上，优先构建 macOS..."
            if build_platform mac all; then
                ((BUILD_COUNT++))
                log_success "macOS 构建完成"
            else
                BUILD_SUCCESS=false
                FAILED_BUILDS+=("macOS")
            fi
            ;;
        Linux)
            log_info "当前在 Linux 上，优先构建 Linux..."
            if build_platform linux all; then
                ((BUILD_COUNT++))
                log_success "Linux 构建完成"
            else
                BUILD_SUCCESS=false
                FAILED_BUILDS+=("Linux")
            fi
            ;;
        MINGW*)
            log_info "当前在 Windows 上 (MINGW)，优先构建 Windows..."
            if build_platform win all; then
                ((BUILD_COUNT++))
                log_success "Windows 构建完成"
            else
                BUILD_SUCCESS=false
                FAILED_BUILDS+=("Windows")
            fi
            ;;
        MSYS*)
            log_info "当前在 Windows 上 (MSYS)，优先构建 Windows..."
            if build_platform win all; then
                ((BUILD_COUNT++))
                log_success "Windows 构建完成"
            else
                BUILD_SUCCESS=false
                FAILED_BUILDS+=("Windows")
            fi
            ;;
        CYGWIN*)
            log_info "当前在 Windows 上 (CYGWIN)，优先构建 Windows..."
            if build_platform win all; then
                ((BUILD_COUNT++))
                log_success "Windows 构建完成"
            else
                BUILD_SUCCESS=false
                FAILED_BUILDS+=("Windows")
            fi
            ;;
    esac
    
    # 构建其他平台（如果可能）
    log_info "尝试构建其他平台..."
    
    # Windows 构建（在 macOS/Linux 上需要 Wine）
    case "$CURRENT_PLATFORM" in
        MINGW*|MSYS*|CYGWIN*)
            # 已经在 Windows 上，跳过
            log_info "已在 Windows 上，跳过跨平台 Windows 构建"
            ;;
        *)
            log_warn "Windows 构建需要 Wine（如果已安装）"
            if command -v wine &> /dev/null; then
                if build_platform win x64; then
                    ((BUILD_COUNT++))
                    log_success "Windows (x64) 构建完成"
                else
                    log_warn "Windows 构建失败（可能需要更多配置）"
                    FAILED_BUILDS+=("Windows")
                fi
            else
                log_warn "未安装 Wine，跳过 Windows 构建"
                log_info "提示: 在 macOS/Linux 上构建 Windows 应用需要 Wine"
            fi
            ;;
    esac
    
    # Linux 构建（在 macOS 上可能需要 Docker）
    if [ "$CURRENT_PLATFORM" = "Darwin" ]; then
        log_warn "在 macOS 上构建 Linux 应用可能需要 Docker"
        if build_platform linux x64; then
            ((BUILD_COUNT++))
            log_success "Linux (x64) 构建完成"
        else
            log_warn "Linux 构建失败（可能需要更多配置）"
            FAILED_BUILDS+=("Linux")
        fi
    fi
    
    # macOS 构建（只能在 macOS 上构建）
    if [ "$CURRENT_PLATFORM" != "Darwin" ]; then
        log_warn "macOS 应用只能在 macOS 上构建"
        log_info "跳过 macOS 构建"
    fi
    
else
    # 构建指定平台
    if build_platform "$PLATFORM" "$ARCH"; then
        ((BUILD_COUNT++))
        log_success "$PLATFORM ($ARCH) 构建完成"
    else
        BUILD_SUCCESS=false
        FAILED_BUILDS+=("$PLATFORM ($ARCH)")
    fi
fi

# 检查构建结果
echo ""
log_step "构建完成！"
log_info "构建数量: $BUILD_COUNT"

if [ ${#FAILED_BUILDS[@]} -gt 0 ]; then
    log_warn "以下构建失败:"
    for build in "${FAILED_BUILDS[@]}"; do
        echo "  - $build"
    done
fi

if [ -d "release" ]; then
    log_success "输出目录: release/"
    echo ""
    log_info "构建产物:"
    ls -lh release/ 2>/dev/null | tail -n +2 || log_warn "请检查 release/ 目录"
    echo ""
    
    # 计算总大小
    TOTAL_SIZE=$(du -sh release/ 2>/dev/null | cut -f1 || echo "未知")
    log_info "总大小: $TOTAL_SIZE"
fi

if [ "$BUILD_SUCCESS" = true ] && [ ${#FAILED_BUILDS[@]} -eq 0 ]; then
    log_success "🎉 所有构建成功！应用已准备好发布"
    exit 0
elif [ $BUILD_COUNT -gt 0 ]; then
    log_warn "⚠️  部分构建成功，部分构建失败"
    exit 0
else
    log_error "❌ 所有构建失败"
    exit 1
fi

