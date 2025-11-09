#!/bin/bash
################################################################################
# PixivFlow - Common Shell Library
# 提供通用的工具函数和常量定义
#
# ⚠️ 重要说明：后端独立性
# 本库为所有脚本提供通用功能，这些脚本都直接调用后端 CLI。
# 所有功能都完全独立于前端 WebUI，后端是项目的核心。
################################################################################

# 严格模式
set -euo pipefail

# ============================================================================
# 项目常量
# ============================================================================

readonly PROJECT_NAME="PixivFlow"
readonly PROJECT_VERSION="2.0.0"
readonly CONFIG_FILE="config/standalone.config.json"
readonly DIST_MAIN="dist/index.js"
readonly DATABASE_PATH="data/pixiv-downloader.db"
readonly LOG_DIR="logs"

# ============================================================================
# 颜色定义
# ============================================================================

# ANSI 颜色码
readonly COLOR_RESET='\033[0m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[0;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_MAGENTA='\033[0;35m'
readonly COLOR_CYAN='\033[0;36m'
readonly COLOR_WHITE='\033[0;37m'
readonly COLOR_BOLD='\033[1m'

# ============================================================================
# 输出函数
# ============================================================================

# 彩色输出
_color() {
    local color_code=$1
    shift
    echo -e "${color_code}${*}${COLOR_RESET}"
}

# 日志级别输出
log_info() {
    echo -e "${COLOR_BLUE}ℹ${COLOR_RESET} $*"
}

log_success() {
    echo -e "${COLOR_GREEN}✓${COLOR_RESET} $*"
}

log_warn() {
    echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} $*"
}

log_error() {
    echo -e "${COLOR_RED}✗${COLOR_RESET} $*" >&2
}

log_debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        echo -e "${COLOR_MAGENTA}[DEBUG]${COLOR_RESET} $*" >&2
    fi
}

log_step() {
    echo -e "${COLOR_CYAN}▶${COLOR_RESET} $*"
}

# 带时间戳的日志
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# ============================================================================
# 格式化输出
# ============================================================================

# 打印分隔线
print_separator() {
    local char="${1:-═}"
    local width="${2:-70}"
    printf '%*s\n' "$width" | tr ' ' "$char"
}

# 打印标题
print_header() {
    echo
    _color "$COLOR_CYAN" "$(print_separator)"
    _color "$COLOR_CYAN" "  $*"
    _color "$COLOR_CYAN" "$(print_separator)"
    echo
}

# 打印子标题
print_subheader() {
    echo
    _color "$COLOR_BOLD" "【$*】"
}

# 打印成功框
print_success_box() {
    local message="$1"
    echo
    print_separator "═"
    _color "$COLOR_GREEN" "  ✓ $message"
    print_separator "═"
    echo
}

# 打印错误框
print_error_box() {
    local message="$1"
    echo
    print_separator "═"
    _color "$COLOR_RED" "  ✗ $message"
    print_separator "═"
    echo
}

# ============================================================================
# 环境检测
# ============================================================================

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查 Node.js
check_node() {
    if ! command_exists node; then
        log_error "Node.js 未安装"
        log_info "请访问: https://nodejs.org/"
        return 1
    fi
    return 0
}

# 检查 npm
check_npm() {
    if ! command_exists npm; then
        log_error "npm 未安装"
        return 1
    fi
    return 0
}

# 检查项目依赖（智能检查）
check_dependencies() {
    if [[ ! -d "node_modules" ]]; then
        log_warn "依赖未安装"
        return 1
    fi
    
    # 检查关键依赖是否存在
    local critical_deps=("node_modules/better-sqlite3" "node_modules/node-fetch" "node_modules/cheerio")
    local missing=0
    
    for dep in "${critical_deps[@]}"; do
        if [[ ! -e "$dep" ]]; then
            ((missing++))
        fi
    done
    
    if [[ $missing -gt 0 ]]; then
        log_warn "检测到 $missing 个关键依赖缺失"
        return 1
    fi
    
    return 0
}

# 智能安装依赖（带自动修复）
install_dependencies_smart() {
    local auto_fix="${1:-false}"
    
    if ! check_node || ! check_npm; then
        log_error "Node.js 或 npm 未安装"
        return 1
    fi
    
    if ! check_dependencies; then
        log_info "正在安装依赖..."
        if npm install; then
            log_success "依赖安装完成"
            return 0
        else
            log_error "依赖安装失败"
            
            if [[ "$auto_fix" == "true" ]]; then
                log_info "尝试自动修复..."
                # 清理并重新安装
                safe_remove "node_modules"
                safe_remove "package-lock.json"
                if npm install; then
                    log_success "自动修复成功"
                    return 0
                fi
            fi
            
            return 1
        fi
    fi
    
    return 0
}

# 检查配置文件
check_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_warn "配置文件不存在: $CONFIG_FILE"
        return 1
    fi
    return 0
}

# 检查编译产物
check_build() {
    if [[ ! -f "$DIST_MAIN" ]]; then
        log_info "主程序未编译"
        return 1
    fi
    
    # 检查编译产物是否过时（比源文件旧）
    if [[ -f "src/index.ts" ]]; then
        local src_time
        local dist_time
        
        case "$(get_os)" in
            macos)
                src_time=$(stat -f "%m" "src/index.ts" 2>/dev/null || echo "0")
                dist_time=$(stat -f "%m" "$DIST_MAIN" 2>/dev/null || echo "0")
                ;;
            linux)
                src_time=$(stat -c "%Y" "src/index.ts" 2>/dev/null || echo "0")
                dist_time=$(stat -c "%Y" "$DIST_MAIN" 2>/dev/null || echo "0")
                ;;
            *)
                return 0  # 无法比较，假设正常
                ;;
        esac
        
        if [[ $src_time -gt $dist_time ]]; then
            log_info "编译产物已过时，需要重新编译"
            return 1
        fi
    fi
    
    return 0
}

# 智能编译（自动检测并编译）
build_smart() {
    if ! check_node || ! check_dependencies; then
        log_error "环境不满足编译要求"
        return 1
    fi
    
    if check_build; then
        log_success "编译产物已是最新"
        return 0
    fi
    
    log_info "正在编译..."
    if npm run build 2>&1 | grep -qE "(error|Error|ERROR)" && [[ ${PIPESTATUS[0]} -ne 0 ]]; then
        log_error "编译失败"
        return 1
    fi
    
    if [[ -f "$DIST_MAIN" ]]; then
        log_success "编译成功"
        return 0
    else
        log_error "编译失败：主程序文件不存在"
        return 1
    fi
}

# ============================================================================
# 文件操作
# ============================================================================

# 确保目录存在
ensure_dir() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        log_debug "创建目录: $dir"
    fi
}

# 备份文件
backup_file() {
    local file="$1"
    if [[ -f "$file" ]]; then
        local backup="${file}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$file" "$backup"
        log_success "已备份: $backup"
        echo "$backup"
    fi
}

# 安全删除文件
safe_remove() {
    local target="$1"
    if [[ -e "$target" ]]; then
        rm -rf "$target"
        log_debug "已删除: $target"
    fi
}

# ============================================================================
# 进程管理
# ============================================================================

# 查找进程
find_process() {
    local pattern="$1"
    pgrep -f "$pattern" 2>/dev/null || true
}

# 停止进程
stop_process() {
    local pattern="$1"
    local pids
    pids=$(find_process "$pattern")
    
    if [[ -z "$pids" ]]; then
        log_info "没有运行中的进程"
        return 0
    fi
    
    log_info "停止进程: $pids"
    
    # 先尝试优雅停止
    kill -TERM $pids 2>/dev/null || true
    sleep 2
    
    # 如果还在运行，强制停止
    if find_process "$pattern" >/dev/null; then
        log_warn "强制停止进程"
        kill -9 $pids 2>/dev/null || true
    fi
    
    log_success "进程已停止"
}

# 检查进程是否运行
is_process_running() {
    local pattern="$1"
    [[ -n $(find_process "$pattern") ]]
}

# ============================================================================
# JSON 操作
# ============================================================================

# 验证 JSON 格式
validate_json() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        log_error "文件不存在: $file"
        return 1
    fi
    
    if ! node -e "JSON.parse(require('fs').readFileSync('$file', 'utf-8'))" 2>/dev/null; then
        log_error "无效的 JSON 格式: $file"
        return 1
    fi
    
    return 0
}

# 读取 JSON 值
read_json_value() {
    local file="$1"
    local key="$2"
    
    if [[ ! -f "$file" ]]; then
        return 1
    fi
    
    node -e "
        const data = JSON.parse(require('fs').readFileSync('$file', 'utf-8'));
        const keys = '$key'.split('.');
        let value = data;
        for (const k of keys) {
            value = value[k];
            if (value === undefined) break;
        }
        if (value !== undefined) console.log(value);
    " 2>/dev/null || true
}

# ============================================================================
# 网络检测
# ============================================================================

# 检查网络连接
check_network() {
    local host="${1:-www.pixiv.net}"
    local timeout="${2:-3}"
    
    if ping -c 1 -W "$timeout" "$host" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# 检查代理
check_proxy() {
    if [[ -n "${HTTP_PROXY:-}" ]] || [[ -n "${HTTPS_PROXY:-}" ]]; then
        return 0
    fi
    return 1
}

# ============================================================================
# 用户交互
# ============================================================================

# 询问是/否
ask_yes_no() {
    local question="$1"
    local default="${2:-n}"
    local prompt
    
    if [[ "$default" == "y" ]]; then
        prompt="[Y/n]"
    else
        prompt="[y/N]"
    fi
    
    read -p "$question $prompt: " answer
    answer="${answer:-$default}"
    
    [[ "$answer" =~ ^[Yy]$ ]]
}

# 询问选择
ask_choice() {
    local question="$1"
    local default="$2"
    
    read -p "$question [默认: $default]: " answer
    echo "${answer:-$default}"
}

# 暂停等待用户
pause() {
    local message="${1:-按 Enter 键继续...}"
    read -p "$message"
}

# ============================================================================
# 系统信息
# ============================================================================

# 获取操作系统
get_os() {
    case "$(uname -s)" in
        Darwin*)    echo "macos" ;;
        Linux*)     echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

# 获取 CPU 核心数
get_cpu_cores() {
    case "$(get_os)" in
        macos)   sysctl -n hw.ncpu ;;
        linux)   nproc ;;
        *)       echo "1" ;;
    esac
}

# 获取可用内存（MB）
get_available_memory() {
    case "$(get_os)" in
        macos)
            vm_stat | awk '/free/ {gsub(/\./, "", $3); print $3 * 4096 / 1024 / 1024}'
            ;;
        linux)
            free -m | awk '/^Mem:/ {print $7}'
            ;;
        *)
            echo "0"
            ;;
    esac
}

# ============================================================================
# 错误处理
# ============================================================================

# 错误陷阱
trap_error() {
    local exit_code=$?
    local line_number=$1
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "脚本在第 $line_number 行发生错误 (退出码: $exit_code)"
    fi
    
    exit $exit_code
}

# 清理陷阱
trap_cleanup() {
    log_debug "执行清理操作..."
    # 子类可以覆盖这个函数
}

# 设置错误陷阱
set_error_trap() {
    trap 'trap_error ${LINENO}' ERR
    trap 'trap_cleanup' EXIT
}

# 统一错误处理（带自动修复建议）
handle_error() {
    local error_code=$1
    local error_message="$2"
    local auto_fix="${3:-false}"
    
    log_error "$error_message"
    
    # 根据错误类型提供修复建议
    case "$error_code" in
        DEPENDENCIES_MISSING)
            log_info "建议: 运行 'npm install' 或 './scripts/pixiv.sh setup'"
            if [[ "$auto_fix" == "true" ]]; then
                install_dependencies_smart true
            fi
            ;;
        BUILD_MISSING)
            log_info "建议: 运行 'npm run build' 或 './scripts/pixiv.sh build'"
            if [[ "$auto_fix" == "true" ]]; then
                build_smart
            fi
            ;;
        CONFIG_MISSING)
            log_info "建议: 运行 './scripts/pixiv.sh setup' 创建配置"
            ;;
        NETWORK_ERROR)
            log_info "建议: 检查网络连接或配置代理"
            ;;
        PERMISSION_ERROR)
            log_info "建议: 检查文件权限或使用 'chmod' 修复"
            ;;
    esac
    
    return $error_code
}

# ============================================================================
# 版本比较
# ============================================================================

# 比较版本号
version_compare() {
    local version1="$1"
    local version2="$2"
    
    if [[ "$version1" == "$version2" ]]; then
        return 0
    fi
    
    local IFS=.
    local i ver1=($version1) ver2=($version2)
    
    for ((i=0; i<${#ver1[@]} || i<${#ver2[@]}; i++)); do
        if [[ ${ver1[i]:-0} -gt ${ver2[i]:-0} ]]; then
            return 1
        fi
        if [[ ${ver1[i]:-0} -lt ${ver2[i]:-0} ]]; then
            return 2
        fi
    done
    
    return 0
}

# ============================================================================
# 初始化
# ============================================================================

# 初始化脚本环境
init_script() {
    # 切换到项目根目录
    if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
        cd "$script_dir" || exit 1
    fi
    
    # 设置错误陷阱
    set_error_trap
    
    # 创建必要的目录
    ensure_dir "data"
    ensure_dir "logs"
    ensure_dir "downloads"
    
    log_debug "脚本环境初始化完成"
}

# ============================================================================
# 导出函数
# ============================================================================

# 自动导出所有函数
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # 被 source 引入时导出函数
    export -f command_exists
    export -f check_node
    export -f check_npm
    export -f check_dependencies
    export -f check_config
    export -f check_build
    export -f install_dependencies_smart
    export -f build_smart
    export -f handle_error
    export -f log_info
    export -f log_success
    export -f log_warn
    export -f log_error
    export -f log_debug
    export -f log_step
    export -f print_separator
    export -f print_header
    export -f print_subheader
    export -f print_success_box
    export -f print_error_box
    export -f ensure_dir
    export -f backup_file
    export -f safe_remove
    export -f find_process
    export -f stop_process
    export -f is_process_running
    export -f validate_json
    export -f read_json_value
    export -f check_network
    export -f check_proxy
    export -f ask_yes_no
    export -f ask_choice
    export -f pause
    export -f get_os
    export -f get_cpu_cores
    export -f get_available_memory
    export -f version_compare
fi

