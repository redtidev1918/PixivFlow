#!/bin/bash

# GitHub Release 自动创建脚本
# 使用方法: ./scripts/create-release.sh [version]
# 如果不提供版本号，将使用 package.json 中的当前版本

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

# 获取版本号
if [ -n "$1" ]; then
    VERSION=$1
    # 移除 'v' 前缀（如果存在）
    VERSION=${VERSION#v}
else
    VERSION=$(node -p "require('./package.json').version")
fi

TAG_NAME="v$VERSION"
REPO="zoidberg-xgd/PixivFlow"
CHANGELOG_PATH="docs/project/CHANGELOG.md"

log_info "准备为版本 $VERSION 创建 GitHub Release"

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

# 检查标签是否存在
if ! git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    log_error "标签 $TAG_NAME 不存在"
    log_info "请先创建标签: git tag -a $TAG_NAME -m \"v$VERSION\""
    exit 1
fi

# 检查标签是否已推送到远程
if ! git ls-remote --tags origin | grep -q "refs/tags/$TAG_NAME"; then
    log_warn "标签 $TAG_NAME 未推送到远程"
    log_info "推送标签: git push origin $TAG_NAME"
    read -p "是否现在推送标签？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push origin "$TAG_NAME"
        log_success "已推送标签"
    else
        log_error "无法创建 Release：标签未推送"
        exit 1
    fi
fi

# 检查 Release 是否已存在
if gh release view "$TAG_NAME" --repo "$REPO" &>/dev/null; then
    log_warn "Release $TAG_NAME 已存在"
    read -p "是否更新现有 Release？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "已取消"
        exit 0
    fi
    UPDATE_EXISTING=true
else
    UPDATE_EXISTING=false
fi

# 从 CHANGELOG.md 提取版本信息
RELEASE_NOTES=""
if [ -f "$CHANGELOG_PATH" ]; then
    log_info "从 CHANGELOG.md 提取版本信息..."
    
    # 查找版本块（格式：## [版本号] - 日期）
    VERSION_PATTERN="^## \\[$VERSION\\]"
    
    # 提取从当前版本到下一个版本之间的内容
    IN_VERSION_BLOCK=false
    VERSION_CONTENT=""
    
    while IFS= read -r line; do
        # 检查是否是当前版本的标题
        if [[ "$line" =~ ^##\ \[$VERSION\] ]]; then
            IN_VERSION_BLOCK=true
            # 提取日期（如果有）
            if [[ "$line" =~ -[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
                RELEASE_DATE="${BASH_REMATCH[1]}"
            fi
            continue
        fi
        
        # 如果遇到下一个版本标题，停止
        if [[ "$IN_VERSION_BLOCK" == true ]] && [[ "$line" =~ ^##\ \[ ]]; then
            break
        fi
        
        # 收集版本内容
        if [[ "$IN_VERSION_BLOCK" == true ]]; then
            # 跳过空行和分隔线
            if [[ ! "$line" =~ ^---$ ]] && [[ -n "$line" || -n "$VERSION_CONTENT" ]]; then
                VERSION_CONTENT+="$line"$'\n'
            fi
        fi
    done < "$CHANGELOG_PATH"
    
    if [ -n "$VERSION_CONTENT" ]; then
        RELEASE_NOTES=$(echo "$VERSION_CONTENT" | sed '/^$/d' | head -100)
        log_success "已从 CHANGELOG.md 提取版本信息"
    else
        log_warn "未在 CHANGELOG.md 中找到版本 $VERSION 的信息"
    fi
fi

# 如果没有从 CHANGELOG 提取到内容，使用默认内容
if [ -z "$RELEASE_NOTES" ]; then
    RELEASE_NOTES="Release v$VERSION

查看完整更新日志: https://github.com/$REPO/blob/master/$CHANGELOG_PATH"
fi

# 创建 Release 标题
RELEASE_TITLE="v$VERSION"

# 显示将要创建的内容
echo ""
log_info "Release 信息:"
echo "  标题: $RELEASE_TITLE"
echo "  标签: $TAG_NAME"
echo "  仓库: $REPO"
echo ""
log_info "Release 说明:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$RELEASE_NOTES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 确认创建
if [ "$UPDATE_EXISTING" == true ]; then
    log_warn "准备更新现有 Release: $TAG_NAME"
else
    log_warn "准备创建新 Release: $TAG_NAME"
fi
read -p "确认继续？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "已取消"
    exit 0
fi

# 创建或更新 Release
if [ "$UPDATE_EXISTING" == true ]; then
    log_info "更新 Release..."
    if gh release edit "$TAG_NAME" \
        --repo "$REPO" \
        --title "$RELEASE_TITLE" \
        --notes "$RELEASE_NOTES"; then
        log_success "✅ 成功更新 Release: $TAG_NAME"
    else
        log_error "更新 Release 失败"
        exit 1
    fi
else
    log_info "创建 Release..."
    if gh release create "$TAG_NAME" \
        --repo "$REPO" \
        --title "$RELEASE_TITLE" \
        --notes "$RELEASE_NOTES"; then
        log_success "✅ 成功创建 Release: $TAG_NAME"
    else
        log_error "创建 Release 失败"
        exit 1
    fi
fi

# 显示 Release 链接
RELEASE_URL="https://github.com/$REPO/releases/tag/$TAG_NAME"
echo ""
log_success "🎉 Release 创建完成！"
echo ""
echo "🔗 Release 链接: $RELEASE_URL"
echo ""



