#!/bin/bash
#
# 🎯 超简单配置向导 - 小白专用版
# 功能: 3步完成配置，无需任何技术背景
# 使用: bash scripts/easy-setup.sh
#
# ⚠️ 重要说明：后端独立性
# 本脚本配置的是后端核心功能，完全独立于前端 WebUI。
# 所有配置和功能都可以通过命令行完美运行，无需前端支持。
#

set -e

# ============================================================
# 颜色输出
# ============================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo_info()    { echo -e "${BLUE}ℹ${NC} $*"; }
echo_success() { echo -e "${GREEN}✓${NC} $*"; }
echo_warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
echo_error()   { echo -e "${RED}✗${NC} $*"; }
echo_step()    { echo -e "${CYAN}▶${NC} $*"; }

# ============================================================
# 项目路径
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/standalone.config.json"

# ============================================================
# 欢迎界面
# ============================================================

show_welcome() {
    clear
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                                ║${NC}"
    echo -e "${CYAN}║          🎨 Pixiv 批量下载器 - 超简单配置向导                  ║${NC}"
    echo -e "${CYAN}║                                                                ║${NC}"
    echo -e "${CYAN}║          只需 3 步，小白也能轻松上手！                         ║${NC}"
    echo -e "${CYAN}║                                                                ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo_info "💡 后端独立性：本工具完全基于命令行，无需前端界面即可完美运行"
    echo ""
    echo_info "本向导将引导您完成所有配置，只需回答几个简单问题"
    echo ""
    read -p "按 Enter 键开始..." dummy
}

# ============================================================
# 第 1 步：登录 Pixiv
# ============================================================

step1_login() {
    clear
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  第 1 步：登录 Pixiv 账号                                      ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo_info "我们需要您的 Pixiv 账号信息来下载作品"
    echo ""
    
    # 检查 Python 依赖（如果选择自动登录）
    echo_info "检查 Python 依赖..."
    echo ""
    
    if [ -f "$PROJECT_ROOT/scripts/install-python-deps.sh" ]; then
        # 检查 Python 和 gppt
        if ! python3 -c "from gppt import GetPixivToken" >/dev/null 2>&1; then
            echo_warn "Python 依赖未安装（需要用于登录）"
            echo ""
            read -p "是否现在安装 Python 依赖？[Y/n，默认 Y]: " install_python
            install_python=${install_python:-Y}
            
            if [[ "$install_python" =~ ^[Yy]$ ]]; then
                echo ""
                echo_step "正在安装 Python 依赖..."
                echo ""
                
                if bash "$PROJECT_ROOT/scripts/install-python-deps.sh"; then
                    echo ""
                    echo_success "Python 依赖安装成功！"
                else
                    echo ""
                    echo_error "Python 依赖安装失败"
                    echo_warn "您可以稍后手动运行: bash scripts/install-python-deps.sh"
                    echo ""
                    read -p "按 Enter 继续（将使用手动输入 token 方式）..." dummy
                fi
            else
                echo_warn "跳过 Python 依赖安装，将使用手动输入 token 方式"
            fi
            echo ""
        else
            echo_success "Python 依赖已就绪"
            echo ""
        fi
    fi
    
    echo "有两种登录方式："
    echo ""
    echo "  ${CYAN}1. 自动登录${NC}（推荐）- 浏览器会自动打开，您只需登录即可"
    echo "     需要 Python 和 gppt（已检查）"
    echo "  ${CYAN}2. 手动输入${NC} - 如果您已经有 refresh token"
    echo "     不需要 Python 依赖"
    echo ""
    
    read -p "请选择登录方式 [1/2，默认 1]: " login_method
    login_method=${login_method:-1}
    
    if [ "$login_method" = "1" ]; then
        # 再次检查 Python 依赖
        if ! python3 -c "from gppt import GetPixivToken" >/dev/null 2>&1; then
            echo ""
            echo_error "Python 依赖未安装，无法使用自动登录"
            echo_warn "请选择手动输入方式，或先安装 Python 依赖"
            echo ""
            read -p "是否切换到手动输入方式？[Y/n，默认 Y]: " switch_method
            switch_method=${switch_method:-Y}
            
            if [[ "$switch_method" =~ ^[Yy]$ ]]; then
                login_method="2"
            else
                echo ""
                echo_error "无法继续，请先安装 Python 依赖"
                echo_info "运行: bash scripts/install-python-deps.sh"
                exit 1
            fi
        fi
        
        if [ "$login_method" = "1" ]; then
            echo ""
            echo_step "准备打开浏览器..."
            echo_info "请在浏览器中登录您的 Pixiv 账号"
            echo ""
            
            # 使用 CLI 命令进行登录
            cd "$PROJECT_ROOT" || exit 1
            if command -v pixivflow &> /dev/null; then
                pixivflow login
            else
                # 使用 npm run login
                npm run login
            fi
        fi
    fi
    
    if [ "$login_method" = "2" ]; then
        echo ""
        read -p "请输入您的 refresh token: " REFRESH_TOKEN
    fi
    
    echo ""
    echo_success "登录信息已保存！"
    echo ""
    read -p "按 Enter 继续..." dummy
}

# ============================================================
# 第 2 步：选择要下载什么
# ============================================================

step2_what_to_download() {
    clear
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  第 2 步：选择要下载什么                                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo_info "告诉我您想下载什么类型的作品"
    echo ""
    
    # 下载类型
    echo "要下载什么类型的作品？"
    echo "  ${CYAN}1.${NC} 插画（图片）"
    echo "  ${CYAN}2.${NC} 小说"
    echo "  ${CYAN}3.${NC} 两者都要"
    echo ""
    read -p "请选择 [1/2/3，默认 1]: " download_type
    download_type=${download_type:-1}
    
    # 搜索标签
    echo ""
    echo_info "输入您感兴趣的标签（关键词）"
    echo_warn "提示：可以使用中文、日文或英文，例如：風景、イラスト、cat、anime"
    echo ""
    read -p "请输入标签: " search_tag
    search_tag=${search_tag:-"イラスト"}
    
    # 下载数量
    echo ""
    echo_info "每次下载多少个作品？"
    echo_warn "建议：首次测试建议输入 1-5，确认正常后可增加"
    echo ""
    read -p "请输入数量 [默认 5]: " download_limit
    download_limit=${download_limit:-5}
    
    # 保存选择
    DOWNLOAD_TYPE="$download_type"
    SEARCH_TAG="$search_tag"
    DOWNLOAD_LIMIT="$download_limit"
    
    echo ""
    echo_success "已记录您的选择："
    case $download_type in
        1) echo "  • 类型：插画" ;;
        2) echo "  • 类型：小说" ;;
        3) echo "  • 类型：插画 + 小说" ;;
    esac
    echo "  • 标签：$search_tag"
    echo "  • 数量：$download_limit 个"
    echo ""
    read -p "按 Enter 继续..." dummy
}

# ============================================================
# 第 3 步：其他设置
# ============================================================

step3_other_settings() {
    clear
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  第 3 步：其他设置（可选）                                     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # 下载目录
    echo_info "文件保存位置"
    echo "默认保存在项目的 downloads 文件夹中"
    echo ""
    read -p "使用默认位置吗？[Y/n，默认 Y]: " use_default_dir
    use_default_dir=${use_default_dir:-Y}
    
    if [[ "$use_default_dir" =~ ^[Nn]$ ]]; then
        read -p "请输入自定义路径: " custom_dir
        DOWNLOAD_DIR="$custom_dir"
    else
        DOWNLOAD_DIR="./downloads"
    fi
    
    # 定时下载
    echo ""
    echo_info "是否启用定时自动下载？"
    echo "启用后，程序会每天固定时间自动下载新作品"
    echo ""
    read -p "启用定时下载吗？[y/N，默认 N]: " enable_cron
    enable_cron=${enable_cron:-N}
    
    if [[ "$enable_cron" =~ ^[Yy]$ ]]; then
        ENABLE_CRON=true
        
        echo ""
        echo "请选择下载时间："
        echo "  ${CYAN}1.${NC} 每天凌晨 3 点（推荐，避开高峰期）"
        echo "  ${CYAN}2.${NC} 每天中午 12 点"
        echo "  ${CYAN}3.${NC} 每天晚上 9 点"
        echo "  ${CYAN}4.${NC} 自定义"
        echo ""
        read -p "请选择 [1/2/3/4，默认 1]: " cron_time
        cron_time=${cron_time:-1}
        
        case $cron_time in
            1) CRON_SCHEDULE="0 3 * * *" ;;
            2) CRON_SCHEDULE="0 12 * * *" ;;
            3) CRON_SCHEDULE="0 21 * * *" ;;
            4) 
                echo ""
                echo_info "Cron 格式说明：分 时 日 月 周"
                echo_info "例如：0 3 * * * 表示每天凌晨3点"
                read -p "请输入 cron 表达式: " CRON_SCHEDULE
                ;;
        esac
    else
        ENABLE_CRON=false
        CRON_SCHEDULE="0 3 * * *"
    fi
    
    echo ""
    echo_success "设置已完成！"
    echo ""
    read -p "按 Enter 生成配置文件..." dummy
}

# ============================================================
# 生成配置文件
# ============================================================

generate_config() {
    clear
    echo ""
    echo_step "正在生成配置文件..."
    echo ""
    
    # 创建配置目录
    mkdir -p "$PROJECT_ROOT/config"
    mkdir -p "$PROJECT_ROOT/data"
    mkdir -p "$PROJECT_ROOT/downloads"
    
    # 获取 refresh token（如果存在临时文件）
    if [ -f "$PROJECT_ROOT/.refresh_token" ]; then
        REFRESH_TOKEN=$(cat "$PROJECT_ROOT/.refresh_token")
        rm -f "$PROJECT_ROOT/.refresh_token"
    fi
    
    # 构建 targets 数组
    targets="["
    
    if [ "$DOWNLOAD_TYPE" = "1" ] || [ "$DOWNLOAD_TYPE" = "3" ]; then
        targets="${targets}
    {
      \"type\": \"illustration\",
      \"tag\": \"$SEARCH_TAG\",
      \"limit\": $DOWNLOAD_LIMIT,
      \"searchTarget\": \"partial_match_for_tags\"
    }"
    fi
    
    if [ "$DOWNLOAD_TYPE" = "2" ] || [ "$DOWNLOAD_TYPE" = "3" ]; then
        if [ "$DOWNLOAD_TYPE" = "3" ]; then
            targets="${targets},"
        fi
        targets="${targets}
    {
      \"type\": \"novel\",
      \"tag\": \"$SEARCH_TAG\",
      \"limit\": $DOWNLOAD_LIMIT,
      \"searchTarget\": \"partial_match_for_tags\"
    }"
    fi
    
    targets="${targets}
  ]"
    
    # 生成配置文件
    cat > "$CONFIG_FILE" << EOF
{
  "logLevel": "info",
  "pixiv": {
    "clientId": "MOBrBDS8blbauoSck0ZfDbtuzpyT",
    "clientSecret": "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj",
    "deviceToken": "pixiv",
    "refreshToken": "${REFRESH_TOKEN:-YOUR_REFRESH_TOKEN}",
    "userAgent": "PixivAndroidApp/5.0.234 (Android 11; Pixel 6)"
  },
  "network": {
    "timeoutMs": 15000,
    "retries": 3
  },
  "storage": {
    "databasePath": "./data/pixiv-downloader.db",
    "downloadDirectory": "$DOWNLOAD_DIR",
    "illustrationDirectory": "$DOWNLOAD_DIR/illustrations",
    "novelDirectory": "$DOWNLOAD_DIR/novels"
  },
  "scheduler": {
    "enabled": $ENABLE_CRON,
    "cron": "$CRON_SCHEDULE",
    "timezone": "Asia/Shanghai"
  },
  "targets": $targets
}
EOF
    
    echo_success "配置文件已生成: $CONFIG_FILE"
    echo ""
}

# ============================================================
# 显示完成信息
# ============================================================

show_completion() {
    clear
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}║                    🎉 配置完成！                                ║${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}📋 配置摘要${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    case $DOWNLOAD_TYPE in
        1) echo "  ✓ 下载类型：插画" ;;
        2) echo "  ✓ 下载类型：小说" ;;
        3) echo "  ✓ 下载类型：插画 + 小说" ;;
    esac
    
    echo "  ✓ 搜索标签：$SEARCH_TAG"
    echo "  ✓ 每次数量：$DOWNLOAD_LIMIT 个"
    echo "  ✓ 保存位置：$DOWNLOAD_DIR"
    
    if [ "$ENABLE_CRON" = true ]; then
        echo "  ✓ 定时下载：已启用"
    else
        echo "  ✓ 定时下载：未启用"
    fi
    
    echo ""
    echo -e "${CYAN}🚀 下一步操作${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  ${GREEN}1. 测试下载（推荐）${NC}"
    echo "     立即测试下载功能是否正常："
    echo "     ${YELLOW}npm run test:download${NC}"
    echo ""
    echo "  ${GREEN}2. 手动运行一次${NC}"
    echo "     手动执行一次下载："
    echo "     ${YELLOW}./scripts/pixiv.sh once${NC}"
    echo "     或: ${YELLOW}npm run download${NC}"
    echo ""
    
    if [ "$ENABLE_CRON" = true ]; then
        echo "  ${GREEN}3. 启动定时下载${NC}"
        echo "     启动后台定时任务："
        echo "     ${YELLOW}./scripts/pixiv.sh run${NC}"
        echo "     或: ${YELLOW}npm run scheduler${NC}"
        echo ""
    fi
    
    echo -e "${CYAN}💡 小贴士${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  • 配置文件位置：config/standalone.config.json"
    echo "  • 随时可以手动编辑配置文件"
    echo "  • 重新运行本向导可覆盖现有配置"
    echo "  • 下载的文件会保存在：$DOWNLOAD_DIR"
    echo ""
    
    echo -e "${GREEN}准备好开始测试了吗？${NC}"
    echo ""
    read -p "是否立即运行测试？[Y/n]: " run_test
    run_test=${run_test:-Y}
    
    if [[ "$run_test" =~ ^[Yy]$ ]]; then
        echo ""
        echo_step "正在启动测试..."
        sleep 1
        cd "$PROJECT_ROOT"
        npm run test:download
    else
        echo ""
        echo_info "配置完成！您可以随时运行："
        echo "  ${YELLOW}npm run test:download${NC}"
        echo ""
    fi
}

# ============================================================
# 主流程
# ============================================================

main() {
    show_welcome
    step1_login
    step2_what_to_download
    step3_other_settings
    generate_config
    show_completion
}

# ============================================================
# 执行
# ============================================================

main "$@"

