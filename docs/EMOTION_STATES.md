# 拉姆情绪状态（当前已接入）

本文档仅记录 `src/` 中已经存在并接入的情绪状态。
原则：没有在代码里出现的状态，一律视为已删除或暂不处理。

当前状态以 `src/lib/pet-state.ts` 的 `PetMood` 为准，共 17 个：

- `idle`
- `happy`
- `walk`
- `sleep`
- `carried`
- `hungry`
- `eating`
- `dirty`
- `cleaning`
- `sick`
- `medicine`
- `sad`
- `excited`
- `study`
- `work`
- `play`
- `affection`

## 当前状态分组（按现有逻辑）

### 常驻/基础

- `idle`：默认待机。
- `walk`：移动状态（使用 `walk-1.png` / `walk-2.png` 两帧）。
- `sleep`：无交互一段时间后进入睡觉。
- `carried`：拖拽过程中显示。

### 互动触发（已在组件逻辑中使用）

- `happy`：单击宠物时可能触发。
- `affection`：单击宠物时可能触发。
- `play`：双击宠物时可能触发。
- `excited`：双击宠物时可能触发。

### 环境随机（ambient）

当前 `AMBIENT_MOODS`：`idle`、`study`、`work`、`play`、`excited`

- `study`
- `work`
- `play`
- `excited`

### 已接入但当前未自动触发（预留/手动）

- `hungry`
- `eating`
- `dirty`
- `cleaning`
- `sick`
- `medicine`
- `sad`

## 素材命名与位置（现有）

- 素材目录：`src/assets/ram/`
- 状态图命名与 `PetMood` 一一对应（`walk` 除外，使用 `walk-1.png`、`walk-2.png`）。
- 统一规格：`512x512` 透明 PNG。

## 新增候选（暂不纳入本阶段） - 需要帮助

以下仅保留在文档末尾，当前不做接入、不改状态机：

- `calm`
- `thirsty`
- `shocked`
- `relaxed`
- `content`
- `serene`
- `in_love`
- `grateful`
- `proud`
- `thankful`
- `amused`
- `giggling`
- `fulfilled`
- `curious`
- `focused`
- `determined`
- `overwhelmed`
- `melancholy`
- `lonely`
- `shy`
- `embarrassed`
- `anxious`
- `apologetic`
- `disappointed`
- `worried`
- `full`
- `bump`（候选）：走路撞屏后的短时反馈状态，当前仅记录，不接入。
