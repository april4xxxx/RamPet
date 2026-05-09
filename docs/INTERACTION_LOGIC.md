# 拉姆交互逻辑（当前实现）

本文档只描述当前 App 已实现的交互与自动行为，不包含新情绪扩展方案。

代码基准：

- `src/components/RamPet.vue`
- `src/lib/pet-state.ts`

## 运行时常量

| 常量 | 值 | 说明 |
| --- | ---: | --- |
| `TRANSIENT_FOR_MS` | `1800ms` | 默认短时情绪持续时间。 |
| `WALK_EVERY_MS` | `9000ms` | 自动走路尝试周期。 |
| `WALK_DURATION_MS` | `1920ms` | 单次走路持续时间（按 `walk-1/walk-2` 完整循环收尾）。 |
| `WALK_STEP_INTERVAL_MS` | `60ms` | 桌面模式下单步位移频率。 |
| `WALK_STEP_PX` | `6px` | 桌面模式下单步位移距离。 |
| `SLEEP_AFTER_MS` | `300000ms` | 无交互进入睡觉阈值。 |
| `AMBIENT` 轮询周期 | `10000ms` | 环境随机情绪尝试周期。 |
| 拖拽阈值 | `4px` | 超过后进入拖拽态。 |

## 拉姆本体动作说明（固定索引区）

这一节只描述立绘/动画层面的"动作语义"，便于后续查询。

| 动作名 | 主要状态 | 说明 |
| --- | --- | --- |
| `breathe` | 默认（除特定覆盖态外） | 轻微上下浮动与压缩，作为常驻呼吸感。 |
| `happy-bounce` | `happy` | 开心弹跳，幅度更大。 |
| `walk-hop` | `walk` | 走路小幅起伏；配合 `walk-1/walk-2` 两帧切换。 |
| `sleep-sway` | `sleep` | 慢速轻摆，表现休眠。 |
| `carried-wiggle` | `carried` | 被拖拽/抱起时的小幅摇摆。 |

## 1) 用户交互 -> mood 映射

| 用户操作 | 条件/判定 | 触发 mood | 持续 | 备注 |
| --- | --- | --- | --- | --- |
| 单击宠物 | 触发 `click` | 从 `affection/happy/play/excited` 洗牌池依次取值 | `1800ms` | 和纯随机不同：一轮内不重复，且尽量避免与上一次相同。 |
| 悬停宠物 | 触发 `pointerenter` | 不切换 mood（仅唤醒） | - | 若当前为 `sleep`，立即回 `idle`；同时刷新交互时间。 |
| 开始拖拽 | 按下后移动距离 `>= 4px` | `carried` | 直到拖拽结束 | 内部用长时限（1h）保持，松手时强制结束。 |
| 结束拖拽 | `pointerup/pointercancel` 且正在拖拽 | `idle` | 非限时 | 立即清掉限时标记并回待机。 |
| 任意交互唤醒 | 交互发生时当前为 `sleep` | `idle`（先唤醒） | 非限时 | 再进入具体交互目标 mood。 |

## 2) 自动行为 -> mood 映射

| 自动行为 | 触发周期/条件 | 触发 mood | 持续 | 阻塞条件 |
| --- | --- | --- | --- | --- |
| 自动走路 | 每 `9000ms` 尝试；70% 维持上次方向、30% 反向 | `walk` | `1920ms`（桌面模式分步走，每 `60ms` 调用 `pet-window:move-by` 移动 `6px`，总位移约 190px） | 拖拽中 / 限时态中 / 当前 `sleep` 时跳过；撞到屏幕边缘提前结束并把 `direction` 反向后回 `idle`。 |
| 环境随机 | 每 `10000ms` 尝试，从 `idle/study/work/play/excited` 抽样 | 抽到 `idle` 则直接 `idle`；否则 `study/work/play/excited` | `study`=`8000ms`，`work`=`9000ms`，`play`=`3000ms`，`excited`=`2200ms` | 拖拽中 / 限时态中 / 当前 `sleep` 时跳过。 |
| 闲置睡觉 | 每 `1000ms` 检查；距离最后交互超过 `300000ms` | `sleep` | 非限时 | 拖拽中 / 限时态中时不进入睡觉。 |

## 3) 菜单行为 -> mood 映射

右键仅负责唤起菜单；实际 mood 由 `window.ramPetWindow.onAction` 回传后设置。

| 菜单项 | action mood | 实际设置 | 持续 | 备注 |
| --- | --- | --- | --- | --- |
| 摸摸 | `affection` | `affection` | `1800ms` | 走 `performMoodAction`。 |
| 玩耍 | `play` | `play` | `1800ms` | 走 `performMoodAction`。 |
| 学习 | `study` | `study` | `1800ms` | 走 `performMoodAction`。 |
| 工作 | `work` | `work` | `1800ms` | 走 `performMoodAction`。 |
| 睡觉 | `sleep` | `sleep` | `1800ms` | 当前实现是限时睡觉，不是永久睡眠锁定。 |
| 走路（测试） | `walk` | `walk` | `1920ms` | 走专用 `walk` 分支：会真正移动窗口，便于快速验证走路链路。 |

## 4) 状态优先级与覆盖规则

| 规则编号 | 规则 |
| --- | --- |
| R1 | 交互动作会刷新 `lastInteraction`；若当前是 `sleep`，先唤醒到 `idle`。 |
| R2 | 通过 `setMood` 进入的限时态（`transientUntil` 未到期）会抑制自动走路、环境随机、自动睡觉。 |
| R3 | 单击是唯一点击入口：`affection/happy/play/excited` 通过"洗牌池"触发，减少连续重复。 |
| R4 | 拖拽开始后进入 `carried`；拖拽结束立即清限时并强制回 `idle`。 |
| R5 | 自动逻辑只在"非拖拽 + 非限时 + 非睡觉（走路/环境）"窗口内运行。 |
| R6 | 菜单 action 与单击统一走 `performMoodAction`，默认持续 `1800ms`。 |
| R7 | `sleep` 的来源有两种：闲置自动进入（非限时），或菜单触发（当前实现为 `1800ms` 限时）。 |
| R8 | 桌面模式下走路是「分步走」：每 `60ms` 让主进程把窗口位移 `6px`；走路过程中切到非 `walk`、进入 `sleep`、开始拖拽、组件卸载都会立刻清掉走路 timer。 |
| R9 | `walk` 正常到时后回到 `idle`；若撞到屏幕边缘（主进程返回的实际位移为 0），则本次 `walk` 立即结束并回 `idle`，同时把 `direction` 反过来留给下一轮。 |

## 当前不会自动出现的已接入情绪

以下 mood 已在 `PetMood` 与素材中存在，但当前没有自动触发路径（仅可作为后续预留）：

- `dirty`
- `hungry`
- `sick`
- `sad`
- `eating`
- `cleaning`
- `medicine`

## 未接入候选（仅样张）

以下状态目前只是候选样张，不进入 `PetMood`、不进入 `AMBIENT_MOODS`：

- `calm`
- `thirsty`
- `shocked`

---

## 状态测试排查表

> 测试原则：只测"能否出现 + 素材/动画/退出是否符合预期"，不测数值体感（体感调参另行记录）。
> 结果填写：✅ 正常 / ❌ 异常 / ⚠️ 有问题但可接受 / — 暂无触发路径

### 有触发路径的状态（可直接手动验证）

| # | 状态 | 触发方法 | 验证要点 | 素材加载 | 动画正常 | 持续/退出正常 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `idle` | App 启动后默认 / 任意限时态结束后 | 显示 `idle.png`，呼吸动画持续，无其他动作 | <br> | <br> | <br> | <br> |
| 2 | `walk` | 等待约 9s 自动触发 / 右键 → 走路（测试） | 显示 `walk-1/walk-2` 交替，`walk-1` 为停、`walk-2` 为动；窗口横向位移，约 1920ms 后结束 | <br> | <br> | <br> | <br> |
| 3 | `sleep` | 静止 30s 不做任何交互 | 显示 `sleep.png`，摆动动画，悬停或点击后唤醒回 `idle` | <br> | <br> | <br> | <br> |
| 4 | `carried` | 按住后移动 >= 4px | 显示 `carried.png`，摇摆动画，松手后立即回 `idle` | <br> | <br> | <br> | <br> |
| 5 | `happy` | 单击宠物（4 连点可把洗牌池跑完） | 显示 `happy.png`，弹跳动画，约 1800ms 后回 `idle` | <br> | <br> | <br> | <br> |
| 6 | `affection` | 单击宠物 / 右键 → 摸摸 | 显示 `affection.png`，约 1800ms 后回 `idle` | <br> | <br> | <br> | <br> |
| 7 | `play` | 单击宠物 / 右键 → 玩耍 | 显示 `play.png`，约 1800ms 后回 `idle` | <br> | <br> | <br> | <br> |
| 8 | `excited` | 单击宠物（洗牌池中） | 显示 `excited.png`，约 1800ms 后回 `idle` | <br> | <br> | <br> | <br> |
| 9 | `study` | 右键 → 学习 | 显示 `study.png`，约 1800ms 后回 `idle` | <br> | <br> | <br> | <br> |
| 10 | `work` | 右键 → 工作 | 显示 `work.png`，约 1800ms 后回 `idle` | <br> | <br> | <br> | <br> |

### 无自动触发路径的预留状态（需临时注入测试）

> 临时测试方法：在 Vue Devtools 中强制调用 `setMood('xxx', 3000)`，或临时在代码里加一行手动触发。

| # | 状态 | 素材加载 | 动画正常 | 备注（体感 / 素材问题） |
| --- | --- | --- | --- | --- |
| 11 | `hungry` | <br> | <br> | <br> |
| 12 | `eating` | <br> | <br> | <br> |
| 13 | `dirty` | <br> | <br> | <br> |
| 14 | `cleaning` | <br> | <br> | <br> |
| 15 | `sick` | <br> | <br> | <br> |
| 16 | `medicine` | <br> | <br> | <br> |
| 17 | `sad` | <br> | <br> | <br> |

### 自动行为边界测试（补充验证）

| # | 场景 | 预期行为 | 实际结果 | 备注 |
| --- | --- | --- | --- | --- |
| A | 走路中单击宠物 | 单击触发 click mood，走路提前结束 | <br> | <br> |
| B | 限时态（如 `happy`）期间等待 | 自动走路和环境随机不应触发 | <br> | <br> |
| C | `sleep` 状态下悬停 | 立即唤醒回 `idle`，不需要点击 | <br> | <br> |
| D | 走路撞到屏幕边缘 | 本轮 walk 立刻停止并回 `idle`，下次反向 | <br> | <br> |
| E | 右键菜单 → 睡觉 | 进入 `sleep` 1800ms 后自动退出（非永久睡眠） | ✅ | <br> |
| F | 连续单击 4 次 | `affection`/`happy`/`play`/`excited` 各出现一次，不重复 | ✅ | <br> |
