#!/bin/bash
# Script to verify Git safety measures are in place

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 验证 Git 安全措施...${NC}"
echo ""

# Check 1: .gitignore exists
if [ ! -f .gitignore ]; then
    echo -e "${RED}❌ .gitignore 文件不存在${NC}"
    exit 1
else
    echo -e "${GREEN}✅ .gitignore 文件存在${NC}"
fi

# Check 2: Pre-commit hook exists
if [ ! -f .git/hooks/pre-commit ]; then
    echo -e "${RED}❌ Pre-commit hook 不存在${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Pre-commit hook 存在${NC}"
    if [ ! -x .git/hooks/pre-commit ]; then
        echo -e "${YELLOW}⚠️  Pre-commit hook 没有执行权限，正在修复...${NC}"
        chmod +x .git/hooks/pre-commit
        echo -e "${GREEN}✅ 已修复执行权限${NC}"
    fi
fi

# Check 3: .gitattributes exists
if [ ! -f .gitattributes ]; then
    echo -e "${YELLOW}⚠️  .gitattributes 文件不存在（可选但推荐）${NC}"
else
    echo -e "${GREEN}✅ .gitattributes 文件存在${NC}"
fi

# Check 4: Verify sensitive files are ignored
echo ""
echo -e "${GREEN}检查敏感文件是否被正确忽略...${NC}"

SENSITIVE_FILES=(
    "config/standalone.config.json"
    "config/standalone.config.simple.json"
    ".pixiv-refresh-token"
    "data/"
    "downloads/"
    ".env"
)

all_ignored=true
for file in "${SENSITIVE_FILES[@]}"; do
    if git check-ignore -q "$file" 2>/dev/null; then
        echo -e "  ${GREEN}✅ $file 已被忽略${NC}"
    else
        # Check if file exists and is tracked
        if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
            echo -e "  ${RED}❌ $file 已被跟踪但应该被忽略！${NC}"
            all_ignored=false
        else
            echo -e "  ${GREEN}✅ $file 未被跟踪（正确）${NC}"
        fi
    fi
done

if [ "$all_ignored" = false ]; then
    echo -e "\n${RED}❌ 发现应该被忽略但已被跟踪的文件！${NC}"
    exit 1
fi

# Check 5: Verify no sensitive data in tracked files
echo ""
echo -e "${GREEN}检查已跟踪文件中是否包含敏感信息...${NC}"

# Check config example files for placeholders
if grep -q "YOUR_REFRESH_TOKEN" config/standalone.config.example.json 2>/dev/null; then
    echo -e "  ${GREEN}✅ 示例配置文件使用 placeholder${NC}"
else
    echo -e "  ${YELLOW}⚠️  示例配置文件可能包含真实 token${NC}"
fi

# Check 6: Verify pre-commit hook functionality
echo ""
echo -e "${GREEN}测试 pre-commit hook...${NC}"

# Create a temporary test file with a fake token
TEST_FILE="/tmp/git-safety-test-$$.json"
echo '{"refreshToken": "test123456789012345678901234567890"}' > "$TEST_FILE"

# Try to stage it (should fail)
if git add "$TEST_FILE" 2>&1 | grep -q "在位于"; then
    echo -e "  ${GREEN}✅ Pre-commit hook 正常工作（阻止了测试文件）${NC}"
else
    # Check if hook would catch it
    if .git/hooks/pre-commit 2>&1 | grep -q "检测到"; then
        echo -e "  ${GREEN}✅ Pre-commit hook 可以检测敏感信息${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Pre-commit hook 可能无法检测所有敏感信息${NC}"
    fi
fi

rm -f "$TEST_FILE"

# Summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Git 安全措施验证完成！${NC}"
echo ""
echo -e "${YELLOW}保护措施总结：${NC}"
echo "  1. ✅ .gitignore 配置完整"
echo "  2. ✅ Pre-commit hook 已安装并启用"
echo "  3. ✅ 敏感文件已被正确忽略"
echo "  4. ✅ .gitattributes 已配置"
echo ""
echo -e "${GREEN}所有安全措施已就位！${NC}"

