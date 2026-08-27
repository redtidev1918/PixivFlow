#!/bin/bash

# 批量为现有标签创建 GitHub Release
# 使用方法: ./scripts/create-releases-for-tags.sh

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

REPO="redtidev1918/PixivFlow"

log_info "批量为现有标签创建 GitHub Release"

# 检查 GitHub CLI 是否安装
if ! command -v gh &> /dev/null; then
    log_error "GitHub CLI (gh) 未安装"
    log_info "请安装: https://cli.github.com/"
    exit 1
fi

# 检查是否已登录 GitHub CLI
if ! gh auth status &> /dev/null; then
    log_error "未登录 GitHub CLI"
    log_info "请运行: gh auth login"
    exit 1
fi

# 获取所有本地标签
log_info "获取所有本地标签..."
TAGS=$(git tag -l "v*" | sort -V)

if [ -z "$TAGS" ]; then
    log_warn "未找到任何标签"
    exit 0
fi

# 获取所有远程标签
log_info "获取所有远程标签..."
REMOTE_TAGS=$(git ls-remote --tags origin | grep -o 'refs/tags/v[0-9].*' | sed 's|refs/tags/||' | sort -V)

# 检查哪些标签还没有 Release
TAGS_WITHOUT_RELEASE=()
for tag in $TAGS; do
    if ! gh release view "$tag" --repo "$REPO" &>/dev/null; then
        # 检查标签是否已推送到远程
        if echo "$REMOTE_TAGS" | grep -q "^$tag$"; then
            TAGS_WITHOUT_RELEASE+=("$tag")
        else
            log_warn "标签 $tag 未推送到远程，跳过"
        fi
    else
        log_info "标签 $tag 已有 Release，跳过"
    fi
done

if [ ${#TAGS_WITHOUT_RELEASE[@]} -eq 0 ]; then
    log_success "所有标签都已创建 Release"
    exit 0
fi

log_info "找到 ${#TAGS_WITHOUT_RELEASE[@]} 个标签需要创建 Release:"
for tag in "${TAGS_WITHOUT_RELEASE[@]}"; do
    echo "  - $tag"
done
echo ""

read -p "是否批量创建这些 Release？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "已取消"
    exit 0
fi

# 批量创建 Release
SUCCESS_COUNT=0
FAIL_COUNT=0

for tag in "${TAGS_WITHOUT_RELEASE[@]}"; do
    echo ""
    log_info "为标签 $tag 创建 Release..."
    
    if [ -f "./scripts/create-release.sh" ]; then
        # 提取版本号（移除 'v' 前缀）
        VERSION=${tag#v}
        if ./scripts/create-release.sh "$VERSION"; then
            log_success "✅ 成功创建 Release: $tag"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            log_error "❌ 创建 Release 失败: $tag"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    else
        log_error "create-release.sh 脚本不存在"
        exit 1
    fi
    
    # 短暂延迟，避免请求过快
    sleep 1
done

echo ""
log_success "🎉 批量创建完成！"
log_info "成功: $SUCCESS_COUNT, 失败: $FAIL_COUNT"
echo ""



