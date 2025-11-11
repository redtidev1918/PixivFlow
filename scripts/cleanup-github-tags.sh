#!/bin/bash

# GitHub Tags 清理脚本
# 只保留最新版本的 tag，删除所有旧版本的 tags
# 使用方法: ./scripts/cleanup-github-tags.sh [--dry-run]

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

# 检查是否是 dry-run 模式
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    log_info "🔍 运行在 DRY-RUN 模式（不会实际删除）"
fi

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
LATEST_TAG="v$CURRENT_VERSION"

log_info "当前版本: $CURRENT_VERSION"
log_info "要保留的标签: $LATEST_TAG"

# 获取所有远程 tags（过滤掉 git 内部引用如 ^{}）
log_info "获取远程 tags..."
REMOTE_TAGS=$(git ls-remote --tags origin | grep -E 'refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$' | sed 's|.*refs/tags/||' | sed 's|[[:space:]].*||' | sort -V)

if [ -z "$REMOTE_TAGS" ]; then
    log_warn "未找到远程 tags"
    exit 0
fi

# 获取所有本地 tags
log_info "获取本地 tags..."
LOCAL_TAGS=$(git tag -l "v*.*.*" | sort -V)

# 找出需要删除的 tags（所有除了最新版本的）
TAGS_TO_DELETE=""
for tag in $REMOTE_TAGS; do
    if [ "$tag" != "$LATEST_TAG" ]; then
        TAGS_TO_DELETE="$TAGS_TO_DELETE $tag"
    fi
done

if [ -z "$TAGS_TO_DELETE" ]; then
    log_success "✅ 没有需要删除的 tags，只保留最新版本 $LATEST_TAG"
    exit 0
fi

# 显示将要删除的 tags
echo ""
log_warn "将要删除的远程 tags:"
for tag in $TAGS_TO_DELETE; do
    echo "  - $tag"
done
echo ""
log_info "将保留的标签: $LATEST_TAG"
echo ""

# 确认删除
if [ "$DRY_RUN" = false ]; then
    log_warn "⚠️  警告: 此操作将删除远程仓库上的旧版本 tags"
    log_info "这些 tags 将被永久删除，但不会影响代码仓库本身"
    read -p "确认删除这些 tags？(yes/N) " -r
    echo
    if [[ ! $REPLY == "yes" ]]; then
        log_info "已取消"
        exit 1
    fi
fi

# 删除远程 tags
DELETED_COUNT=0
FAILED_COUNT=0

for tag in $TAGS_TO_DELETE; do
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] 将删除远程标签: $tag"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    else
        log_info "删除远程标签: $tag"
        if git push origin ":refs/tags/$tag" 2>/dev/null; then
            log_success "✅ 已删除: $tag"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            log_warn "⚠️  删除失败: $tag（可能不存在）"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
    fi
done

# 删除本地 tags（可选，只删除不在远程的）
if [ "$DRY_RUN" = false ]; then
    echo ""
    log_info "清理本地 tags（删除不在远程的旧 tags）..."
    for tag in $LOCAL_TAGS; do
        if [ "$tag" != "$LATEST_TAG" ]; then
            # 检查远程是否还有这个 tag
            if ! git ls-remote --tags origin | grep -q "refs/tags/$tag"; then
                log_info "删除本地标签: $tag"
                git tag -d "$tag" 2>/dev/null || true
            fi
        fi
    done
fi

echo ""
if [ "$DRY_RUN" = true ]; then
    log_success "🎉 DRY-RUN 完成！"
    log_info "将删除 $DELETED_COUNT 个远程 tags"
    log_info "运行不带 --dry-run 参数来实际执行删除"
else
    log_success "🎉 清理完成！"
    log_info "成功删除: $DELETED_COUNT 个 tags"
    if [ $FAILED_COUNT -gt 0 ]; then
        log_warn "失败: $FAILED_COUNT 个 tags"
    fi
    log_info "保留的标签: $LATEST_TAG"
fi
echo ""

