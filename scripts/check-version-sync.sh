#!/bin/bash

# 版本同步检查脚本
# 用于验证 GitHub 和 npm 之间的版本是否同步

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

# 获取本地 package.json 版本
LOCAL_VERSION=$(node -p "require('./package.json').version")
log_info "本地 package.json 版本: $LOCAL_VERSION"

# 获取 npm 上的最新版本
log_info "检查 npm 上的版本..."
NPM_LATEST=$(npm view pixivflow version 2>/dev/null || echo "")
if [[ -z "$NPM_LATEST" ]]; then
    log_error "无法获取 npm 版本，请检查网络连接或包名"
    exit 1
fi
log_info "npm 最新版本: $NPM_LATEST"

# 检查指定版本是否在 npm 上
NPM_VERSION_EXISTS=$(npm view pixivflow@$LOCAL_VERSION version 2>/dev/null || echo "")
if [[ -n "$NPM_VERSION_EXISTS" ]]; then
    log_success "版本 $LOCAL_VERSION 已在 npm 上发布"
else
    log_warn "版本 $LOCAL_VERSION 未在 npm 上发布"
fi

# 获取 GitHub 上的标签
log_info "检查 GitHub 上的标签..."
GITHUB_TAG="v$LOCAL_VERSION"
if git ls-remote --tags origin | grep -q "refs/tags/$GITHUB_TAG"; then
    log_success "标签 $GITHUB_TAG 已在 GitHub 上存在"
    GITHUB_TAG_EXISTS=true
else
    log_warn "标签 $GITHUB_TAG 未在 GitHub 上找到"
    GITHUB_TAG_EXISTS=false
fi

# 检查本地标签
if git rev-parse "$GITHUB_TAG" >/dev/null 2>&1; then
    log_success "标签 $GITHUB_TAG 在本地存在"
    LOCAL_TAG_EXISTS=true
else
    log_warn "标签 $GITHUB_TAG 在本地不存在"
    LOCAL_TAG_EXISTS=false
fi

# 汇总结果
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 版本同步状态报告"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 版本信息:"
echo "   - package.json: $LOCAL_VERSION"
echo "   - npm 最新版本: $NPM_LATEST"
echo "   - npm 当前版本: ${NPM_VERSION_EXISTS:-未发布}"
echo ""
echo "🏷️  标签信息:"
echo "   - GitHub 标签 ($GITHUB_TAG): $([ "$GITHUB_TAG_EXISTS" = true ] && echo "✅ 存在" || echo "❌ 不存在")"
echo "   - 本地标签 ($GITHUB_TAG): $([ "$LOCAL_TAG_EXISTS" = true ] && echo "✅ 存在" || echo "❌ 不存在")"
echo ""

# 检查额外的标签（不在 npm 上的版本）- 只检查最近 5 个版本
log_info "检查额外的标签（最近 5 个版本）..."
EXTRA_TAGS=()
RECENT_TAGS=$(git tag -l "v2.*" | sort -V | tail -5)
for tag in $RECENT_TAGS; do
    # 提取版本号（去掉 v 前缀）
    tag_version="${tag#v}"
    # 检查这个版本是否在 npm 上
    npm_tag_exists=$(npm view pixivflow@$tag_version version 2>/dev/null || echo "")
    if [[ -z "$npm_tag_exists" ]]; then
        EXTRA_TAGS+=("$tag (npm 上不存在)")
    fi
done

# 检查是否有标签指向的版本与 package.json 不一致 - 只检查当前版本和最近 3 个版本
log_info "检查标签版本一致性（当前版本和最近 3 个版本）..."
INCONSISTENT_TAGS=()
TAGS_TO_CHECK=$(echo -e "$GITHUB_TAG\n$(git tag -l "v2.*" | sort -V | tail -3)" | sort -u -V)
for tag in $TAGS_TO_CHECK; do
    tag_version="${tag#v}"
    # 检查标签指向的提交中的 package.json 版本
    tag_package_version=$(git show $tag:package.json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "")
    if [[ -n "$tag_package_version" ]] && [[ "$tag_package_version" != "$tag_version" ]]; then
        INCONSISTENT_TAGS+=("$tag (标签版本: $tag_version, package.json: $tag_package_version)")
    fi
done

# 同步状态检查
SYNC_STATUS=true
ISSUES=()

if [[ "$LOCAL_VERSION" != "$NPM_LATEST" ]] && [[ -z "$NPM_VERSION_EXISTS" ]]; then
    SYNC_STATUS=false
    ISSUES+=("本地版本 $LOCAL_VERSION 未在 npm 上发布")
fi

if [[ "$GITHUB_TAG_EXISTS" = false ]]; then
    SYNC_STATUS=false
    ISSUES+=("GitHub 标签 $GITHUB_TAG 不存在")
fi

if [[ "$LOCAL_TAG_EXISTS" = false ]]; then
    SYNC_STATUS=false
    ISSUES+=("本地标签 $GITHUB_TAG 不存在")
fi

# 检查额外标签
if [[ ${#EXTRA_TAGS[@]} -gt 0 ]]; then
    SYNC_STATUS=false
    for extra_tag in "${EXTRA_TAGS[@]}"; do
        ISSUES+=("额外标签 $extra_tag")
    done
fi

# 检查不一致标签
if [[ ${#INCONSISTENT_TAGS[@]} -gt 0 ]]; then
    SYNC_STATUS=false
    for inconsistent_tag in "${INCONSISTENT_TAGS[@]}"; do
        ISSUES+=("版本不一致: $inconsistent_tag")
    done
fi

# 显示结果
if [[ "$SYNC_STATUS" = true ]]; then
    log_success "✅ 版本同步状态: 正常"
    echo ""
    echo "所有版本和标签都已同步！"
else
    log_error "❌ 版本同步状态: 异常"
    echo ""
    echo "发现以下问题:"
    for issue in "${ISSUES[@]}"; do
        echo "   - $issue"
    done
    echo ""
    echo "建议操作:"
    if [[ -z "$NPM_VERSION_EXISTS" ]]; then
        echo "   1. 运行发布脚本: ./scripts/publish.sh"
    fi
    if [[ "$GITHUB_TAG_EXISTS" = false ]] || [[ "$LOCAL_TAG_EXISTS" = false ]]; then
        echo "   2. 创建并推送标签: git tag -a $GITHUB_TAG -m \"v$LOCAL_VERSION\" && git push --tags"
    fi
    if [[ ${#EXTRA_TAGS[@]} -gt 0 ]]; then
        echo "   3. 删除额外标签:"
        for extra_tag in "${EXTRA_TAGS[@]}"; do
            tag_name=$(echo "$extra_tag" | cut -d' ' -f1)
            echo "      - git tag -d $tag_name && git push origin :refs/tags/$tag_name"
        done
    fi
    if [[ ${#INCONSISTENT_TAGS[@]} -gt 0 ]]; then
        echo "   4. 修复不一致的标签（删除或重新创建）"
    fi
    exit 1
fi

echo ""
echo "🔗 相关链接:"
echo "   - npm: https://www.npmjs.com/package/pixivflow"
echo "   - GitHub: https://github.com/zoidberg-xgd/PixivFlow"
echo "   - Releases: https://github.com/zoidberg-xgd/PixivFlow/releases"
echo ""

