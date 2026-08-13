# 图片模型设计（Images）

> 状态：**多图 + 地标标注已实施**（2026-08-13）；地图坐标维持城市级（每图坐标 v2）

## v1（已实现）

- 每张卡 **1..N 张图**：`Card.images: CardImage[]`（仓库根相对路径，如 `decks/cn-cities/beijing-2.webp`）
- 出题随机选 1 张；揭晓显示同一张，并标注具体地点（`label`）
- 揭晓地图居中在城市坐标（`Card.lat / lng`，城市级）
- 图片由 `scripts/dev/optimize-images.mjs` 从相机原片就地优化（1200px WebP q80、剥 EXIF、删原片），`images[].path` 由脚本维护，`label` 手写、脚本重写时保留
- 出题只从**有图的卡**中选（`pickCard` 过滤 `images.length > 0`），无图城市暂不出题

## 已确认的演进方向（多轮讨论共识）

### 1. 每城多图 ✅ 已实施

价值：反图片记忆（同一城市换角度再考）、难度分层、重复游玩价值（15 城 × 3 图 ≈ 45 题）。

```ts
interface CardImage {
  path: string                        // "decks/cn-cities/beijing-1.webp"
  label?: { zh: string; en: string }  // 具体地点，如 故宫 / Forbidden City
}

interface Card {
  id: string
  images: CardImage[]   // 1..N，至少 1 张
  // ...
}
```

- **命名约定**：`<cardId>.webp`（第 1 张）+ `<cardId>-2.webp`、`<cardId>-3.webp`（补充），脚本按序号组装 `images`
- **出题**：随机选 1 张；**揭晓**：显示同一张 + `label`
- **防重复**：避免同一城市连出（`lastCardId`）且避免同一张照片连出（`lastImage`）

### 2. 每图 JSON 化 + 地点标注（学习价值） ✅ 已实施

在语言交换场景，揭晓时给出地标词让玩家同时学到**城市名 + 地标词**两个词汇。

- `label` **只出现在揭晓**："📍 你看到的是 **故宫 / Forbidden City**"；**出题永不显示**（"故宫"当提示就是明牌泄题）
- 出题阶段的提示继续用现有 `hint` 字段，两者职责分离
- `label` **可选**：无地标的街景 / 全景图不写，揭晓退回纯城市名
- 双语：`{ zh, en }`，与 deck.json 其他文案一致

### 3. 脚本职责边界 ✅ 已实施

- `optimize-images.mjs` **只维护 `images[].path`**（扫描 `<cardId>[-N].<ext>` 原片 → 优化 → 删/归档原片 → 回写 deck.json 的 path）
- `label` 是**手写编辑内容**：脚本重写 deck.json 时保留已有 label，新图补空 label ——"机器管文件、人管内容"
- `--check` 要求每卡 ≥1 张图

## v2 候选（明确暂不做）

- **每图 `lat / lng`**：揭晓地图精确到地标（当前城市级）
- **难度标签 / 出题权重**：对休闲 bot 属过度设计，暂不引入

## 影响面（已落地）

| 位置 | 改动 |
|---|---|
| `src/game/types.ts` | `image: string` → `images: CardImage[]` |
| `src/game/embeds.ts` | 出题随机选图；揭晓渲染 `label` |
| `src/do/GameRoom.ts` | `lastImage` 防连出；`pickCard` 只选有图的卡 |
| `scripts/dev/optimize-images.mjs` | 多原片扫描 + 保留 label + `--check` ≥1 张 |
| `test/*` | 多图选图、label 渲染、防连出用例 |

## 选图准则（摄影素材筛选）

出题照片的核心职责是"看到图 → 联想到城市"。选图优先级：

1. **全国知名地标**（故宫、外滩、圣索菲亚大教堂）——最强线索
2. **风格鲜明、一眼指向该城**的建筑（清真寺、丝绸之路塔、广州塔）——强线索
3. **本地有名但全国无辨识度**的地点（如乌鲁木齐大佛寺）——弱线索，慎用；有更优素材时优先替换

多图时保证每城至少一张强线索。示例：乌鲁木齐牌组曾含大佛寺（弱），已替换为红山公园。

## 决策记录

- ✅ 多图模型：`images: CardImage[]`（1..N），`label` 仅揭晓展示——**已实施**
- ✅ 地图坐标维持城市级（每图坐标 v2）
- ✅ 照片规模：作者有全国旅行实拍，量不成问题（用户提供）
- ❓ 每图地标坐标 → v2
- ❓ 难度标签 → 暂不引入
