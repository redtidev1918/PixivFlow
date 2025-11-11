#!/bin/bash
# Script to check for sensitive information in the repository
# Usage: ./scripts/check-sensitive-info.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🔍 扫描仓库中的敏感信息...${NC}\n"

# Patterns to detect
PATTERNS=(
    'refreshToken["\s:=]+[^"\s]{30,}'
    'token["\s:=]+[^"\s]{20,}'
    'api[_-]?key["\s:=]+[^"\s]{20,}'
    'secret["\s:=]+[^"\s]{20,}'
)

# Files to exclude
EXCLUDE=(
    'node_modules'
    '.git'
    'dist'
    'coverage'
    '*.log'
    'scripts/check-sensitive-info.sh'
    '.git/hooks/pre-commit'
)

# Build find exclude options
FIND_EXCLUDE=""
for pattern in "${EXCLUDE[@]}"; do
    FIND_EXCLUDE="$FIND_EXCLUDE -not -path '*/$pattern/*' -not -name '$pattern'"
done

# Find all text files
FILES=$(eval "find . -type f $FIND_EXCLUDE \( -name '*.ts' -o -name '*.js' -o -name '*.json' -o -name '*.md' -o -name '*.txt' -o -name '*.sh' \)" | grep -v node_modules | grep -v .git | grep -v dist)

FOUND_ISSUES=0

for file in $FILES; do
    # Skip if file doesn't exist or is binary
    if [ ! -f "$file" ] || file "$file" | grep -q "binary"; then
        continue
    fi
    
    # Check each pattern
    for pattern in "${PATTERNS[@]}"; do
        # Check for matches, excluding placeholders
        matches=$(grep -iE "$pattern" "$file" 2>/dev/null | grep -vE "(YOUR_REFRESH_TOKEN|REDACTED|PLACEHOLDER|YOUR_|example|placeholder)" || true)
        
        if [ -n "$matches" ]; then
            echo -e "${RED}⚠️  发现可疑内容: $file${NC}"
            echo "$matches" | sed 's/^/  /'
            echo ""
            FOUND_ISSUES=1
        fi
    done
done

# Check Git history
echo -e "${YELLOW}📜 检查 Git 历史...${NC}"
HISTORY_ISSUES=$(git log --all --source --full-history -p 2>/dev/null | grep -iE "refreshToken.*[^YOUR_]{30,}" | grep -vE "(REDACTED|YOUR_REFRESH_TOKEN|PLACEHOLDER)" | head -5 || true)

if [ -n "$HISTORY_ISSUES" ]; then
    echo -e "${RED}⚠️  Git 历史中可能包含敏感信息:${NC}"
    echo "$HISTORY_ISSUES" | sed 's/^/  /'
    FOUND_ISSUES=1
else
    echo -e "${GREEN}✅ Git 历史检查通过${NC}"
fi

echo ""

if [ $FOUND_ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ 未发现敏感信息${NC}"
    exit 0
else
    echo -e "${RED}❌ 发现可疑的敏感信息，请检查上述文件${NC}"
    exit 1
fi

