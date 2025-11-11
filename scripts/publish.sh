#!/bin/bash

# npm 包发布脚本
# 使用方法: ./scripts/publish.sh [patch|minor|major|version]

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

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "当前版本: $CURRENT_VERSION"

# 确定版本类型
VERSION_TYPE=${1:-patch}

if [[ "$VERSION_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    NEW_VERSION=$VERSION_TYPE
    log_info "指定版本: $NEW_VERSION"
else
    case $VERSION_TYPE in
        patch|minor|major)
            log_info "版本类型: $VERSION_TYPE"
            ;;
        *)
            log_error "无效的版本类型: $VERSION_TYPE"
            log_info "使用方法: $0 [patch|minor|major|version]"
            log_info "示例: $0 patch  (2.0.0 -> 2.0.1)"
            log_info "示例: $0 minor  (2.0.0 -> 2.1.0)"
            log_info "示例: $0 major  (2.0.0 -> 3.0.0)"
            log_info "示例: $0 2.0.1  (直接指定版本)"
            exit 1
            ;;
    esac
fi

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    log_warn "检测到未提交的更改"
    read -p "是否继续发布？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "已取消发布"
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

# 运行测试
log_info "运行测试..."
if npm test 2>/dev/null; then
    log_success "测试通过"
else
    log_warn "测试失败或未配置测试，继续发布..."
fi

# 构建项目
log_info "构建项目..."
npm run build
log_success "构建完成"

# 更新版本号（使用 --no-git-tag-version 避免自动创建标签）
if [[ -n "$NEW_VERSION" ]]; then
    log_info "更新版本号到: $NEW_VERSION"
    npm version $NEW_VERSION --no-git-tag-version
else
    log_info "更新版本号 ($VERSION_TYPE)..."
    npm version $VERSION_TYPE --no-git-tag-version
fi

# 获取新版本号
NEW_VERSION=$(node -p "require('./package.json').version")
log_success "新版本: $NEW_VERSION"

# 验证新版本号格式
if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log_error "无效的版本号格式: $NEW_VERSION"
    exit 1
fi

# 验证版本号是否递增
if [[ "$(printf '%s\n' "$CURRENT_VERSION" "$NEW_VERSION" | sort -V | head -n1)" != "$CURRENT_VERSION" ]] && [[ "$CURRENT_VERSION" != "$NEW_VERSION" ]]; then
    log_error "新版本 $NEW_VERSION 必须大于当前版本 $CURRENT_VERSION"
    exit 1
fi

# 检查该版本是否已在 npm 上发布（提前检查）
log_info "检查版本是否已在 npm 上发布..."
if npm view pixivflow@$NEW_VERSION version &>/dev/null; then
    log_error "版本 $NEW_VERSION 已在 npm 上发布，请使用下一个版本号"
    # 恢复版本号
    git checkout package.json package-lock.json 2>/dev/null || true
    exit 1
fi

# 提交版本更改
log_info "提交版本更改..."
git add package.json
# 如果 package-lock.json 存在且未被忽略，则添加它
if git check-ignore package-lock.json >/dev/null 2>&1; then
    log_info "package-lock.json 被 .gitignore 忽略，跳过"
else
    git add package-lock.json 2>/dev/null || log_warn "package-lock.json 可能不存在"
fi
git commit -m "chore: bump version to $NEW_VERSION" || log_warn "版本更改可能已提交或无需提交"

# 检查并处理已存在的标签
TAG_NAME="v$NEW_VERSION"
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    log_warn "标签 $TAG_NAME 已存在"
    
    # 验证标签指向的提交中的 package.json 版本是否匹配
    TAG_PACKAGE_VERSION=$(git show $TAG_NAME:package.json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "")
    if [[ -n "$TAG_PACKAGE_VERSION" ]] && [[ "$TAG_PACKAGE_VERSION" != "$NEW_VERSION" ]]; then
        log_error "标签 $TAG_NAME 指向的 package.json 版本 ($TAG_PACKAGE_VERSION) 与新版本 ($NEW_VERSION) 不匹配"
        log_info "这是一个不一致的标签，必须删除并重新创建"
        read -p "是否删除旧标签并重新创建？(y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "删除本地标签 $TAG_NAME..."
            git tag -d "$TAG_NAME" 2>/dev/null || true
            log_info "删除远程标签 $TAG_NAME..."
            git push origin ":refs/tags/$TAG_NAME" 2>/dev/null || true
            log_success "已删除旧标签"
        else
            log_error "无法继续：标签版本不一致"
            exit 1
        fi
    else
        log_warn "版本 $NEW_VERSION 未在 npm 上发布，但标签已存在"
        read -p "是否删除旧标签并重新创建？(y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "删除本地标签 $TAG_NAME..."
            git tag -d "$TAG_NAME" 2>/dev/null || true
            log_info "删除远程标签 $TAG_NAME..."
            git push origin ":refs/tags/$TAG_NAME" 2>/dev/null || true
            log_success "已删除旧标签"
        else
            log_info "跳过标签创建，使用现有标签"
        fi
    fi
fi

# 创建新标签（如果不存在或已删除）
if ! git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    log_info "创建新标签 $TAG_NAME..."
    git tag -a "$TAG_NAME" -m "v$NEW_VERSION"
    log_success "已创建标签 $TAG_NAME"
    
    # 验证标签创建后，package.json 版本与标签一致
    TAG_PACKAGE_VERSION=$(git show $TAG_NAME:package.json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "")
    if [[ "$TAG_PACKAGE_VERSION" != "$NEW_VERSION" ]]; then
        log_error "标签创建后验证失败：标签版本 ($TAG_NAME) 与 package.json ($TAG_PACKAGE_VERSION) 不匹配"
        git tag -d "$TAG_NAME" 2>/dev/null || true
        exit 1
    fi
fi

# 确认发布
log_warn "准备发布 pixivflow@$NEW_VERSION 到 npm"
read -p "确认发布？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "已取消发布"
    # 恢复版本号和提交
    git reset --soft HEAD~1 2>/dev/null || true
    git checkout package.json package-lock.json 2>/dev/null || true
    # 删除可能创建的标签
    if git rev-parse "$TAG_NAME" >/dev/null 2>&1 && [[ "$TAG_NAME" == "v$NEW_VERSION" ]]; then
        git tag -d "$TAG_NAME" 2>/dev/null || true
    fi
    exit 1
fi

# 发布到 npm
# 使用 --ignore-scripts 跳过 prepublishOnly 钩子，因为我们已经构建过了
log_info "发布到 npm..."
if npm publish --access public --ignore-scripts; then
    log_success "✅ 成功发布 pixivflow@$NEW_VERSION 到 npm"
else
    log_error "发布失败"
    exit 1
fi

# 验证 npm 发布
log_info "验证 npm 发布..."
sleep 2  # 等待 npm 索引更新
NPM_PUBLISHED_VERSION=$(npm view pixivflow@$NEW_VERSION version 2>/dev/null || echo "")
if [[ "$NPM_PUBLISHED_VERSION" == "$NEW_VERSION" ]]; then
    log_success "✅ npm 版本验证通过: $NPM_PUBLISHED_VERSION"
else
    log_warn "⚠️  npm 版本验证失败，可能还在索引中..."
    log_info "   期望版本: $NEW_VERSION"
    log_info "   实际版本: ${NPM_PUBLISHED_VERSION:-未找到}"
fi

# 推送代码和标签（只推送当前版本的 tag，避免推送所有旧 tags）
log_info "推送代码和标签到 GitHub..."
git push
git push origin "$TAG_NAME"
log_success "已推送到 GitHub（只推送了当前版本标签 $TAG_NAME）"

# 验证 GitHub 标签
log_info "验证 GitHub 标签..."
if git ls-remote --tags origin | grep -q "refs/tags/v$NEW_VERSION"; then
    log_success "✅ GitHub 标签验证通过: v$NEW_VERSION"
else
    log_warn "⚠️  GitHub 标签验证失败，可能需要等待同步..."
fi

# 运行最终版本同步检查
log_info "运行最终版本同步检查..."
if ./scripts/check-version-sync.sh; then
    log_success "✅ 版本同步检查通过"
else
    log_error "❌ 版本同步检查失败，请手动检查"
    log_info "运行 ./scripts/check-version-sync.sh 查看详细信息"
fi

# 显示发布信息
echo ""
log_success "🎉 发布完成！"
echo ""
echo "📦 包信息:"
echo "   - 名称: pixivflow"
echo "   - 版本: $NEW_VERSION"
echo "   - npm: https://www.npmjs.com/package/pixivflow"
echo "   - GitHub: https://github.com/zoidberg-xgd/PixivFlow"
echo ""
echo "✅ 同步状态:"
echo "   - package.json: $NEW_VERSION"
echo "   - npm: ${NPM_PUBLISHED_VERSION:-验证中...}"
echo "   - GitHub tag: v$NEW_VERSION"
echo ""
echo "📝 下一步:"
echo "   1. 在 GitHub 创建 Release: https://github.com/zoidberg-xgd/PixivFlow/releases/new"
echo "   2. 标签: v$NEW_VERSION"
echo "   3. 标题: v$NEW_VERSION"
echo "   4. 描述: 从 CHANGELOG.md 复制更新内容"
echo ""

