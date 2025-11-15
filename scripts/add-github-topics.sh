#!/bin/bash

# GitHub Topics 添加脚本
# 使用 GitHub CLI 为仓库添加 Topics

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 开始为 GitHub 仓库添加 Topics...${NC}\n"

# 检查 GitHub CLI 是否已安装
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 GitHub CLI (gh)${NC}"
    echo -e "${YELLOW}请先安装 GitHub CLI: https://cli.github.com/${NC}"
    exit 1
fi

# 检查是否已登录
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠️  未登录 GitHub CLI，正在尝试登录...${NC}"
    gh auth login
fi

# 获取仓库信息
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")

if [ -z "$REPO" ]; then
    echo -e "${YELLOW}⚠️  无法自动检测仓库，请手动输入仓库名称（格式: owner/repo）${NC}"
    read -p "仓库名称: " REPO
fi

echo -e "${GREEN}📦 仓库: ${REPO}${NC}\n"

# 定义 Topics 列表（最多20个，GitHub限制）
TOPICS=(
    "pixiv"
    "pixiv-downloader"
    "pixiv-batch-downloader"
    "pixiv-automation"
    "pixiv-cli"
    "pixiv-api"
    "pixiv-scheduler"
    "pixiv-artwork-downloader"
    "pixiv-novel-downloader"
    "pixiv-webui"
    "pixiv-docker"
    "nodejs"
    "typescript"
    "cli"
    "automation"
    "docker"
    "downloader"
    "batch-download"
    "cross-platform"
    "server"
)

echo -e "${GREEN}📋 准备添加以下 Topics (共 ${#TOPICS[@]} 个):${NC}"
for topic in "${TOPICS[@]}"; do
    echo -e "  - ${topic}"
done

echo ""
read -p "是否继续添加这些 Topics? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ 已取消${NC}"
    exit 0
fi

# 将数组转换为逗号分隔的字符串
TOPICS_STR=$(IFS=','; echo "${TOPICS[*]}")

echo -e "${GREEN}🔄 正在添加 Topics...${NC}"

# 使用 GitHub CLI 添加 topics
if gh repo edit "$REPO" --add-topic "$TOPICS_STR"; then
    echo -e "${GREEN}✅ 成功添加 Topics!${NC}\n"
    echo -e "${GREEN}📊 当前仓库 Topics:${NC}"
    gh repo view "$REPO" --json repositoryTopics -q '.repositoryTopics[].topic.name' | sort
else
    echo -e "${RED}❌ 添加 Topics 失败${NC}"
    echo -e "${YELLOW}💡 提示: 可以手动在 GitHub 网页上添加 Topics${NC}"
    exit 1
fi

echo -e "\n${GREEN}✨ 完成!${NC}"
echo -e "${YELLOW}💡 提示: 可以在 GitHub 仓库页面的 'About' 部分查看和编辑 Topics${NC}"

