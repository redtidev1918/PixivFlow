#!/bin/bash

# 简化版 Electron 构建脚本 - 带进度条和增强错误处理

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# 日志文件
LOG_DIR="$HOME/.pixiv-downloader-build-logs"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/build_${TIMESTAMP}.log"
ERROR_LOG="$LOG_DIR/errors_${TIMESTAMP}.log"

# 初始化日志文件
echo "=== 构建日志 - $(date) ===" > "$LOG_FILE"
echo "=== 错误日志 - $(date) ===" > "$ERROR_LOG"

# 日志函数
log_to_file() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log_error_to_file() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$ERROR_LOG"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE"
}

# 进度条函数
show_progress() {
    local current=$1
    local total=$2
    local width=50
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r${CYAN}["
    printf "%${filled}s" | tr ' ' '='
    printf "%${empty}s" | tr ' ' '-'
    printf "] ${percentage}%%${NC}"
}

# 步骤计数器
STEP=0
TOTAL_STEPS=3

# 错误处理
trap 'handle_error $? $LINENO' ERR

handle_error() {
    local exit_code=$1
    local line_no=$2
    log_error_to_file "构建失败于第 $line_no 行，退出码: $exit_code"
    echo -e "\n${RED}❌ 构建失败！${NC}"
    echo -e "${YELLOW}详细日志: $LOG_FILE${NC}"
    echo -e "${YELLOW}错误日志: $ERROR_LOG${NC}"
    echo -e "${CYAN}查看最近错误: tail -n 50 $ERROR_LOG${NC}"
    exit $exit_code
}

echo -e "${BLUE}🚀 开始构建 Electron 应用...${NC}"
echo -e "${CYAN}日志文件: $LOG_FILE${NC}"
echo -e "${CYAN}错误日志: $ERROR_LOG${NC}\n"
log_to_file "开始构建"

# 切换到脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
log_to_file "工作目录: $SCRIPT_DIR"

# 设置代理（如果提供参数）
if [ -n "$1" ]; then
    export https_proxy="$1"
    export http_proxy="$1"
    export all_proxy="$1"
    echo -e "${YELLOW}使用代理: $1${NC}\n"
    log_to_file "使用代理: $1"
fi

# 步骤 1: 构建前端
STEP=$((STEP + 1))
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 构建前端...${NC}"
show_progress $STEP $TOTAL_STEPS
log_to_file "步骤 $STEP: 构建前端"

if npm run build 2>&1 | tee -a "$LOG_FILE"; then
    echo -e "\n${GREEN}✓ 前端构建完成${NC}\n"
    log_to_file "前端构建成功"
else
    log_error_to_file "前端构建失败"
    exit 1
fi

# 步骤 2: 检查后端和资源
STEP=$((STEP + 1))
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 检查后端和资源...${NC}"
show_progress $STEP $TOTAL_STEPS
log_to_file "步骤 $STEP: 检查后端和资源"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
log_to_file "项目根目录: $PROJECT_ROOT"

if [ ! -d "$PROJECT_ROOT/dist" ]; then
    echo -e "${YELLOW}后端未构建，正在构建...${NC}"
    log_to_file "开始构建后端"
    cd "$PROJECT_ROOT"
    if npm run build 2>&1 | tee -a "$LOG_FILE"; then
        log_to_file "后端构建成功"
    else
        log_error_to_file "后端构建失败"
        exit 1
    fi
    cd "$SCRIPT_DIR"
else
    log_to_file "后端已构建"
fi

# 检查图标（可选）
if [ ! -f "build/icon.icns" ] && [ ! -f "build/icon.ico" ] && [ ! -f "build/icon.png" ]; then
    echo -e "${YELLOW}⚠ 未找到图标文件，将使用默认图标${NC}"
    log_to_file "警告: 未找到图标文件"
fi

echo -e "${GREEN}✓ 检查完成${NC}\n"
log_to_file "资源检查完成"

# 步骤 3: 打包 Electron
STEP=$((STEP + 1))
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 打包 Electron 应用 (arm64)...${NC}"
echo -e "${YELLOW}这可能需要几分钟，请查看下方进度...${NC}\n"
log_to_file "步骤 $STEP: 开始打包 Electron"

# 创建临时文件用于捕获输出
TEMP_OUTPUT=$(mktemp)
TEMP_ERROR=$(mktemp)

# 使用详细输出模式，同时保存到日志
{
    DEBUG=electron-builder:* npx electron-builder --mac --arm64 2>&1 | while IFS= read -r line; do
        # 记录所有输出到日志
        log_to_file "$line"
        
        # 检测关键阶段并显示进度
        if echo "$line" | grep -qE "(packaging|Packaging)"; then
            echo -e "${MAGENTA}📦 $line${NC}"
        elif echo "$line" | grep -qE "(installing|Installing)"; then
            echo -e "${CYAN}⬇️  $line${NC}"
        elif echo "$line" | grep -qE "(downloading|Downloading)"; then
            echo -e "${CYAN}⬇️  $line${NC}"
        elif echo "$line" | grep -qE "(building|Building)"; then
            echo -e "${BLUE}🔨 $line${NC}"
        elif echo "$line" | grep -qE "(compressing|Compressing)"; then
            echo -e "${BLUE}🗜️  $line${NC}"
        elif echo "$line" | grep -qE "(error|Error|ERROR|failed|Failed|FAILED)"; then
            echo -e "${RED}❌ $line${NC}" | tee -a "$ERROR_LOG"
            log_error_to_file "$line"
        elif echo "$line" | grep -qE "(warning|Warning|WARN)"; then
            echo -e "${YELLOW}⚠️  $line${NC}"
        elif echo "$line" | grep -qE "(success|Success|SUCCESS|complete|Complete|COMPLETE)"; then
            echo -e "${GREEN}✅ $line${NC}"
        else
            echo "$line"
        fi
    done
} 2>&1 | tee "$TEMP_OUTPUT"

# 检查构建结果
BUILD_EXIT_CODE=${PIPESTATUS[0]}
if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "\n${RED}❌ Electron 打包失败！${NC}"
    log_error_to_file "Electron 打包失败，退出码: $BUILD_EXIT_CODE"
    echo -e "${YELLOW}详细日志: $LOG_FILE${NC}"
    echo -e "${YELLOW}错误日志: $ERROR_LOG${NC}"
    echo -e "${CYAN}查看最近错误: tail -n 50 $ERROR_LOG${NC}"
    echo -e "${CYAN}查看完整日志: tail -n 100 $LOG_FILE${NC}"
    rm -f "$TEMP_OUTPUT" "$TEMP_ERROR"
    exit $BUILD_EXIT_CODE
fi

# 清理临时文件
rm -f "$TEMP_OUTPUT" "$TEMP_ERROR"

# 显示最终进度
show_progress $TOTAL_STEPS $TOTAL_STEPS
echo ""

# 显示构建结果
echo -e "\n${GREEN}✅ 构建完成！${NC}"
log_to_file "构建成功完成"

# 显示输出目录信息
if [ -d "release" ]; then
    echo -e "${CYAN}输出目录: release/${NC}"
    echo -e "${CYAN}构建产物:${NC}"
    ls -lh release/ 2>/dev/null | while read -r line; do
        echo -e "  ${GREEN}$line${NC}"
    done
    log_to_file "构建产物列表:"
    ls -lh release/ >> "$LOG_FILE" 2>/dev/null || true
else
    echo -e "${YELLOW}⚠ 未找到 release/ 目录${NC}"
    log_to_file "警告: 未找到 release/ 目录"
fi

# 显示日志文件位置
echo -e "\n${CYAN}📋 日志文件位置:${NC}"
echo -e "  完整日志: ${GREEN}$LOG_FILE${NC}"
echo -e "  错误日志: ${GREEN}$ERROR_LOG${NC}"
echo -e "\n${CYAN}💡 提示:${NC}"
echo -e "  查看最近错误: ${YELLOW}tail -n 50 $ERROR_LOG${NC}"
echo -e "  查看完整日志: ${YELLOW}tail -n 100 $LOG_FILE${NC}"
echo -e "  查看所有日志: ${YELLOW}ls -lth $LOG_DIR | head -10${NC}"

log_to_file "构建流程完成"
