#!/bin/bash
################################################################################
# PixivFlow - 一键更新和修复脚本
# 版本: 2.0.0
# 描述: 自动更新代码、依赖，修复常见错误，确保系统正常运行
#
# ⚠️ 重要说明：后端独立性
# 本脚本更新和修复的是后端核心功能，完全独立于前端 WebUI。
# 所有更新和修复都针对后端，确保后端可以独立完美运行。
################################################################################

# 加载共享库
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

# 初始化环境
init_script

# ============================================================================
# 全局变量
# ============================================================================

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
FIXED_ISSUES=0
WARNINGS=0

# ============================================================================
# 备份函数
# ============================================================================

backup_important_files() {
    print_subheader "备份重要文件"
    
    ensure_dir "$BACKUP_DIR"
    
    local files_to_backup=(
        "config/standalone.config.json"
        "data/pixiv-downloader.db"
        "package.json"
        "package-lock.json"
    )
    
    local backed_up=0
    for file in "${files_to_backup[@]}"; do
        if [[ -f "$file" ]]; then
            local backup_path="$BACKUP_DIR/$(basename "$file")"
            cp "$file" "$backup_path" 2>/dev/null && {
                log_success "已备份: $file"
                ((backed_up++))
            } || log_warn "备份失败: $file"
        fi
    done
    
    if [[ $backed_up -gt 0 ]]; then
        log_success "备份完成: $BACKUP_DIR"
    else
        log_info "没有需要备份的文件"
    fi
    
    echo
}

# ============================================================================
# Git 更新
# ============================================================================

update_from_git() {
    print_subheader "更新代码"
    
    if [[ ! -d ".git" ]]; then
        log_warn "不是 Git 仓库，跳过代码更新"
        log_info "如果您是从压缩包安装的，请手动检查更新"
        echo
        return 0
    fi
    
    # 检查是否有未提交的更改
    if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
        log_warn "检测到未提交的更改"
        if ask_yes_no "是否先提交或暂存更改？" "n"; then
            log_info "请手动处理未提交的更改后重试"
            return 1
        fi
        log_info "继续更新（未提交的更改将被保留）"
    fi
    
    # 获取当前分支
    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
    log_info "当前分支: $current_branch"
    
    # 获取远程更新
    log_info "获取远程更新..."
    if git fetch origin "$current_branch" 2>&1 | while read -r line; do
        log_info "  $line"
    done; then
        log_success "远程更新获取成功"
    else
        log_warn "获取远程更新失败（可能没有配置远程仓库）"
        echo
        return 0
    fi
    
    # 检查是否有更新
    local local_commit
    local remote_commit
    local_commit=$(git rev-parse HEAD 2>/dev/null)
    remote_commit=$(git rev-parse "origin/$current_branch" 2>/dev/null)
    
    if [[ "$local_commit" == "$remote_commit" ]]; then
        log_success "代码已是最新版本"
        echo
        return 0
    fi
    
    # 显示更新信息
    log_info "发现新版本，更新内容："
    git log --oneline "$local_commit..origin/$current_branch" 2>/dev/null | head -10 | while read -r line; do
        log_info "  $line"
    done
    
    echo
    if ! ask_yes_no "是否更新到最新版本？" "y"; then
        log_info "已取消更新"
        return 0
    fi
    
    # 执行更新
    log_info "正在更新代码..."
    if git pull origin "$current_branch" 2>&1 | while read -r line; do
        log_info "  $line"
    done; then
        log_success "代码更新成功"
        ((FIXED_ISSUES++))
        echo
        return 0
    else
        log_error "代码更新失败"
        log_info "请手动解决冲突后重试"
        echo
        return 1
    fi
}

# ============================================================================
# 依赖更新
# ============================================================================

update_dependencies() {
    print_subheader "更新依赖"
    
    ensure_node
    ensure_deps
    
    # 检查 package.json 是否有更新
    if [[ -f "package-lock.json" ]]; then
        local lock_age
        case "$(get_os)" in
            macos)
                lock_age=$(stat -f "%m" package-lock.json 2>/dev/null || echo "0")
                ;;
            linux)
                lock_age=$(stat -c "%Y" package-lock.json 2>/dev/null || echo "0")
                ;;
            *)
                lock_age="0"
                ;;
        esac
        
        local current_time
        current_time=$(date +%s)
        local days_old=$(( (current_time - lock_age) / 86400 ))
        
        if [[ $days_old -gt 30 ]]; then
            log_warn "依赖锁定文件已 $days_old 天未更新"
        fi
    fi
    
    # 更新依赖
    log_info "正在更新依赖..."
    if npm update 2>&1 | while read -r line; do
        # 过滤掉过多的输出，只显示重要信息
        if echo "$line" | grep -qE "(added|removed|changed|updated|WARN|ERROR)" || [[ -z "$line" ]]; then
            log_info "  $line"
        fi
    done; then
        log_success "依赖更新完成"
        ((FIXED_ISSUES++))
    else
        log_warn "依赖更新可能有问题，但继续执行"
        ((WARNINGS++))
    fi
    
    # 检查是否有安全漏洞
    if command_exists npm; then
        log_info "检查安全漏洞..."
        if npm audit --audit-level=moderate 2>&1 | grep -q "found"; then
            log_warn "发现安全漏洞"
            if ask_yes_no "是否自动修复安全漏洞？" "y"; then
                if npm audit fix 2>&1 | tail -5 | while read -r line; do
                    log_info "  $line"
                done; then
                    log_success "安全漏洞已修复"
                    ((FIXED_ISSUES++))
                else
                    log_warn "部分安全漏洞无法自动修复"
                    ((WARNINGS++))
                fi
            fi
        else
            log_success "未发现严重安全漏洞"
        fi
    fi
    
    echo
}

# ============================================================================
# 重新编译
# ============================================================================

rebuild_project() {
    print_subheader "重新编译"
    
    ensure_node
    ensure_deps
    
    # 清理旧的编译产物
    log_info "清理旧的编译产物..."
    safe_remove "dist"
    log_success "清理完成"
    
    # 重新编译
    log_info "正在编译 TypeScript..."
    if npm run build 2>&1 | while read -r line; do
        if echo "$line" | grep -qE "(error|Error|ERROR|warning|Warning)" || [[ -z "$line" ]]; then
            echo "$line"
        fi
    done; then
        if [[ -f "$DIST_MAIN" ]]; then
            log_success "编译成功"
            ((FIXED_ISSUES++))
        else
            log_error "编译失败：主程序文件不存在"
            return 1
        fi
    else
        log_error "编译失败"
        return 1
    fi
    
    echo
}

# ============================================================================
# 修复常见错误
# ============================================================================

fix_common_issues() {
    print_subheader "修复常见错误"
    
    local fixed=0
    
    # 1. 修复配置文件路径问题
    if [[ -f "$CONFIG_FILE" ]]; then
        log_info "检查配置文件路径..."
        
        # 检查是否有绝对路径需要迁移
        if node -e "
            const fs = require('fs');
            const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
            const storage = config.storage || {};
            const paths = [
                storage.databasePath,
                storage.downloadDirectory,
                storage.illustrationDirectory,
                storage.novelDirectory
            ];
            const hasAbsolutePath = paths.some(p => p && (p.startsWith('/') || p.match(/^[A-Z]:/)));
            console.log(hasAbsolutePath ? '1' : '0');
        " 2>/dev/null | grep -q "1"; then
            log_warn "检测到绝对路径，建议迁移为相对路径"
            if ask_yes_no "是否自动迁移路径？" "y"; then
                if node dist/index.js migrate-config --dry-run 2>/dev/null | grep -q "需要迁移"; then
                    if node dist/index.js migrate-config 2>/dev/null; then
                        log_success "路径迁移完成"
                        ((fixed++))
                    fi
                fi
            fi
        else
            log_success "配置文件路径正常"
        fi
    fi
    
    # 2. 修复数据库权限问题
    if [[ -f "$DATABASE_PATH" ]]; then
        log_info "检查数据库权限..."
        if [[ ! -r "$DATABASE_PATH" ]] || [[ ! -w "$DATABASE_PATH" ]]; then
            log_warn "数据库文件权限异常"
            if chmod 644 "$DATABASE_PATH" 2>/dev/null; then
                log_success "数据库权限已修复"
                ((fixed++))
            fi
        else
            log_success "数据库权限正常"
        fi
    fi
    
    # 3. 修复目录权限问题
    log_info "检查目录权限..."
    local dirs=("data" "logs" "downloads" "config")
    for dir in "${dirs[@]}"; do
        if [[ -d "$dir" ]] && [[ ! -w "$dir" ]]; then
            log_warn "$dir 目录不可写"
            if chmod 755 "$dir" 2>/dev/null; then
                log_success "$dir 目录权限已修复"
                ((fixed++))
            fi
        fi
    done
    
    # 4. 修复 node_modules 链接问题
    if [[ -d "node_modules" ]]; then
        log_info "检查依赖链接..."
        if npm ls --depth=0 2>&1 | grep -qE "(missing|invalid|extraneous)"; then
            log_warn "发现依赖问题"
            if ask_yes_no "是否重新安装依赖？" "y"; then
                log_info "正在重新安装依赖..."
                safe_remove "node_modules"
                if npm install 2>&1 | tail -10 | while read -r line; do
                    log_info "  $line"
                done; then
                    log_success "依赖重新安装完成"
                    ((fixed++))
                fi
            fi
        else
            log_success "依赖链接正常"
        fi
    fi
    
    # 5. 修复日志文件过大问题
    local log_file="data/pixiv-downloader.log"
    if [[ -f "$log_file" ]]; then
        local log_size
        log_size=$(du -m "$log_file" 2>/dev/null | cut -f1)
        if [[ -n "$log_size" ]] && [[ $log_size -gt 100 ]]; then
            log_warn "日志文件过大 (${log_size}MB)"
            if ask_yes_no "是否清理旧日志？" "y"; then
                if tail -n 1000 "$log_file" > "${log_file}.tmp" 2>/dev/null && \
                   mv "${log_file}.tmp" "$log_file" 2>/dev/null; then
                    log_success "日志已清理"
                    ((fixed++))
                fi
            fi
        fi
    fi
    
    if [[ $fixed -gt 0 ]]; then
        log_success "修复了 $fixed 个问题"
        FIXED_ISSUES=$((FIXED_ISSUES + fixed))
    else
        log_success "未发现需要修复的问题"
    fi
    
    echo
}

# ============================================================================
# 验证配置
# ============================================================================

validate_configuration() {
    print_subheader "验证配置"
    
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_warn "配置文件不存在"
        log_info "运行 './scripts/pixiv.sh setup' 创建配置"
        ((WARNINGS++))
        echo
        return 1
    fi
    
    # 验证 JSON 格式
    if ! validate_json "$CONFIG_FILE"; then
        log_error "配置文件格式错误"
        log_info "请检查配置文件: $CONFIG_FILE"
        echo
        return 1
    fi
    
    log_success "配置文件格式正确"
    
    # 检查必要字段
    local refresh_token
    refresh_token=$(read_json_value "$CONFIG_FILE" "pixiv.refreshToken")
    
    if [[ -z "$refresh_token" ]] || [[ "$refresh_token" == "YOUR_REFRESH_TOKEN" ]]; then
        log_warn "认证信息未配置"
        log_info "运行 './scripts/pixiv.sh login' 登录"
        ((WARNINGS++))
    else
        log_success "认证信息已配置"
    fi
    
    # 检查下载目标
    local targets
    targets=$(read_json_value "$CONFIG_FILE" "targets")
    if [[ -z "$targets" ]] || [[ "$targets" == "[]" ]]; then
        log_warn "下载目标未配置"
        log_info "运行 './scripts/pixiv.sh setup' 配置下载目标"
        ((WARNINGS++))
    else
        log_success "下载目标已配置"
    fi
    
    echo
}

# ============================================================================
# 运行健康检查
# ============================================================================

run_health_check() {
    print_subheader "运行健康检查"
    
    if [[ -f "$SCRIPT_DIR/health-check.sh" ]]; then
        if bash "$SCRIPT_DIR/health-check.sh" 2>&1; then
            log_success "健康检查通过"
        else
            local exit_code=$?
            if [[ $exit_code -eq 1 ]]; then
                log_warn "健康检查发现一些问题"
                ((WARNINGS++))
            else
                log_error "健康检查失败"
                return 1
            fi
        fi
    else
        log_warn "健康检查脚本不存在，跳过"
    fi
    
    echo
}

# ============================================================================
# 主函数
# ============================================================================

show_help() {
    cat << EOF
╔════════════════════════════════════════════════════════════════╗
║            PixivFlow - 一键更新和修复脚本 v2.0                  ║
╚════════════════════════════════════════════════════════════════╝

🔧 功能:
    自动更新代码、依赖，修复常见错误，确保系统正常运行

📋 执行步骤:
    1. 备份重要文件（配置、数据库等）
    2. 从 Git 更新代码（如果是 Git 仓库）
    3. 更新 npm 依赖
    4. 重新编译项目
    5. 修复常见错误（路径、权限、依赖等）
    6. 验证配置
    7. 运行健康检查

🚀 使用:
    $0                  # 执行完整更新和修复流程
    $0 --no-git         # 跳过 Git 更新（适用于非 Git 安装）
    $0 --no-backup      # 跳过备份
    $0 --help           # 显示帮助信息

💡 提示:
    - 更新前会自动备份重要文件
    - 如果检测到未提交的更改，会询问是否继续
    - 所有修复操作都是安全的，不会丢失数据

EOF
}

main() {
    local skip_git=false
    local skip_backup=false
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-git)
                skip_git=true
                shift
                ;;
            --no-backup)
                skip_backup=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 显示欢迎信息
    print_header "PixivFlow 一键更新和修复"
    
    log_info "本脚本将执行以下操作："
    echo "  1. 备份重要文件"
    echo "  2. 更新代码（如适用）"
    echo "  3. 更新依赖"
    echo "  4. 重新编译"
    echo "  5. 修复常见错误"
    echo "  6. 验证配置"
    echo "  7. 运行健康检查"
    echo
    
    if ! ask_yes_no "是否继续？" "y"; then
        log_info "已取消"
        exit 0
    fi
    
    echo
    
    # 执行更新和修复流程
    local start_time
    start_time=$(date +%s)
    
    # 1. 备份
    if [[ "$skip_backup" != "true" ]]; then
        backup_important_files
    else
        log_info "跳过备份（--no-backup）"
        echo
    fi
    
    # 2. Git 更新
    if [[ "$skip_git" != "true" ]]; then
        if ! update_from_git; then
            log_warn "Git 更新失败，但继续执行其他步骤"
            ((WARNINGS++))
        fi
    else
        log_info "跳过 Git 更新（--no-git）"
        echo
    fi
    
    # 3. 更新依赖
    if ! update_dependencies; then
        log_error "依赖更新失败"
        exit 1
    fi
    
    # 4. 重新编译
    if ! rebuild_project; then
        log_error "编译失败"
        exit 1
    fi
    
    # 5. 修复常见错误
    fix_common_issues
    
    # 6. 验证配置
    validate_configuration
    
    # 7. 运行健康检查
    run_health_check
    
    # 显示总结
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_header "更新和修复完成"
    
    echo
    log_success "完成的操作："
    echo "  • 修复了 $FIXED_ISSUES 个问题"
    if [[ $WARNINGS -gt 0 ]]; then
        log_warn "  • 发现 $WARNINGS 个警告"
    fi
    echo "  • 耗时: ${duration} 秒"
    echo
    
    if [[ $WARNINGS -eq 0 ]] && [[ $FIXED_ISSUES -gt 0 ]]; then
        log_success "系统已更新并修复完成！"
        echo
        log_info "下一步："
        echo "  • 运行 './scripts/pixiv.sh test' 测试功能"
        echo "  • 运行 './scripts/pixiv.sh run' 启动下载器"
    elif [[ $WARNINGS -gt 0 ]]; then
        log_warn "更新完成，但有一些警告需要关注"
        echo
        log_info "建议："
        echo "  • 运行 './scripts/pixiv.sh health' 查看详细状态"
    else
        log_success "系统已是最新状态，无需更新"
    fi
    
    echo
    log_info "备份位置: $BACKUP_DIR"
    echo
    
    exit 0
}

main "$@"
 