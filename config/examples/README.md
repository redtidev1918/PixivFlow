# 示例配置文件说明

本目录包含 PixivFlow 的各种配置文件示例。根据你的需求选择合适的配置文件。

## 📁 配置文件列表

### 1. `standalone.config.example.json` - 完整配置示例
**推荐用于：** 需要了解所有配置选项的详细说明

- ✅ 包含所有可用配置选项
- ✅ 每个选项都有详细的中文注释说明
- ✅ 包含多个实际使用示例
- ✅ 适合学习和参考

**使用方法：**
```bash
cp config/examples/standalone.config.example.json config/standalone.config.json
# 然后修改 refreshToken
```

---

### 2. `standalone.config.simple.json` - 简化快速开始 ⭐
**推荐用于：** 快速开始使用，不需要复杂配置

- ✅ 配置简洁明了
- ✅ 只包含最常用的选项
- ✅ 适合新手快速上手
- ✅ 包含一个基础的下载示例

**使用方法：**
```bash
cp config/examples/standalone.config.simple.json config/standalone.config.json
# 运行 pixivflow login 获取 refreshToken
# 修改配置文件中的 refreshToken
# 根据需要修改 targets 中的标签
```

---

### 3. `standalone.config.ranking.json` - 排行榜下载示例
**推荐用于：** 主要下载排行榜作品

- ✅ 包含各种排行榜模式的示例
- ✅ 日榜、周榜、月榜配置示例
- ✅ 男性向、女性向、AI作品排行榜示例
- ✅ 排行榜筛选标签的配置方法

**使用方法：**
```bash
cp config/examples/standalone.config.ranking.json config/standalone.config.json
# 修改 refreshToken
# 根据需要修改 targets 数组
```

**支持的排行榜类型：**
- `day` - 日榜
- `week` - 周榜
- `month` - 月榜
- `day_male` - 男性向日榜
- `day_female` - 女性向日榜
- `day_ai` - AI作品日榜
- `week_original` - 原创周榜
- `week_rookie` - 新人周榜
- `day_r18` - R18日榜
- `day_male_r18` - 男性向R18日榜
- `day_female_r18` - 女性向R18日榜

---

### 4. `specific-download.example.json` - 特定下载任务示例
**推荐用于：** 需要实现特定下载场景

- ✅ 包含10个实际使用场景的配置示例
- ✅ 随机下载、质量过滤、时间范围等场景
- ✅ 小说系列下载、单作品下载示例
- ✅ 语言过滤、多标签OR关系等高级用法

**使用方法：**
```bash
cp config/examples/specific-download.example.json config/standalone.config.json
# 修改 refreshToken
# 根据需要选择或修改 targets 中的场景
```

**包含的场景：**
1. 随机下载 - 测试或获取随机作品
2. 排行榜筛选 - 从排行榜中筛选特定标签
3. 质量过滤 - 只下载高收藏数作品
4. 时间范围 - 下载指定时间段的作品
5. 多标签OR - 包含任意一个标签即可
6. 系列下载 - 下载整个小说系列
7. 单作品下载 - 下载指定ID的小说
8. 语言过滤 - 只下载中文小说
9. 特殊排行榜 - 原创周榜
10. 特殊排行榜 - 新人周榜

---

### 5. `standalone.config.novel-chinese.json` - 中文小说下载示例
**推荐用于：** 主要下载中文小说

- ✅ 包含中文小说下载的各种配置示例
- ✅ 语言过滤配置（仅中文、非中文、不过滤）
- ✅ 时间范围过滤示例
- ✅ 按热门程度或日期排序

**使用方法：**
```bash
cp config/examples/standalone.config.novel-chinese.json config/standalone.config.json
# 修改 refreshToken
# 根据需要修改 targets 数组中的标签
```

**语言过滤选项：**
- `chinese` - 仅下载中文小说
- `non-chinese` - 仅下载非中文小说（日语、英语等）
- `null` 或不设置 - 下载所有语言的小说

**时间范围占位符：**
- `LAST_7_DAYS` - 最近7天（程序自动计算日期）
- `YESTERDAY` - 昨天

---

## 🚀 快速使用示例

以下示例文件可以直接使用，无需复制到根目录：

### `yesterday-popular-novel.zh.json` - 昨日热门中文小说
**功能：** 下载昨日热门中文小说 Top 10

- 搜索模式 + `popular_desc` 排序 + `YESTERDAY` 日期
- 标签：`オリジナル`（通用原创标签）
- 语言过滤：仅中文

**使用方法：**
```bash
# 方式 1：命令行参数
pixivflow download --config "$(pwd)/config/examples/yesterday-popular-novel.zh.json"

# 方式 2：环境变量
export PIXIV_DOWNLOADER_CONFIG="$(pwd)/config/examples/yesterday-popular-novel.zh.json"
pixivflow download
```

---

### `yesterday-ranking-illustration.json` - 昨日日榜插画
**功能：** 下载昨日日榜插画 Top 10

- 排行榜模式
- 不依赖标签，直接按 Pixiv 日榜抓取

**使用方法：**
```bash
pixivflow download --config "$(pwd)/config/examples/yesterday-ranking-illustration.json"
```

---

### `multi-tag-or-limit.zh.json` - 多标签并集 + 中文过滤
**功能：** 多标签并集（任意一个标签即可）+ 总量限制 10 + 中文过滤 + 昨天

- 标签：`風景 イラスト オリジナル`（通用常见标签）
- `tagRelation: "or"` - 任意一个标签命中即可
- 语言过滤：仅中文
- 日期：昨天

**使用方法：**
```bash
pixivflow download --config "$(pwd)/config/examples/multi-tag-or-limit.zh.json"
```

---

## 💡 使用提示

### 直接使用示例文件

所有示例文件都可以直接使用，无需复制：

```bash
# 使用命令行参数
pixivflow download --config "$(pwd)/config/examples/yesterday-popular-novel.zh.json"

# 或使用环境变量（对所有命令生效）
export PIXIV_DOWNLOADER_CONFIG="$(pwd)/config/examples/yesterday-popular-novel.zh.json"
pixivflow download
```

### 登录并写入配置

如果示例文件中的 `YOUR_REFRESH_TOKEN` 还未替换，可以运行：

```bash
# 登录并自动写入 refresh token 到指定配置文件
pixivflow login --config "$(pwd)/config/examples/yesterday-popular-novel.zh.json"
```

该命令会把登录获取的 refresh token 自动写入对应配置文件。

---

## ⚠️ 注意事项

1. **所有示例文件中的 `YOUR_REFRESH_TOKEN` 都需要替换为实际值**
2. **或使用 `pixivflow login --config <配置文件路径>` 自动填充**
3. **配置文件使用 JSON 格式，注意语法正确性**
4. **修改配置后建议先测试少量下载，确认配置正确**

---

## 📚 更多信息

- 配置文件说明：查看 [../README.md](../README.md)
- 详细配置说明：查看 `docs/CONFIG.md`
- 项目文档：查看 `docs/` 目录
