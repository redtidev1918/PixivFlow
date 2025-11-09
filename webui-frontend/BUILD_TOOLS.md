# 构建工具和参考项目

本文档介绍了一些可以帮助改进 Electron 应用构建流程的开源工具和参考项目。

## 🛠️ 实用的构建工具

### 1. **pv (Pipe Viewer)** - 进度条工具
一个简单的命令行工具，可以在管道中显示进度条。

**安装：**
```bash
# macOS
brew install pv

# Linux
sudo apt-get install pv
```

**使用示例：**
```bash
npm run build | pv -l -s 100
```

**GitHub:** https://github.com/icetee/pv

---

### 2. **progress** - Node.js 进度条库
一个强大的 Node.js 进度条库，可以在构建脚本中使用。

**安装：**
```bash
npm install --save-dev progress
```

**使用示例：**
```javascript
const ProgressBar = require('progress');
const bar = new ProgressBar(':bar :percent', { total: 100 });
```

**GitHub:** https://github.com/visionmedia/node-progress

---

### 3. **ora** - 优雅的终端加载动画
提供漂亮的加载动画和进度指示器。

**安装：**
```bash
npm install --save-dev ora
```

**使用示例：**
```javascript
const ora = require('ora');
const spinner = ora('构建中...').start();
// ... 构建过程
spinner.succeed('构建完成！');
```

**GitHub:** https://github.com/sindresorhus/ora

---

### 4. **listr** - 任务列表和进度显示
可以创建漂亮的任务列表，显示多个并行或串行任务的进度。

**安装：**
```bash
npm install --save-dev listr
```

**GitHub:** https://github.com/SamVerschueren/listr

---

### 5. **winston** - 强大的日志库
提供结构化日志记录，支持多种传输方式（文件、控制台等）。

**安装：**
```bash
npm install --save-dev winston
```

**GitHub:** https://github.com/winstonjs/winston

---

## 📚 优秀的 Electron 构建参考项目

### 1. **VSCode** (Visual Studio Code)
- **GitHub:** https://github.com/microsoft/vscode
- **特点：** 完善的构建脚本，多平台支持，详细的构建文档
- **参考文件：** `build/` 目录下的构建脚本

### 2. **Obsidian**
- **GitHub:** https://github.com/obsidianmd/obsidian-releases
- **特点：** 清晰的构建流程，良好的错误处理

### 3. **Electron Forge**
- **GitHub:** https://github.com/electron/forge
- **特点：** Electron 官方推荐的构建工具，提供完整的构建解决方案
- **文档：** https://www.electronforge.io/

### 4. **Electron Builder**
- **GitHub:** https://github.com/electron-userland/electron-builder
- **特点：** 您已经在使用的工具，可以查看其示例项目

### 5. **Hyper**
- **GitHub:** https://github.com/vercel/hyper
- **特点：** 简洁的构建配置，现代化的构建流程

### 6. **Atom**
- **GitHub:** https://github.com/atom/atom
- **特点：** 虽然已停止维护，但构建脚本仍然值得参考

---

## 🔧 推荐的构建脚本增强方案

### 方案 1: 使用 Node.js 脚本替代 Bash
创建一个 `build.js` 文件，使用 Node.js 的进度条库：

```javascript
// build.js
const { execSync } = require('child_process');
const ora = require('ora');
const chalk = require('chalk');

const steps = [
  { name: '构建前端', command: 'npm run build' },
  { name: '检查后端', command: 'cd .. && npm run build' },
  { name: '打包 Electron', command: 'npx electron-builder --mac --arm64' }
];

async function build() {
  for (const step of steps) {
    const spinner = ora(step.name).start();
    try {
      execSync(step.command, { stdio: 'inherit' });
      spinner.succeed(chalk.green(`${step.name} 完成`));
    } catch (error) {
      spinner.fail(chalk.red(`${step.name} 失败`));
      console.error(error);
      process.exit(1);
    }
  }
}

build();
```

### 方案 2: 使用 Electron Forge
Electron Forge 提供了更现代化的构建体验：

```bash
npm install --save-dev @electron-forge/cli
npx electron-forge import
npx electron-forge make
```

### 方案 3: 增强现有 Bash 脚本
使用 `pv` 或其他工具增强现有的 bash 脚本：

```bash
# 安装 pv
brew install pv

# 在构建脚本中使用
npm run build 2>&1 | pv -l -s 100 -N "构建进度"
```

---

## 📖 有用的文档和资源

1. **Electron Builder 文档：** https://www.electron.build/
2. **Electron 官方文档：** https://www.electronjs.org/docs
3. **Bash 脚本最佳实践：** https://github.com/koalaman/shellcheck

---

## 💡 建议

对于您的项目，我建议：

1. **短期方案：** 继续使用增强后的 bash 脚本（已实现进度条和日志）
2. **中期方案：** 考虑使用 `ora` 或 `listr` 创建 Node.js 构建脚本
3. **长期方案：** 如果项目复杂度增加，考虑迁移到 Electron Forge

当前实现的增强功能已经包含了：
- ✅ 进度条显示
- ✅ 详细的日志记录
- ✅ 错误捕获和报告
- ✅ 时间戳记录
- ✅ 日志文件管理

这些功能已经足够满足大多数构建需求了！


