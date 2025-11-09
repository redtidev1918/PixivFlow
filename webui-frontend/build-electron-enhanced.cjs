#!/usr/bin/env node

/**
 * 增强版 Electron 构建脚本
 * 使用开源工具提供更好的进度显示和错误处理
 * 
 * 依赖安装：
 * npm install --save-dev ora chalk fs-extra
 * 
 * 使用：
 * node build-electron-enhanced.js [proxy_url]
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// 尝试加载可选依赖
let ora, chalk;
try {
  ora = require('ora');
  chalk = require('chalk');
} catch (e) {
  console.warn('建议安装 ora 和 chalk 以获得更好的体验: npm install --save-dev ora chalk');
  // 简单的回退实现
  ora = {
    start: (text) => ({ 
      succeed: (t) => console.log(`✓ ${t || text}`),
      fail: (t) => console.error(`✗ ${t || text}`),
      info: (t) => console.log(`ℹ ${t || text}`),
      stop: () => {}
    })
  };
  chalk = {
    green: (t) => t,
    red: (t) => t,
    yellow: (t) => t,
    blue: (t) => t,
    cyan: (t) => t
  };
}

// 日志配置
const LOG_DIR = path.join(require('os').homedir(), '.pixiv-downloader-build-logs');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const LOG_FILE = path.join(LOG_DIR, `build_${TIMESTAMP}.log`);
const ERROR_LOG = path.join(LOG_DIR, `errors_${TIMESTAMP}.log`);

// 确保日志目录存在
fs.ensureDirSync(LOG_DIR);

// 日志函数
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
  if (level === 'ERROR') {
    fs.appendFileSync(ERROR_LOG, logMessage + '\n');
  }
}

// 执行命令并显示进度
function execWithProgress(command, description, options = {}) {
  return new Promise((resolve, reject) => {
    const spinner = ora(description).start();
    log(`开始: ${description}`);
    log(`命令: ${command}`);

    const child = spawn('sh', ['-c', command], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
      cwd: options.cwd || process.cwd()
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      log(text.trim(), 'OUTPUT');
      
      // 检测关键信息
      if (text.includes('error') || text.includes('Error') || text.includes('ERROR')) {
        spinner.warn(chalk.yellow('检测到警告或错误'));
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      log(text.trim(), 'ERROR');
    });

    child.on('close', (code) => {
      if (code === 0) {
        spinner.succeed(chalk.green(`${description} 完成`));
        log(`${description} 成功完成`);
        resolve({ stdout, stderr });
      } else {
        spinner.fail(chalk.red(`${description} 失败 (退出码: ${code})`));
        log(`${description} 失败，退出码: ${code}`, 'ERROR');
        log(`错误输出: ${stderr}`, 'ERROR');
        reject(new Error(`命令失败: ${command}\n退出码: ${code}\n${stderr}`));
      }
    });

    child.on('error', (error) => {
      spinner.fail(chalk.red(`${description} 执行错误`));
      log(`执行错误: ${error.message}`, 'ERROR');
      reject(error);
    });
  });
}

// 检查文件/目录是否存在
function checkExists(path, description) {
  if (fs.existsSync(path)) {
    log(`${description} 存在: ${path}`);
    return true;
  } else {
    log(`${description} 不存在: ${path}`, 'WARN');
    return false;
  }
}

// 主构建函数
async function build(proxyUrl) {
  console.log(chalk.blue('🚀 开始构建 Electron 应用...\n'));
  console.log(chalk.cyan(`日志文件: ${LOG_FILE}`));
  console.log(chalk.cyan(`错误日志: ${ERROR_LOG}\n`));

  log('=== 构建开始 ===');

  const scriptDir = __dirname;
  process.chdir(scriptDir);

  // 设置代理
  const env = { ...process.env };
  if (proxyUrl) {
    env.https_proxy = proxyUrl;
    env.http_proxy = proxyUrl;
    env.all_proxy = proxyUrl;
    console.log(chalk.yellow(`使用代理: ${proxyUrl}\n`));
    log(`使用代理: ${proxyUrl}`);
  }

  try {
    // 步骤 1: 构建前端
    await execWithProgress('npm run build', '构建前端', { env });

    // 步骤 2: 检查后端
    const projectRoot = path.resolve(scriptDir, '..');
    const backendDist = path.join(projectRoot, 'dist');
    
    if (!checkExists(backendDist, '后端构建目录')) {
      console.log(chalk.yellow('后端未构建，正在构建...'));
      await execWithProgress('npm run build', '构建后端', { 
        env, 
        cwd: projectRoot 
      });
    }

    // 步骤 2.5: 在 dist/webui 目录创建 package.json 以明确指定 CommonJS 模块类型
    // 这是最根本的解决方案：即使父目录有 "type": "module"，子目录的 package.json 会覆盖它
    const webuiDistDir = path.join(projectRoot, 'dist', 'webui');
    const webuiPackageJson = path.join(webuiDistDir, 'package.json');
    if (fs.existsSync(webuiDistDir)) {
      console.log(chalk.cyan('创建 dist/webui/package.json 以明确 CommonJS 模块类型...'));
      const packageJsonContent = {
        "type": "commonjs",
        "name": "pixivflow-webui-backend",
        "version": "1.0.0",
        "description": "PixivFlow WebUI Backend - CommonJS module"
      };
      fs.writeFileSync(webuiPackageJson, JSON.stringify(packageJsonContent, null, 2));
      log(`已创建 ${webuiPackageJson}`);
      console.log(chalk.green('✓ dist/webui/package.json 已创建，确保 CommonJS 模块类型'));
    } else {
      console.log(chalk.yellow(`⚠ dist/webui 目录不存在: ${webuiDistDir}`));
    }

    // 检查图标
    const iconPaths = [
      path.join(scriptDir, 'build', 'icon.icns'),
      path.join(scriptDir, 'build', 'icon.ico'),
      path.join(scriptDir, 'build', 'icon.png')
    ];
    
    const missingIcons = iconPaths.filter(p => !checkExists(p, '图标文件'));
    if (missingIcons.length > 0) {
      console.log(chalk.yellow(`⚠ 缺少 ${missingIcons.length} 个图标文件，将使用默认图标`));
    }

    // 步骤 3: 打包 Electron
    console.log(chalk.blue('\n开始打包 Electron 应用 (arm64)...'));
    console.log(chalk.yellow('这可能需要几分钟，请查看下方进度...\n'));

    await execWithProgress(
      'DEBUG=electron-builder:* npx electron-builder --mac --arm64',
      '打包 Electron 应用',
      { env }
    );

    // 检查输出目录
    const releaseDir = path.join(scriptDir, 'release');
    if (checkExists(releaseDir, '输出目录')) {
      console.log(chalk.green('\n✅ 构建完成！'));
      console.log(chalk.cyan(`输出目录: ${releaseDir}`));
      
      const files = fs.readdirSync(releaseDir);
      if (files.length > 0) {
        console.log(chalk.cyan('\n构建产物:'));
        files.forEach(file => {
          const filePath = path.join(releaseDir, file);
          const stats = fs.statSync(filePath);
          const size = (stats.size / 1024 / 1024).toFixed(2);
          console.log(chalk.green(`  ${file} (${size} MB)`));
        });
      }
    }

    console.log(chalk.cyan('\n📋 日志文件位置:'));
    console.log(chalk.green(`  完整日志: ${LOG_FILE}`));
    console.log(chalk.green(`  错误日志: ${ERROR_LOG}`));
    console.log(chalk.cyan('\n💡 提示:'));
    console.log(chalk.yellow(`  查看最近错误: tail -n 50 ${ERROR_LOG}`));
    console.log(chalk.yellow(`  查看完整日志: tail -n 100 ${LOG_FILE}`));

    log('=== 构建成功完成 ===');

  } catch (error) {
    console.error(chalk.red('\n❌ 构建失败！'));
    console.error(chalk.yellow(`详细日志: ${LOG_FILE}`));
    console.error(chalk.yellow(`错误日志: ${ERROR_LOG}`));
    console.error(chalk.red(`\n错误信息: ${error.message}`));
    
    log(`构建失败: ${error.message}`, 'ERROR');
    log(`错误堆栈: ${error.stack}`, 'ERROR');
    
    process.exit(1);
  }
}

// 运行构建
const proxyUrl = process.argv[2];
build(proxyUrl).catch(error => {
  console.error(chalk.red('未预期的错误:'), error);
  process.exit(1);
});


