#!/bin/bash
################################################################################
# PixivFlow - 主控制脚本
# 版本: 2.0.0
# 描述: 提供最常用的功能，是用户的主要交互入口
#
# ⚠️ 重要说明：后端独立性
# 本脚本直接调用后端 CLI，完全独立于前端 WebUI。
# 即使不使用前端界面，所有功能都可以通过命令行完美运行。
# 后端是项目的核心，前端只是可选的辅助工具。
################################################################################

# 加载共享库
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

# 初始化环境
init_script

# ============================================================================
# 核心检查函数
# ============================================================================

ensure_node() {
    if ! check_node || ! check_npm; then
        log_info "请安装 Node.js: https://nodejs.org/"
        exit 1
    fi
}

ensure_deps() {
    if ! check_dependencies; then
        log_error "依赖未安装，请运行: $0 setup"
        exit 1
    fi
}

ensure_config() {
    if ! check_config; then
        log_error "配置不存在，请运行: $0 setup"
        exit 1
    fi
}

ensure_build() {
    if [[ ! -f "dist/index.js" ]]; then
        log_info "首次运行，正在编译..."
        npm run build || {
            log_error "编译失败"
            exit 1
        }
    fi
}

# 调用内置CLI
call_cli() {
    ensure_build
    node dist/index.js "$@"
}

# ============================================================================
# 帮助信息
# ============================================================================

show_help() {
    cat << EOF
╔════════════════════════════════════════════════════════════════╗
║                  PixivFlow - 主控制脚本 v2.0                   ║
╚════════════════════════════════════════════════════════════════╝

💡 后端独立性说明：
   本脚本直接调用后端 CLI，完全独立于前端 WebUI。
   所有功能都可以通过命令行完美运行，无需前端支持。

🚀 快速开始（首次使用）:
    ./scripts/quick-start.sh    # 一键完成所有设置（推荐 ⭐）
    或
    $0 setup                    # 1. 配置向导
    $0 test                     # 2. 测试下载
    $0 once                     # 3. 手动下载一次

📝 核心命令:
    setup       交互式配置向导（首次必须运行）
    login       登录 Pixiv 账号（交互式）
    run         启动定时下载器（持续运行）
    once        立即执行一次下载任务
    test        快速测试（下载1个文件验证配置）
    random      随机下载一个热门标签作品
    status      查看下载统计和最近记录
    stop        停止正在运行的下载器
    logs        查看日志

⚙️ 环境管理:
    check       环境和依赖检查
    build       编译 TypeScript（通常自动完成）
    clean       清理编译产物

🔧 高级工具:
    config      配置管理工具（查看/备份/恢复）
    health      健康检查和诊断
    monitor     启动监控
    maintain    运维工具（日志/数据库/更新）
    docker      Docker 管理工具（构建/部署/管理）

💡 示例:
    $0 setup                # 首次配置
    $0 login                # 登录账号
    $0 test                 # 测试配置
    $0 random               # 随机下载
    $0 once                 # 手动下载一次
    $0 run                  # 启动定时器
    $0 status               # 查看统计
    $0 logs                 # 查看日志
    $0 config show          # 查看配置
    $0 health               # 健康检查

📚 文档:
    快速开始: START_HERE.md
    详细配置: STANDALONE-SETUP-GUIDE.md
    脚本指南: SCRIPTS_GUIDE.md

EOF
}

# ============================================================================
# 核心命令实现
# ============================================================================

cmd_setup() {
    print_header "配置向导"
    
    ensure_node
    
    # 智能依赖检查
    if ! check_dependencies; then
        log_info "正在安装依赖..."
        npm install || {
            log_error "依赖安装失败"
            exit 1
        }
    fi
    
    # 使用专用的配置向导
    if [[ -f "$SCRIPT_DIR/easy-setup.sh" ]]; then
        bash "$SCRIPT_DIR/easy-setup.sh"
    else
        log_info "启动配置向导..."
        npm run setup
    fi
    
    if check_config; then
        log_success "配置完成！"
        echo
        log_info "下一步："
        echo "  • 测试配置: $0 test"
        echo "  • 启动下载: $0 run"
    fi
}

cmd_login() {
    print_header "Pixiv 登录"
    
    ensure_node
    ensure_deps
    
    log_info "启动登录流程..."
    echo
    
    call_cli login "$@"
    
    echo
    log_success "登录完成！"
}

cmd_run() {
    print_header "启动定时下载器"
    
    ensure_config
    ensure_deps
    
    log_info "下载器已启动（按 Ctrl+C 停止）"
    log_info "日志: data/pixiv-downloader.log"
    log_info "提示: 这是完全独立的后端服务，无需前端支持"
    echo
    
    call_cli scheduler
}

cmd_once() {
    print_header "执行下载任务"
    
    ensure_config
    ensure_deps
    
    log_info "开始执行下载任务..."
    echo
    
    call_cli download
    
    echo
    log_success "任务完成！运行 '$0 status' 查看结果"
}

cmd_test() {
    print_header "快速测试"
    
    ensure_config
    ensure_deps
    
    log_info "执行测试下载..."
    
    if [[ -f "dist/test-download.js" ]]; then
        node dist/test-download.js
    else
        log_warn "测试脚本未找到，使用内置测试功能"
        call_cli download --once
    fi
    
    echo
    if [[ -d "downloads/illustrations" ]] && [[ $(find downloads/illustrations -type f 2>/dev/null | wc -l) -gt 0 ]]; then
        log_success "测试通过！"
        echo
        echo "下载的文件:"
        find downloads/illustrations -type f -exec ls -lh {} \; 2>/dev/null | head -5 | awk '{print "  •", $9, "("$5")"}'
    else
        log_warn "未找到下载文件，请检查配置"
    fi
}

cmd_random() {
    print_header "随机下载"
    
    ensure_deps
    
    log_info "随机选择一个热门标签并下载一个作品..."
    echo
    
    call_cli random "$@"
    
    echo
    log_success "随机下载完成！"
}

cmd_status() {
    print_header "下载状态"
    
    if [[ ! -f "$DATABASE_PATH" ]]; then
        log_warn "还没有下载记录"
        log_info "运行 '$0 once' 开始下载"
        exit 0
    fi
    
    if command_exists sqlite3; then
        print_subheader "统计数据"
        sqlite3 "$DATABASE_PATH" "
            SELECT '  总计: ' || COUNT(*) || ' 个作品' FROM downloads;
        "
        sqlite3 "$DATABASE_PATH" "
            SELECT '  插画: ' || COUNT(*) FROM downloads WHERE work_type='illustration';
        "
        sqlite3 "$DATABASE_PATH" "
            SELECT '  小说: ' || COUNT(*) FROM downloads WHERE work_type='novel';
        "
        
        print_subheader "最近下载"
        sqlite3 -line "$DATABASE_PATH" "
            SELECT 
                work_id,
                work_type,
                datetime(downloaded_at,'localtime') as time
            FROM downloads
            ORDER BY downloaded_at DESC
            LIMIT 5;
        " | grep -v "^$"
    else
        log_info "数据库: $DATABASE_PATH"
        log_warn "安装 sqlite3 查看详细统计"
        case "$(get_os)" in
            macos)  log_info "运行: brew install sqlite" ;;
            linux)  log_info "运行: sudo apt install sqlite3" ;;
        esac
    fi
}

cmd_stop() {
    print_header "停止下载器"
    
    # 查找运行中的下载器进程
    local pids
    pids=$(pgrep -f "dist/index.js.*scheduler" 2>/dev/null || true)
    
    if [[ -z "$pids" ]]; then
        log_info "没有运行中的下载器"
        return 0
    fi
    
    log_info "停止进程: $pids"
    kill -TERM $pids 2>/dev/null || true
    sleep 2
    
    if pgrep -f "dist/index.js.*scheduler" >/dev/null 2>&1; then
        log_warn "强制停止进程"
        kill -9 $pids 2>/dev/null || true
    fi
    
    log_success "下载器已停止"
}

cmd_logs() {
    print_header "查看日志"
    
    local log_file="data/pixiv-downloader.log"
    
    if [[ ! -f "$log_file" ]]; then
        log_warn "日志文件不存在: $log_file"
        exit 0
    fi
    
    log_info "最近 50 行日志:"
    echo
    tail -n 50 "$log_file"
    echo
    log_info "完整日志: $log_file"
}

cmd_check() {
    print_header "环境检查"
    
    local issues=0
    
    log_info "检查后端独立运行环境..."
    echo
    
    # Node.js
    if command_exists node; then
        local node_version=$(node -v)
        log_success "Node.js $node_version"
    else
        log_error "Node.js 未安装"
        ((issues++))
    fi
    
    # npm
    if command_exists npm; then
        local npm_version=$(npm -v)
        log_success "npm $npm_version"
    else
        log_error "npm 未安装"
        ((issues++))
    fi
    
    # 依赖
    if check_dependencies; then
        log_success "依赖已安装"
    else
        log_warn "依赖未安装"
        ((issues++))
    fi
    
    # 配置
    if check_config; then
        log_success "配置文件存在"
    else
        log_warn "配置文件不存在"
        ((issues++))
    fi
    
    # 编译
    if check_build; then
        log_success "TypeScript 已编译"
    else
        log_info "未编译（首次运行时自动编译）"
    fi
    
    # 网络
    if check_network "www.pixiv.net"; then
        log_success "网络连接正常"
    else
        log_warn "无法访问 Pixiv（可能需要代理）"
    fi
    
    # 后端独立性检查
    if [[ -f "dist/index.js" ]]; then
        log_success "后端 CLI 工具可用（完全独立，无需前端）"
    else
        log_info "后端 CLI 未编译（首次运行时会自动编译）"
    fi
    
    echo
    if [[ $issues -eq 0 ]]; then
        log_success "环境正常！后端可以独立运行，无需前端支持"
    else
        log_warn "发现 $issues 个问题"
        log_info "运行 '$0 setup' 初始化环境"
        exit 1
    fi
}

cmd_build() {
    print_header "编译 TypeScript"
    
    ensure_node
    ensure_deps
    
    npm run build
    log_success "编译完成"
}

cmd_clean() {
    print_header "清理项目"
    
    log_info "清理编译产物..."
    safe_remove "dist"
    
    log_info "清理临时文件..."
    safe_remove ".tmp"
    safe_remove "*.log"
    
    log_success "清理完成"
}

# ============================================================================
# 高级工具（委托给专门脚本）
# ============================================================================

cmd_config() {
    local tool="$SCRIPT_DIR/config-manager.sh"
    if [[ -f "$tool" ]]; then
        bash "$tool" "$@"
    else
        log_error "配置管理工具未找到: $tool"
        exit 1
    fi
}

cmd_health() {
    local tool="$SCRIPT_DIR/health-check.sh"
    if [[ -f "$tool" ]]; then
        bash "$tool" "$@"
    else
        log_warn "健康检查工具未找到，使用基础检查"
        cmd_check
    fi
}

cmd_monitor() {
    local tool="$SCRIPT_DIR/auto-monitor.sh"
    if [[ -f "$tool" ]]; then
        bash "$tool" "$@"
    else
        log_error "监控工具未找到: $tool"
        exit 1
    fi
}

cmd_maintain() {
    local tool="$SCRIPT_DIR/auto-maintain.sh"
    if [[ -f "$tool" ]]; then
        bash "$tool" "$@"
    else
        log_error "运维工具未找到: $tool"
        exit 1
    fi
}

cmd_docker() {
    local tool="$SCRIPT_DIR/docker.sh"
    if [[ -f "$tool" ]]; then
        bash "$tool" "$@"
    else
        log_error "Docker 管理工具未找到: $tool"
        exit 1
    fi
}

# ============================================================================
# 路由分发
# ============================================================================

main() {
    local command="${1:-help}"
    shift 2>/dev/null || true
    
    case "$command" in
        # 核心命令
        setup)      cmd_setup "$@" ;;
        login)      cmd_login "$@" ;;
        run)        cmd_run "$@" ;;
        once)       cmd_once "$@" ;;
        test)       cmd_test "$@" ;;
        random)     cmd_random "$@" ;;
        status)     cmd_status "$@" ;;
        stop)       cmd_stop "$@" ;;
        logs)       cmd_logs "$@" ;;
        
        # 环境管理
        check)      cmd_check "$@" ;;
        build)      cmd_build "$@" ;;
        clean)      cmd_clean "$@" ;;
        
        # 高级工具（委托）
        config)     cmd_config "$@" ;;
        health)     cmd_health "$@" ;;
        monitor)    cmd_monitor "$@" ;;
        maintain)   cmd_maintain "$@" ;;
        docker)     cmd_docker "$@" ;;
        
        # 帮助
        help|-h|--help|--version|-v)
            show_help
            ;;
        
        *)
            log_error "未知命令: $command"
            echo
            echo "运行 '$0 help' 查看帮助"
            exit 1
            ;;
    esac
}

main "$@"
