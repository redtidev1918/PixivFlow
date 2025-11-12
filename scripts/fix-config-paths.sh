#!/bin/bash
# 修复配置文件路径问题

echo "=========================================="
echo "配置文件路径修复工具"
echo "=========================================="
echo ""

# 检查配置文件
CONFIG_FILE="../Documents/PixivBatchDownloader-master/config/standalone.config.simple.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    exit 1
fi

echo "✅ 找到配置文件: $CONFIG_FILE"
echo ""

# 获取项目根目录的绝对路径
PROJECT_ROOT=$(cd "$(dirname "$CONFIG_FILE")/.." && pwd)
echo "项目根目录: $PROJECT_ROOT"
echo ""

# 使用 Node.js 修复配置文件中的路径
node <<EOF
const fs = require('fs');
const path = require('path');

const configPath = '$CONFIG_FILE';
const projectRoot = '$PROJECT_ROOT';

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  
  // 修复存储路径为绝对路径
  if (config.storage) {
    if (config.storage.downloadDirectory && !path.isAbsolute(config.storage.downloadDirectory)) {
      config.storage.downloadDirectory = path.resolve(projectRoot, config.storage.downloadDirectory);
      console.log('✅ 修复下载目录:', config.storage.downloadDirectory);
    }
    
    if (config.storage.illustrationDirectory && !path.isAbsolute(config.storage.illustrationDirectory)) {
      config.storage.illustrationDirectory = path.resolve(projectRoot, config.storage.illustrationDirectory);
      console.log('✅ 修复插画目录:', config.storage.illustrationDirectory);
    }
    
    if (config.storage.novelDirectory && !path.isAbsolute(config.storage.novelDirectory)) {
      config.storage.novelDirectory = path.resolve(projectRoot, config.storage.novelDirectory);
      console.log('✅ 修复小说目录:', config.storage.novelDirectory);
    }
    
    if (config.storage.databasePath && !path.isAbsolute(config.storage.databasePath)) {
      config.storage.databasePath = path.resolve(projectRoot, config.storage.databasePath);
      console.log('✅ 修复数据库路径:', config.storage.databasePath);
    }
  }
  
  // 保存修复后的配置
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('');
  console.log('✅ 配置文件已更新！');
  
} catch (error) {
  console.error('❌ 修复失败:', error.message);
  process.exit(1);
}
EOF

echo ""
echo "=========================================="
echo "修复完成！"
echo "=========================================="
echo ""
echo "建议："
echo "1. 重新运行下载命令测试路径是否正确"
echo "2. 如果使用全局安装，请重新安装: npm install -g pixivflow"
echo "3. 检查下载的文件是否保存在正确的目录"

