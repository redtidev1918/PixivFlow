# Tag 空间与排名规则

本文说明 `mode: "topic"` 主题下载如何把一个主题词推导成 Tag 空间、每个 Tag 的**语义权重（weight）**从何而来、以及**排名规则**为什么必须保证「原始 Tag 最高」。

目标是一句话：**原始 Tag 权重最高，相关 Tag 权重不得超过原始 Tag，弱语义扩展必须能被降权或丢弃。**

## 一、从主题词到 Tag 空间

```text
topic（如 ボテ腹）
  → Pixiv Tag 联想（/v2/search/autocomplete）
  → 近期作品 Tag 共现采样（主题样本 + 通用 Tag 背景样本）
  → 每个候选 Tag 打一个相关度分（score / weight）
  → 过滤 STOP_TAGS、低于 minScore 的候选
  → 形成有序 Tag 空间（seed 恒为第一，score = 1.0）
```

插画与小说各自独立推导并缓存到数据卷 `topic-cache/`（默认 7 天）。刷新失败时降级到旧缓存或**仅用主题词本身**，不中断调度。

## 二、score / weight 的计算公式

每个相关 Tag 的分数 = 四个因子相乘：

```text
score = recall × specificity × suggestionWeight × genericPenalty
```

| 因子 | 取值 | 含义 |
| --- | --- | --- |
| `recall` | `sqrt(coverage)`，`coverage = 共现作品数 / 主题样本数` | 有多少比例的主题样本带了这个 Tag；开方是为了压低“只要足够常见就能刷高”的效应 |
| `specificity` | `clamp(lift / 3 + 0.5, 0, 1.2)`，`lift = ln((coverage + 0.03) / (backgroundFreq + 0.03))` | PMI 式特异性：与主题共现、在无关背景样本里罕见的 Tag 得分高；`R-18`、`オリジナル` 这类到处都有的 Tag `lift ≈ 0`，`specificity ≈ 0.5` 并被压低 |
| `suggestionWeight` | Pixiv 联想给出 `1.1`，否则 `1.0` | 联想是 Pixiv 自己标注的相关性，给一点加成，但不改变量级 |
| `genericPenalty` | 平台通用 Tag `0.4`，其他 `1.0` | 对 `r-18`/`オリジナル`/`女の子`/`イラスト`/`漫画`/`100users入り` 等平台级 Tag 直接乘 0.4 |

两条补充规则：

- **仅联想的 Tag**（联想里有、采样里从未共现）没有共现证据，取固定分 `0.27`，`occurrences = 0`，因此在排序里永远排在“真正共现过”的 Tag 之后。
- 分数四舍五入到 4 位小数；`weight` 与 `score` **永远是同一个数**。保留两个字段是为了让排名可解释、可演进：`score` 是既有对外字段，`weight` 是“排名读的那个语义权重”。

## 三、来源（provenance）分类

空间里每个 Tag 都带 `source`，说明它的证据来自哪条通道：

| `source` | 含义 | 强度 |
| --- | --- | --- |
| `seed` | 操作者自己填的主题词，`score = weight = 1` | 最强，永远是第一层 |
| `cooccurrence+autocomplete` | 采样中与主题共现，且 Pixiv 联想也给出该 Tag（两条通道都同意） | 最强的“相关”来源 |
| `cooccurrence` | 采样中与主题共现，但联想没有给出 | 只有共现证据 |
| `autocomplete` | 联想给出，但采样中从未共现（固定分 0.27） | 最弱的语义扩展 |

`source` 与 `weight` 都是**可选字段**：旧版本写入的缓存空间没有这两个字段，读取时按“来源未知、权重回退到 `score`”处理，不会因为缺字段而报错，也**不需要**升级缓存版本号。

## 四、排名规则

候选作品先过 `candidateCollection.minMetadataScore` 相关性门槛（默认 0.35），门槛只是**接受判定**，不是排序依据。通过门槛后：

1. 默认（`relatedTags: "always"` 且 `seedTier: "off"`）：**完全按本地热度 `calculatePopularityScore()` 排名**（历史行为，向后兼容）。
2. `seedTier: "on"`：在热度之前插入一层**硬层级**——带主题 Tag 的作品永远排在只带相关 Tag 的作品之前，无论后者多热；同层内再按热度。这样即使某个同级相关 Tag（例如抓 `西瓜肚` 时空间里的 `丸吞`）当天有一个爆款，也不会把主题本身的作品挤出 Top N。
3. `relatedTags: "when_seed_insufficient"` / `"never"`：本身即“主题优先”模式，会先只搜主题 Tag，只有填不满 `limit` 时才扩展，同样带硬层级。

`weight` 参与相关性打分：一个作品命中多个相关 Tag 时按 `weight` 累加（单个 Tag 贡献封顶 0.6，总量封顶 0.6；命中 ≥2 个相关 Tag 才有全额系数）。**同一个 resolved Tag 在同一个作品上只计一次**——即使这个作品同时写了 Tag 名和它的 `translated_name`。

## 五、配置项

全部可选，**默认值完全等于改动前的行为**：

```jsonc
{
  "id": "bote-illust",
  "type": "illustration",
  "mode": "topic",
  "topic": "西瓜肚",
  "limit": 1,
  "topicDiscovery": {
    "relatedTags": "always",                 // 默认：整个空间都当天检索
    "seedTier": "off",                       // 'off'（默认）| 'on'
    "tagRelations": {
      "allowSources": ["seed", "cooccurrence", "autocomplete"],  // 默认：全部来源
      "allow": [],                           // 非空时只走这些 Tag（seed 永远保留）
      "deny": []                             // 永远丢弃，优先级最高
    },
    "matchTranslatedNames": false            // 默认 false：不做译文匹配
  }
}
```

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `seedTier` | `"off"` \| `"on"` | `"off"` | `"on"` 时主题 Tag 成为硬层级，优先级高于热度 |
| `tagRelations.allowSources` | `TagSource[]` | 全部三种 | 只走这些来源的 Tag；未知来源名会被配置校验拒绝 |
| `tagRelations.allow` | `string[]` | `[]` | 非空时只走列出的 Tag（主题 Tag 永远保留） |
| `tagRelations.deny` | `string[]` | `[]` | 无条件丢弃，**优先级高于 `allow` 与 `allowSources`** |
| `matchTranslatedNames` | `boolean` | `false` | `true` 时作品的 `translated_name` 也可以命中对应的 resolved Tag |

语义要点：

- **deny 最高**：同时出现在 `allow` 和 `deny` 里的 Tag 会被丢弃。
- **主题 Tag 不被 `allow` / `allowSources` 丢弃**，只有 `deny` 能丢弃它；如果 `deny` 掉了主题词导致空间为空，管道退化为**仅用主题词**检索（与推导失败时的降级一致），而不是返回空结果。
- **`matchTranslatedNames` 不会伪造 Tag**：译文只是“同一个 resolved Tag 的另一种写法”，作品不会被报告成携带了它没有的 Tag。
- 过滤器作用在**发起检索之前**，所以它决定的是“实际搜了哪些 Tag”，不只是显示。

## 六、诊断

### 查看 Tag 空间与来源

```bash
pixivflow topic resolve "西瓜肚"              # 人读表格
pixivflow topic resolve "西瓜肚" --json       # 机器可读
```

输出每个 resolved Tag 的 `name / translatedName / source / weight / score / seed / searched`：

- `source`：该 Tag 的来源（`seed` / `cooccurrence` / `cooccurrence+autocomplete` / `autocomplete`）。
- `weight` / `score`：语义权重与相关度分（同值）。
- `seed`：是否是主题词本身。
- `searched`：在该 `relatedTags` / `tagRelations` 配置下，这个 Tag 今天**有资格被检索**。把 `relatedTags` 从 `always` 改成 `when_seed_insufficient` 时，相关 Tag 的 `searched` 会变成 `no`——这正是“弱语义扩展被降权或丢弃”的可视化确认。（`when_seed_insufficient` 下主题 Tag 当天填不满 `limit` 时仍会实际扩展；以 `topic test` 的 `searchedTags=` 为准。）

### 查看某一天实际检索了什么

```bash
pixivflow topic test "西瓜肚" --date YESTERDAY
```

会打印 `resolvedTags=`、`searchedTags=`（本次实际检索过的 Tag 列表）以及 `[TopicRecall] mode=... seedAccepted=...`。选中项还会打印 `meta=`（元数据相关性分）与 `seedTier=on` 标记，可以直接确认“第一名是靠主题 Tag 拿到的，而不是靠一个更热的相关 Tag”。

## 七、排查一次“召回不对”

按下面顺序看，基本能在两步内定位：

1. **主题 Tag 有没有真的被搜？**
   跑 `pixivflow topic test "<主题>" --date <日期>`，看 `searchedTags=` 是否包含主题词。若被 `tagRelations.deny` 或 `allow` 排除，`topic resolve` 表格里该行的 `searched` 会是 `no`。
2. **期望的作品当天有没有被采到？**
   看 `raw=` / `deduped=`；如果是 0，问题在检索词或发布日期，而不是排序。
3. **采到了但被门槛刷掉了？**
   看 `accepted=` 与逐条 `meta=`。`minMetadataScore`（默认 0.35）只接受“标签/标题/描述确实和主题相关”的作品；只带一个边缘相关 Tag 的作品会刻意达不到门槛。若确认作品其实相关但写法是译名，打开 `matchTranslatedNames: true`。
4. **采到了、也在候选里，但没进 Top N？**
   看第一名是 `seedTier=on` 还是同层热度决定的。抓主题本身却总是被同级相关 Tag 顶掉时，说明该相关 Tag 当天的作品更热：要么打开 `seedTier: "on"`，要么用 `tagRelations.deny` / `allow` 收窄空间，要么改用 `relatedTags: "when_seed_insufficient"`。
5. **空间本身就不对（缺少明显的同义词/上位 Tag）？**
   那是推导阶段的问题：看 `topic resolve` 的 `source` 分布。只有 `autocomplete` 的 Tag 只有 0.27 分、排序靠后，属正常；真正与主题强共现的 Tag 若缺失，通常是采样样本太小（调大 `topicDiscovery.sampleWorks`）或该 Tag 被 `GENERIC_TAG_PENALTY` 判为平台通用 Tag。

> 缓存提醒：`topic resolve` 默认读缓存。改完配置后想看重新推导的结果，加 `--refresh`，或调小 `topicDiscovery.cacheDays`。
