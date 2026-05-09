# 中级阶段拉姆素材

中级阶段拉姆桌面宠物状态素材放在本目录。

## 当前已接入素材

以下文件已在 `PetMood` 中声明并可被程序识别：

- `idle.png`
- `happy.png`
- `sleep.png`
- `walk-1.png`
- `walk-2.png`
- `carried.png`
- `hungry.png`
- `eating.png`
- `dirty.png`
- `cleaning.png`
- `sick.png`
- `medicine.png`
- `sad.png`
- `excited.png`
- `study.png`
- `work.png`
- `play.png`
- `affection.png`

## 素材规格

- 单张素材统一为 `512x512` 透明 PNG。
- 拉姆主体尽量保持居中与体量一致，避免状态切换抖动。
- `walk` 使用双帧：`walk-1.png`、`walk-2.png`。

## 动画命名（CSS 侧）

| 名称 | 周期感 | 动作特点 |
| --- | --- | --- |
| `breathe` | 约 2.8s，很柔 | 轻微上浮 + 略压扁拉长（呼吸感） |
| `happy-bounce` | 约 0.52s，快 | 大幅上下 + 夸张 squash/stretch |
| `walk-hop` | 约 0.42s | 小跳 + 轻微左右倾 |
| `sleep-sway` | 约 3.4s，很慢 | 轻微下沉式晃动 |
| `carried-wiggle` | 约 0.5s | 左右小幅摆动 |

## 文档索引

- 交互与状态机逻辑：`docs/INTERACTION_LOGIC.md`
- 情绪分类与候选状态：`docs/EMOTION_STATES.md`
- 实现总览：`docs/IMPLEMENTATION_NOTES.md`

说明：需求数值系统当前未启用；`hungry/dirty/sick/sad/eating/cleaning/medicine` 等素材先保留为已接入资源与后续扩展位。

