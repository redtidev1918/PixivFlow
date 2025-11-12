# ============================================================================
# PixivFlow Dockerfile
# 使用多阶段构建优化镜像大小和构建速度
# ============================================================================

# ============================================================================
# 阶段 1: 构建阶段
# ============================================================================
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装构建依赖（Python、编译工具等）
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# 复制 package 文件（利用 Docker 缓存层）
COPY package*.json ./

# 安装所有依赖（包括开发依赖，用于构建）
RUN npm ci --only=production=false && \
    npm cache clean --force

# 复制 TypeScript 配置
COPY tsconfig.json ./

# 复制源代码
COPY src ./src

# 构建后端项目
RUN npm run build

# 构建前端项目（如果存在）
COPY webui-frontend ./webui-frontend
RUN if [ -f "webui-frontend/package.json" ]; then \
        cd webui-frontend && \
        npm ci && \
        npm run build; \
    fi

# ============================================================================
# 阶段 2: 生产阶段
# ============================================================================
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装运行时依赖
# - Python3: 用于 gppt 登录工具
# - make, g++: 用于编译 better-sqlite3 等原生模块
# - Chromium 和 ChromeDriver: 用于 gppt/Selenium 登录
# - 字体: 支持 headless 浏览器渲染
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    chromium \
    chromium-chromedriver \
    ttf-freefont \
    font-noto \
    && python3 -m pip install --no-cache-dir --break-system-packages gppt \
    && rm -rf /var/cache/apk/* \
    && rm -rf /root/.cache

# 复制 package 文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf /tmp/*

# 从构建阶段复制编译后的文件
COPY --from=builder /app/dist ./dist

# 从构建阶段复制前端构建文件（如果存在）
# 注意：如果前端目录不存在，这个命令会失败，但不会影响构建
# 在实际使用中，如果前端不存在，可以注释掉这一行
COPY --from=builder /app/webui-frontend/dist ./webui-frontend/dist

# 复制配置文件模板
COPY config ./config

# 创建必要的目录
RUN mkdir -p /app/data /app/downloads /app/config && \
    chmod -R 755 /app

# 设置环境变量
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    # Chromium 路径配置
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROMIUM_PATH=/usr/bin/chromium-browser \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    # 禁用 Chromium 沙箱（在容器中需要）
    CHROME_DEVEL_SANDBOX=/usr/lib/chromium/chrome-sandbox \
    # 其他配置
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 暴露 WebUI 端口
EXPOSE 3000

# 添加健康检查脚本
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('fs').existsSync('/app/data/pixiv-downloader.db') ? process.exit(0) : process.exit(1)" || exit 1

# 设置默认命令为定时任务模式
CMD ["node", "dist/index.js", "scheduler"]
