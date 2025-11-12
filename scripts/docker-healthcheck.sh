#!/bin/sh
# ============================================================================
# Docker 健康检查脚本
# ============================================================================
# 
# 此脚本用于 Docker 容器的健康检查
# 检查数据库文件是否存在，以及应用是否正常运行
# ============================================================================

set -e

# 数据库文件路径
DB_PATH="${PIXIV_DATABASE_PATH:-/app/data/pixiv-downloader.db}"

# 检查数据库文件是否存在
if [ ! -f "$DB_PATH" ]; then
    echo "Health check failed: Database file not found at $DB_PATH"
    exit 1
fi

# 检查数据库文件是否可读
if [ ! -r "$DB_PATH" ]; then
    echo "Health check failed: Database file is not readable"
    exit 1
fi

# 如果提供了 WebUI 端口，检查 WebUI 是否可访问
if [ -n "$PORT" ] && [ "$PORT" != "0" ]; then
    if command -v wget >/dev/null 2>&1; then
        if ! wget --quiet --tries=1 --timeout=5 --spider "http://localhost:${PORT}/health" 2>/dev/null; then
            echo "Health check failed: WebUI not responding"
            exit 1
        fi
    elif command -v curl >/dev/null 2>&1; then
        if ! curl -f -s -o /dev/null --max-time 5 "http://localhost:${PORT}/health" 2>/dev/null; then
            echo "Health check failed: WebUI not responding"
            exit 1
        fi
    fi
fi

# 所有检查通过
exit 0

