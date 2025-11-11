#!/bin/bash

# npm 包版本管理脚本
# 用于废弃或删除旧版本的 npm 包
# 使用方法: ./scripts/manage-versions.sh [deprecate|unpublish|list]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 包名
PACKAGE_NAME="pixivflow"

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

log_question() {
    echo -e "${CYAN}❓ $1${NC}"
}

# 检查是否已登录 npm
check_npm_login() {
    if ! npm whoami &>/dev/null; then
        log_error "未登录 npm，请先运行: npm login"
        exit 1
    fi
    NPM_USER=$(npm whoami)
    log_success "已登录 npm: $NPM_USER"
}

# 列出所有已发布的版本
list_versions() {
    log_info "获取 $PACKAGE_NAME 的所有版本..."
    
    # 获取所有版本
    VERSIONS=$(npm view $PACKAGE_NAME versions --json 2>/dev/null | tr -d '[],"' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sort -V)
    
    if [ -z "$VERSIONS" ]; then
        log_error "无法获取版本列表，请检查包名是否正确"
        exit 1
    fi
    
    # 获取当前版本
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    
    # 获取最新版本
    LATEST_VERSION=$(npm view $PACKAGE_NAME version 2>/dev/null)
    
    echo ""
    log_info "📦 $PACKAGE_NAME 的所有版本:"
    echo ""
    
    VERSION_COUNT=0
    for version in $VERSIONS; do
        VERSION_COUNT=$((VERSION_COUNT + 1))
        if [ "$version" == "$CURRENT_VERSION" ]; then
            echo -e "  ${GREEN}→ $version (当前版本)${NC}"
        elif [ "$version" == "$LATEST_VERSION" ]; then
            echo -e "  ${CYAN}→ $version (最新版本)${NC}"
        else
            echo -e "  ${YELLOW}  $version${NC}"
        fi
    done
    
    echo ""
    log_info "总共 $VERSION_COUNT 个版本"
    echo ""
}

# 废弃指定版本
deprecate_versions() {
    check_npm_login
    
    list_versions
    
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    LATEST_VERSION=$(npm view $PACKAGE_NAME version 2>/dev/null)
    
    log_question "请输入要废弃的版本（多个版本用空格分隔，或使用范围如 '1.0.0-2.0.0'）:"
    read -r VERSIONS_TO_DEPRECATE
    
    if [ -z "$VERSIONS_TO_DEPRECATE" ]; then
        log_error "未输入版本号"
        exit 1
    fi
    
    log_question "请输入废弃原因（可选，默认: '此版本已废弃，请升级到最新版本'）:"
    read -r DEPRECATION_MESSAGE
    
    if [ -z "$DEPRECATION_MESSAGE" ]; then
        DEPRECATION_MESSAGE="此版本已废弃，请升级到最新版本 $LATEST_VERSION"
    fi
    
    # 处理版本范围或单个版本
    if [[ "$VERSIONS_TO_DEPRECATE" == *"-"* ]] && [[ "$VERSIONS_TO_DEPRECATE" != *" "* ]]; then
        # 版本范围
        log_info "废弃版本范围: $VERSIONS_TO_DEPRECATE"
        log_warn "准备废弃版本范围 $VERSIONS_TO_DEPRECATE"
        read -p "确认废弃？(y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "已取消"
            exit 1
        fi
        
        if npm deprecate "$PACKAGE_NAME@$VERSIONS_TO_DEPRECATE" "$DEPRECATION_MESSAGE"; then
            log_success "✅ 成功废弃版本范围: $VERSIONS_TO_DEPRECATE"
        else
            log_error "废弃失败"
            exit 1
        fi
    else
        # 多个版本
        for version in $VERSIONS_TO_DEPRECATE; do
            # 检查是否是当前版本
            if [ "$version" == "$CURRENT_VERSION" ]; then
                log_warn "⚠️  跳过当前版本 $version（不建议废弃当前版本）"
                continue
            fi
            
            # 检查是否是最新版本
            if [ "$version" == "$LATEST_VERSION" ]; then
                log_warn "⚠️  跳过最新版本 $version（不建议废弃最新版本）"
                continue
            fi
            
            log_info "废弃版本: $version"
            log_warn "准备废弃版本 $version"
            read -p "确认废弃？(y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "跳过版本 $version"
                continue
            fi
            
            if npm deprecate "$PACKAGE_NAME@$version" "$DEPRECATION_MESSAGE"; then
                log_success "✅ 成功废弃版本: $version"
            else
                log_error "废弃版本 $version 失败"
            fi
        done
    fi
    
    echo ""
    log_success "🎉 废弃操作完成！"
    echo ""
    log_info "注意: 废弃的版本仍然可以安装，但会显示警告信息"
    log_info "用户安装时会看到: $DEPRECATION_MESSAGE"
}

# 删除指定版本（仅在满足 npm 政策时）
unpublish_versions() {
    check_npm_login
    
    log_warn "⚠️  警告: npm unpublish 有严格的政策限制"
    echo ""
    log_info "npm unpublish 政策:"
    echo "  1. 发布后 72 小时内可以删除任何版本"
    echo "  2. 超过 72 小时，只有在以下条件下才能删除:"
    echo "     - 没有其他包依赖此版本"
    echo "     - 过去一周下载量 < 300 次"
    echo "     - 只有一个所有者"
    echo ""
    log_warn "⚠️  删除操作不可逆，且删除后需等待 24 小时才能重新发布相同名称的包"
    echo ""
    log_info "💡 建议: 优先使用 'deprecate' 而不是 'unpublish'"
    echo ""
    read -p "确认要继续删除操作？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "已取消"
        exit 1
    fi
    
    list_versions
    
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    LATEST_VERSION=$(npm view $PACKAGE_NAME version 2>/dev/null)
    
    log_question "请输入要删除的版本（多个版本用空格分隔）:"
    read -r VERSIONS_TO_UNPUBLISH
    
    if [ -z "$VERSIONS_TO_UNPUBLISH" ]; then
        log_error "未输入版本号"
        exit 1
    fi
    
    for version in $VERSIONS_TO_UNPUBLISH; do
        # 检查是否是当前版本
        if [ "$version" == "$CURRENT_VERSION" ]; then
            log_warn "⚠️  跳过当前版本 $version（不建议删除当前版本）"
            continue
        fi
        
        # 检查是否是最新版本
        if [ "$version" == "$LATEST_VERSION" ]; then
            log_warn "⚠️  跳过最新版本 $version（不建议删除最新版本）"
            continue
        fi
        
        log_error "准备删除版本: $version"
        read -p "确认删除？此操作不可逆！(yes/N) " -r
        if [[ ! $REPLY == "yes" ]]; then
            log_info "跳过版本 $version"
            continue
        fi
        
        if npm unpublish "$PACKAGE_NAME@$version"; then
            log_success "✅ 成功删除版本: $version"
        else
            log_error "删除版本 $version 失败，可能不满足 npm 政策"
            log_info "请检查:"
            log_info "  1. 版本是否在 72 小时内发布"
            log_info "  2. 是否有其他包依赖此版本"
            log_info "  3. 过去一周下载量是否 < 300 次"
        fi
    done
    
    echo ""
    log_success "🎉 删除操作完成！"
}

# 批量废弃旧版本（保留最新的 N 个版本）
deprecate_old_versions() {
    check_npm_login
    
    # 从命令行参数获取保留数量，如果没有则交互式询问
    KEEP_COUNT=$1
    
    list_versions
    
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    LATEST_VERSION=$(npm view $PACKAGE_NAME version 2>/dev/null)
    
    if [ -z "$KEEP_COUNT" ]; then
        log_question "要保留最新的几个版本？（默认: 3）:"
        read -r KEEP_COUNT
        
        if [ -z "$KEEP_COUNT" ]; then
            KEEP_COUNT=3
        fi
    else
        log_info "将保留最新的 $KEEP_COUNT 个版本"
    fi
    
    # 获取所有版本并排序
    VERSIONS=$(npm view $PACKAGE_NAME versions --json 2>/dev/null | tr -d '[],"' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sort -Vr)
    
    # 计算要废弃的版本
    VERSIONS_ARRAY=($VERSIONS)
    TOTAL=${#VERSIONS_ARRAY[@]}
    DEPRECATE_COUNT=$((TOTAL - KEEP_COUNT))
    
    if [ $DEPRECATE_COUNT -le 0 ]; then
        log_info "版本数量 ($TOTAL) 不超过保留数量 ($KEEP_COUNT)，无需废弃"
        exit 0
    fi
    
    log_info "将废弃 $DEPRECATE_COUNT 个旧版本，保留最新的 $KEEP_COUNT 个版本"
    echo ""
    log_info "将被废弃的版本:"
    for ((i=KEEP_COUNT; i<TOTAL; i++)); do
        echo "  - ${VERSIONS_ARRAY[$i]}"
    done
    echo ""
    
    log_question "请输入废弃原因（可选，默认: '此版本已废弃，请升级到最新版本'）:"
    read -r DEPRECATION_MESSAGE
    
    if [ -z "$DEPRECATION_MESSAGE" ]; then
        DEPRECATION_MESSAGE="此版本已废弃，请升级到最新版本 $LATEST_VERSION"
    fi
    
    log_warn "准备批量废弃 $DEPRECATE_COUNT 个版本"
    read -p "确认废弃？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "已取消"
        exit 1
    fi
    
    # 废弃旧版本
    SUCCESS_COUNT=0
    FAIL_COUNT=0
    
    for ((i=KEEP_COUNT; i<TOTAL; i++)); do
        version=${VERSIONS_ARRAY[$i]}
        log_info "废弃版本: $version"
        
        if npm deprecate "$PACKAGE_NAME@$version" "$DEPRECATION_MESSAGE" 2>/dev/null; then
            log_success "✅ 成功废弃: $version"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            log_warn "⚠️  废弃失败: $version（可能已经废弃）"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    done
    
    echo ""
    log_success "🎉 批量废弃完成！"
    log_info "成功: $SUCCESS_COUNT, 失败: $FAIL_COUNT"
}

# 主函数
main() {
    ACTION=${1:-list}
    
    case $ACTION in
        list)
            list_versions
            ;;
        deprecate)
            deprecate_versions
            ;;
        deprecate-old)
            deprecate_old_versions "$2"
            ;;
        unpublish)
            unpublish_versions
            ;;
        *)
            echo "使用方法: $0 [list|deprecate|deprecate-old|unpublish]"
            echo ""
            echo "命令说明:"
            echo "  list          - 列出所有已发布的版本（默认）"
            echo "  deprecate     - 废弃指定版本（推荐）"
            echo "  deprecate-old [N] - 批量废弃旧版本，保留最新的 N 个版本（默认: 3）"
            echo "  unpublish     - 删除指定版本（需满足 npm 政策）"
            echo ""
            echo "示例:"
            echo "  $0 list                    # 列出所有版本"
            echo "  $0 deprecate               # 交互式废弃版本"
            echo "  $0 deprecate-old           # 批量废弃旧版本（交互式，默认保留3个）"
            echo "  $0 deprecate-old 1         # 批量废弃旧版本，只保留最新1个"
            echo "  $0 deprecate-old 5         # 批量废弃旧版本，保留最新5个"
            echo "  $0 unpublish               # 交互式删除版本"
            exit 1
            ;;
    esac
}

main "$@"

