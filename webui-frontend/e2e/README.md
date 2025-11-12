# E2E 测试快速参考

## 快速开始

```bash
# 安装浏览器（首次运行）
npx playwright install

# 运行所有测试
npm run test:e2e

# 运行测试并显示 UI（推荐）
npm run test:e2e:ui

# 运行测试并显示浏览器
npm run test:e2e:headed

# 调试模式
npm run test:e2e:debug
```

## 测试文件

- `auth.spec.ts` - 认证流程测试
- `navigation.spec.ts` - 导航和路由测试
- `dashboard.spec.ts` - 仪表板功能测试
- `config.spec.ts` - 配置管理测试
- `download.spec.ts` - 下载管理测试
- `files.spec.ts` - 文件浏览测试

## 详细文档

请参阅 [E2E_TESTING_GUIDE.md](../docs/E2E_TESTING_GUIDE.md) 获取完整的使用指南。

