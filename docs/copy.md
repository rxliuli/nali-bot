# 文案与本地化规范（Copy & Localization）

> 状态：已实施（2026-08-13）

面向玩家（用户可见）的文案遵循两条规则：

## 规则 1：固定文案 → 英文单语

固定文案（每轮重复、无学习价值的 UI 文本）只用英文，不出现中文：

- 命令描述：`Start a city guessing round`（不是"开始一轮猜城市游戏 / Start…"）
- 按钮 / modal / 反馈：`Guess`、`Your answer`、`✅ Correct! +1 pt`、`Round over — start a new one with /play`
- 字段名 / 标题：`Deck:`、`Correct`、`Leaderboard`、`The answer is`、`You saw:`、`Photo above`

## 规则 2：学习内容对 → 英文在前，中文在后

学习内容（每城不同、正是词汇）保持双语并列，但**英文始终在前**：

- `The answer is **Shanghai / 上海**`
- `📍 You saw: **Lujiazui / 陆家嘴**`
- `💡 Hint: China's largest city, famous for the Bund / 中国最大城市，外滩`
- `Deck: **China / 中国城市**`
- `/play` 的 deck 选项：`China / 中国城市`

数据层（`decks/*/deck.json` 的 `{ zh, en }` 字段）保持原样——顺序只在渲染层决定。

## 例外

- **bot 名** `Nǎlǐ 哪里`（拼音 + 中文）是品牌名而非翻译对，保持不动；设置在 Discord 开发者后台，不在代码中。

## 决策记录

2026-08-13 确认：
- ✅ 学习内容对英文在前
- ✅ 命令描述英文单语
- ✅ bot 名 `Nǎlǐ 哪里` 不动

> 实现提醒：修改命令描述后需重新执行 `pnpm register` 推送新描述（global command 缓存最长 1 小时）。
