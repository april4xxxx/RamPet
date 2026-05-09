# Implementation Notes

## Desktop App

- Electron 主进程位于 `electron/main.cjs`。
- Renderer 通过 `electron/preload.cjs` 暴露 `window.ramPetWindow`。
- 生产运行命令：`npm run desktop:prod`。
- 开发运行命令：`npm run desktop`。

## Persistence
- 桌面 App 配置写入 Electron `userData` 目录下的 `ram-pet-config.json`。
- 当前保存：
  - 窗口位置
  - 是否置顶
  - 是否可见
  - 宠物尺寸预留字段

## State Model

- 状态资源统一定义在 `src/lib/pet-state.ts`。
- 桌面状态机在 `src/components/RamPet.vue` 内运行。
- 交互事件、自动行为、菜单触发、覆盖优先级请统一参考 `docs/INTERACTION_LOGIC.md`。
- **当前未启用**饥饿、清洁、心情、健康数值与 `sick` / `dirty` / `hungry` / `sad` 等底层需求立绘（无衰减、无 `updateNeedMood`）；`pet-state.ts` 中仍保留类型与常量供日后接回。

## 立绘分类（PetMood）

下列均对应 `src/assets/ram/*.png` 的一张主图（`walk` 另有两帧 `walk-1` / `walk-2`）。**带「预留」行的在当前运行逻辑中不会出现，仅素材与类型保留。**

| 分类 | 含哪些 `mood` | 如何出现（当前版本） |
| --- | --- | --- |
| **底层需求立绘（预留）** | `sick`、`dirty`、`hungry`、`sad` | 已关闭；日后若接回数值再由 `updateNeedMood` 等驱动。 |
| **照料动作立绘（预留）** | `eating`、`cleaning`、`medicine` | 无入口；接回数值后可挂菜单或交互。 |
| **短时积极互动** | `happy`、`affection` | 具体触发与时长见 `docs/INTERACTION_LOGIC.md`。 |
| **短时高能量互动** | `play`、`excited` | 具体触发与时长见 `docs/INTERACTION_LOGIC.md`。 |
| **日程类短时状态** | `study`、`work`（及环境里的 `play` / `excited`） | 具体触发与时长见 `docs/INTERACTION_LOGIC.md`。 |
| **移动与姿态** | `walk`、`carried` | 具体触发与时长见 `docs/INTERACTION_LOGIC.md`。 |
| **休息** | `sleep` | 具体触发与时长见 `docs/INTERACTION_LOGIC.md`。 |
| **中性待机** | `idle` | 初始、环境抽到、拖完、点醒睡眠等。 |

说明：运行时状态机细节集中维护在 `docs/INTERACTION_LOGIC.md`，本文件只保留实现与资产层面的总览。

## Asset Policy

- 桌面 App 直接使用 `src/assets/ram/*.png`。
- 每张状态图为 `512x512` 透明 PNG。
- 道具和气泡是视觉状态的一部分，但不应改变拉姆主体结构。
