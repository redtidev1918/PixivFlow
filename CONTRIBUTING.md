# 贡献指南

欢迎提交 Issue 和 Pull Request。

## 报告问题

在 [GitHub Issues](https://github.com/redtidev1918/PixivFlow/issues) 中搜索后新建 Issue，说明问题
或建议。如果是 Bug，请附上复现步骤、`pixivflow health` 输出和版本号；配置文件与输出里可能
含认证信息，贴出来之前先删掉 token。

## 提交代码

1. Fork 项目
2. 创建特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交改动（`git commit -m 'Add some AmazingFeature'`）
4. 推送分支（`git push origin feature/AmazingFeature`）
5. 开启 Pull Request

## 代码规范

- 使用 TypeScript，遵循项目现有代码风格，补充必要的类型注解
- 提交前运行 `npm run build`，并用 ESLint 检查

提交信息使用 Conventional Commits：

```
feat: 添加新功能
fix: 修复 Bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
chore: 其他更改
```

## 测试

提交前确认 `npm run build` 与 `npm test` 通过（存在相关测试时），并手动验证改动涉及的功能。

## 文档

功能变更同步更新 [docs/USAGE.md](docs/USAGE.md)，配置项变更同步更新
[docs/CONFIG.md](docs/CONFIG.md)，WebUI 接口变更同步更新 [docs/API.md](docs/API.md)。

## 代码审查

所有 Pull Request 都会经过审查。请保持改动简洁、补充必要注释、确保测试通过，并响应审查意见。

## 获取帮助

[GitHub Issues](https://github.com/redtidev1918/PixivFlow/issues) 与
[GitHub Discussions](https://github.com/redtidev1918/PixivFlow/discussions)。
