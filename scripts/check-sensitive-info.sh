#!/bin/bash

# 检查敏感信息脚本
# 用于检查代码库中是否包含敏感信息（token、密码等）

set -e

echo "🔍 检查敏感信息..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查的文件和目录
FILES_TO_CHECK=(
  "config/standalone.config.json"
  "config/standalone.config.simple.json"
  ".env"
  ".env.local"
  ".refresh_token"
  ".pixiv-refresh-token"
)

# 敏感信息模式
SENSITIVE_PATTERNS=(
  "refreshToken.*[^YOUR_REFRESH_TOKEN]"
  "clientSecret.*[^lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj]"
  "password.*[^\"]"
  "api[_-]?key.*[^\"]"
  "secret.*[^\"]"
  "token.*[A-Za-z0-9]{20,}"
)

ERRORS=0

# 检查文件是否存在且包含敏感信息
check_file() {
  local file=$1
  if [ -f "$file" ]; then
    # 检查是否包含真实的refreshToken（不是占位符）
    if grep -q "refreshToken.*[A-Za-z0-9]\{20,\}" "$file" 2>/dev/null; then
      if ! grep -q "YOUR_REFRESH_TOKEN" "$file" 2>/dev/null; then
        # 检查文件是否被Git跟踪
        if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
          echo -e "${RED}❌ 错误: $file 包含真实的 refreshToken 且被Git跟踪!${NC}"
          echo -e "${RED}   请立即从Git中删除: git rm --cached $file${NC}"
          ERRORS=$((ERRORS + 1))
        else
          echo -e "${GREEN}✅ $file 包含真实token但未被Git跟踪（正常）${NC}"
        fi
      fi
    fi
  fi
}

# 检查Git跟踪的文件
check_git_tracked() {
  echo -e "\n📋 检查Git跟踪的文件..."
  
  # 检查备份文件是否被跟踪
  BACKUP_FILES=$(git ls-files config/ | grep -E "\.backup\." || true)
  if [ -n "$BACKUP_FILES" ]; then
    echo -e "${RED}❌ 发现被Git跟踪的备份文件:${NC}"
    echo "$BACKUP_FILES" | head -10
    echo -e "${RED}   请运行: git rm --cached config/standalone.config.json.backup.*${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}✅ 没有备份文件被Git跟踪${NC}"
  fi
  
  # 检查配置文件是否被跟踪
  if git ls-files --error-unmatch config/standalone.config.json >/dev/null 2>&1; then
    echo -e "${RED}❌ 错误: config/standalone.config.json 被Git跟踪!${NC}"
    echo -e "${RED}   请运行: git rm --cached config/standalone.config.json${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}✅ config/standalone.config.json 未被Git跟踪${NC}"
  fi
}

# 检查npm发布配置
check_npm_files() {
  echo -e "\n📦 检查npm发布配置..."
  
  if [ -f "package.json" ]; then
    # 检查files字段
    if grep -q "standalone.config.json" package.json; then
      echo -e "${RED}❌ 错误: package.json 的 files 字段包含 standalone.config.json!${NC}"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "${GREEN}✅ package.json 不包含敏感配置文件${NC}"
    fi
  fi
}

  # 检查代码中的硬编码敏感信息
  check_hardcoded_secrets() {
    echo -e "\n🔐 检查代码中的硬编码敏感信息..."
    
    # 排除node_modules和dist目录
    # 注意: clientId 和 clientSecret 是Pixiv的公开客户端凭证，不是敏感信息
    # 只检查 refreshToken（个人认证令牌）
    FOUND_SECRETS=$(grep -r -i --include="*.ts" --include="*.js" --include="*.json" \
      -E "refreshToken.*[A-Za-z0-9]{20,}" \
      --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=coverage \
      . 2>/dev/null | grep -v "YOUR_REFRESH_TOKEN" | grep -v "example" | grep -v "test" | grep -v "standalone.config.example" || true)
    
    if [ -n "$FOUND_SECRETS" ]; then
      echo -e "${YELLOW}⚠️  发现可能的硬编码敏感信息:${NC}"
      echo "$FOUND_SECRETS" | head -5
      echo -e "${YELLOW}   请仔细检查这些文件${NC}"
    else
      echo -e "${GREEN}✅ 未发现明显的硬编码敏感信息${NC}"
    fi
  }

# 执行所有检查
check_git_tracked
check_npm_files
check_hardcoded_secrets

for file in "${FILES_TO_CHECK[@]}"; do
  check_file "$file"
done

# 总结
echo -e "\n📊 检查完成"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ 未发现敏感信息泄露问题${NC}"
  exit 0
else
  echo -e "${RED}❌ 发现 $ERRORS 个问题，请修复后再提交代码${NC}"
  exit 1
fi
