#!/bin/bash

# 一键发布和清理脚本
# 1. 弃用 npm 上的旧版本（只保留最新版本）
# 2. 清理 GitHub 上的旧 tags（只保留最新版本）
# 3. 推送当前版本到 GitHub
# 使用方法: ./scripts/publish-and-cleanup.sh

set -e

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

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "当前版本: $CURRENT_VERSION"

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    log_warn "检测到未提交的更改"
    read -p "是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "已取消"
        exit 1
    fi
fi

# 检查是否已登录 npm
log_info "检查 npm 登录状态..."
if ! npm whoami &>/dev/null; then
    log_error "未登录 npm，请先运行: npm login"
    exit 1
fi
NPM_USER=$(npm whoami)
log_success "已登录 npm: $NPM_USER"

# 步骤 1: 弃用 npm 上的旧版本
log_section "步骤 1: 弃用 npm 上的旧版本（只保留最新版本）"
log_info "将弃用所有旧版本，只保留 $CURRENT_VERSION"
read -p "确认继续？(y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "获取所有版本..."
    VERSIONS=$(npm view pixivflow versions --json 2>/dev/null | tr -d '[],"' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sort -Vr)
    VERSIONS_ARRAY=($VERSIONS)
    TOTAL=${#VERSIONS_ARRAY[@]}
    
    if [ $TOTAL -le 1 ]; then
        log_info "只有一个版本，无需弃用"
    else
        DEPRECATION_MESSAGE="此版本已废弃，请升级到最新版本 $CURRENT_VERSION"
        SUCCESS_COUNT=0
        FAIL_COUNT=0
        
        # 跳过第一个（最新版本），弃用其余的
        for ((i=1; i<TOTAL; i++)); do
            version=${VERSIONS_ARRAY[$i]}
            log_info "废弃版本: $version"
            
            if npm deprecate "pixivflow@$version" "$DEPRECATION_MESSAGE" 2>/dev/null; then
                log_success "✅ 成功废弃: $version"
                SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            else
                log_warn "⚠️  废弃失败: $version（可能已经废弃）"
                FAIL_COUNT=$((FAIL_COUNT + 1))
            fi
        done
        
        log_success "✅ npm 版本弃用完成（成功: $SUCCESS_COUNT, 失败: $FAIL_COUNT）"
    fi
else
    log_info "跳过 npm 版本弃用"
fi

# 步骤 2: 清理 GitHub 上的旧 tags
log_section "步骤 2: 清理 GitHub 上的旧 tags（只保留最新版本）"
log_info "将删除所有旧版本的 tags，只保留 v$CURRENT_VERSION"
read -p "确认继续？(y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "运行清理脚本..."
    if ./scripts/cleanup-github-tags.sh; then
        log_success "✅ GitHub tags 清理完成"
    else
        log_warn "⚠️  GitHub tags 清理可能失败，继续执行..."
    fi
else
    log_info "跳过 GitHub tags 清理"
fi

# 步骤 3: 推送当前版本到 GitHub
log_section "步骤 3: 推送当前版本到 GitHub"
log_info "将推送代码和最新版本的 tag (v$CURRENT_VERSION)"

# 检查当前 tag 是否存在
LATEST_TAG="v$CURRENT_VERSION"
if git rev-parse "$LATEST_TAG" >/dev/null 2>&1; then
    log_info "标签 $LATEST_TAG 已存在"
else
    log_warn "标签 $LATEST_TAG 不存在，将创建它"
    read -p "是否创建并推送标签？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -a "$LATEST_TAG" -m "v$CURRENT_VERSION"
        log_success "已创建标签 $LATEST_TAG"
    else
        log_info "跳过标签创建"
    fi
fi

read -p "确认推送到 GitHub？(y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "推送代码..."
    git push
    
    if git rev-parse "$LATEST_TAG" >/dev/null 2>&1; then
        log_info "推送标签 $LATEST_TAG..."
        git push origin "$LATEST_TAG"
    fi
    
    log_success "✅ 已推送到 GitHub"
else
    log_info "跳过 GitHub 推送"
fi

# 完成
log_section "完成"
log_success "🎉 所有操作完成！"
echo ""
log_info "当前状态:"
echo "  - 版本: $CURRENT_VERSION"
echo "  - npm: 已弃用旧版本（只保留最新）"
echo "  - GitHub tags: 已清理（只保留最新）"
echo "  - GitHub 代码: 已推送"
echo ""

