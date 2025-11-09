#!/bin/bash

# 构建环境检查脚本
# 快速检查所有构建所需的条件是否满足

set -e

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 检查构建环境...${NC}\n"

ERRORS=0
WARNINGS=0

# 检查 Node.js
echo -n "检查 Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} $NODE_VERSION"
else
    echo -e "${RED}✗ 未安装${NC}"
    ((ERRORS++))
fi

# 检查 npm
echo -n "检查 npm... "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓${NC} $NPM_VERSION"
else
    echo -e "${RED}✗ 未安装${NC}"
    ((ERRORS++))
fi

# 检查依赖
echo -n "检查 node_modules... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} 已安装"
else
    echo -e "${YELLOW}⚠${NC} 未安装，运行 'npm install'"
    ((WARNINGS++))
fi

# 检查 Electron
echo -n "检查 Electron... "
if [ -f "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ] || [ -f "node_modules/.bin/electron" ]; then
    ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version" 2>/dev/null || echo "未知")
    echo -e "${GREEN}✓${NC} $ELECTRON_VERSION"
else
    echo -e "${YELLOW}⚠${NC} 未安装，构建时会自动安装"
    ((WARNINGS++))
fi

# 检查 electron-builder
echo -n "检查 electron-builder... "
if [ -f "node_modules/.bin/electron-builder" ]; then
    BUILDER_VERSION=$(node -p "require('./node_modules/electron-builder/package.json').version" 2>/dev/null || echo "未知")
    echo -e "${GREEN}✓${NC} $BUILDER_VERSION"
else
    echo -e "${YELLOW}⚠${NC} 未安装，运行 'npm install'"
    ((WARNINGS++))
fi

# 检查前端构建
echo -n "检查前端构建 (dist/)... "
if [ -d "dist" ] && [ -f "dist/index.html" ]; then
    echo -e "${GREEN}✓${NC} 已构建"
else
    echo -e "${YELLOW}⚠${NC} 未构建，构建时会自动构建"
    ((WARNINGS++))
fi

# 检查后端构建
echo -n "检查后端构建 (../../dist/)... "
if [ -d "../../dist" ]; then
    echo -e "${GREEN}✓${NC} 已构建"
else
    echo -e "${YELLOW}⚠${NC} 未构建，构建时会自动构建"
    ((WARNINGS++))
fi

# 检查图标文件
echo -n "检查图标文件... "
ICONS_FOUND=0
if [ -f "build/icon.icns" ]; then
    ((ICONS_FOUND++))
fi
if [ -f "build/icon.ico" ]; then
    ((ICONS_FOUND++))
fi
if [ -f "build/icon.png" ]; then
    ((ICONS_FOUND++))
fi

if [ $ICONS_FOUND -eq 0 ]; then
    echo -e "${YELLOW}⚠${NC} 未找到图标文件（将使用默认图标）"
    ((WARNINGS++))
elif [ $ICONS_FOUND -lt 3 ]; then
    echo -e "${YELLOW}⚠${NC} 部分图标缺失（找到 $ICONS_FOUND/3）"
    ((WARNINGS++))
else
    echo -e "${GREEN}✓${NC} 所有图标已就绪"
fi

# 检查权限文件
echo -n "检查 macOS 权限配置... "
if [ -f "build/entitlements.mac.plist" ]; then
    echo -e "${GREEN}✓${NC} 已配置"
else
    echo -e "${RED}✗${NC} 缺失（macOS 构建需要）"
    ((ERRORS++))
fi

# 检查磁盘空间（至少需要 2GB）
echo -n "检查磁盘空间... "
AVAILABLE_KB=$(df -k . | tail -1 | awk '{print $4}')
AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
if [ $AVAILABLE_GB -gt 2 ]; then
    echo -e "${GREEN}✓${NC} 充足 (约 ${AVAILABLE_GB}GB)"
else
    echo -e "${YELLOW}⚠${NC} 可能不足（当前约 ${AVAILABLE_GB}GB，建议至少 2GB）"
    ((WARNINGS++))
fi

# 总结
echo ""
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ 所有检查通过！可以开始构建。${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ 有 $WARNINGS 个警告，但可以继续构建。${NC}"
    exit 0
else
    echo -e "${RED}✗ 发现 $ERRORS 个错误，$WARNINGS 个警告。请先解决错误。${NC}"
    exit 1
fi

