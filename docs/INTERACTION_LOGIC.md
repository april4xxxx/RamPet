# 拉姆交互逻辑（当前实现）

本文档描述当前 App 已实现的交互、自动行为和节奏。当代码常量变化时**必须同步更新此文件**。

代码基准：

- [src/components/RamPet.vue](../src/components/RamPet.vue)
- [src/lib/pet-state.ts](../src/lib/pet-state.ts)
- [src/lib/care-stats.ts](../src/lib/care-stats.ts)

## 节奏总览：闲置 5 分钟时间线

下面是 **应用启动后无任何用户交互** 的真实时间线（v0.1.0 调慢后的新节奏）：

```
时间(s) │ 0    30   60   90   120  150  180  210  240  270  300
────────┼──────────────────────────────────────────────────────────
启动    │ ●━waving━●(2.2s)
打招呼  │ (1.5s 后一次性)
        │
环境随机│        ●ambient   ●ambient   ●ambient   ●ambient   ●ambient
30s周期 │        43% idle   43% idle   43% idle   43% idle   43% idle
        │        其余切到 study/work/play/excited（各占 14%）
        │
走路    │                ●━walk━●        ●━walk━●        ●━walk━●
25s周期 │                (1.92s)         (1.92s)         (1.92s)
        │
说话气泡│                                                    （首次在 12s）
        │ ●(12s)
        │            （下次在 +5min = 312s）
        │
睡眠    │                                                            ●sleep
5min    │                                                            (自动入睡)
        │
数值衰减│        ●tick   ●tick   ●tick   ●tick   ●tick   ●tick   ●tick
30s tick│        (无视觉变化，只在数值低于阈值时下次 ambient 才会浮现)
```

**期望体感**：每分钟 **0-2 次** 表情/动作变化。绝大部分时间在 idle 呼吸。

## 运行时常量（v0.1.0 当前值）

| 常量 | 值 | 说明 |
| --- | ---: | --- |
| **基础** | | |
| `TRANSIENT_FOR_MS` | `1800ms` | 默认短时情绪持续时间。 |
| 拖拽阈值 | `4px` | 超过后进入拖拽态。 |
| **走路** | | |
| `WALK_EVERY_MS` | `25000ms` | 自动走路尝试周期（**v0.1.0：9s → 25s**）。 |
| `WALK_DURATION_MS` | `1920ms` | 单次走路持续时间（按 `walk-1/walk-2` 完整循环收尾）。 |
| `WALK_STEP_INTERVAL_MS` | `60ms` | 桌面模式下单步位移频率。 |
| `WALK_STEP_PX` | `6px` | 桌面模式下单步位移距离。 |
| **环境随机** | | |
| `AMBIENT_EVERY_MS` | `30000ms` | 环境随机尝试周期（**v0.1.0：10s → 30s**）。 |
| `AMBIENT_MOODS` | 加权 7 项 | `['idle','idle','idle','study','work','play','excited']` —— idle 占 3/7（**v0.1.0：1/5 → 3/7**） |
| `AMBIENT_MOOD_DURATIONS.study` | `8000ms` | |
| `AMBIENT_MOOD_DURATIONS.work` | `9000ms` | |
| `AMBIENT_MOOD_DURATIONS.play` | `3000ms` | |
| `AMBIENT_MOOD_DURATIONS.excited` | `2200ms` | |
| **睡觉** | | |
| `SLEEP_AFTER_MS` | `300000ms`（5 分钟） | 无交互进入睡觉阈值。 |
| **说话气泡** | | |
| `SPEECH_BUBBLE_INITIAL_MS` | `12000ms` | 启动后首次气泡延迟（**v0.1.0：3s → 12s**，避开 waving 打招呼期间）。 |
| `SPEECH_BUBBLE_INTERVAL_MS` | `300000ms`（5 分钟） | 气泡周期（**v0.1.0：60s → 5min**）。 |
| **启动 / 接近反应** | | |
| `WAVING_DURATION_MS` | `2200ms` | 启动 1.5s 后一次性打招呼时长。 |
| `SPOTTED_RADIUS_PX` | `240px` | 鼠标接近触发半径。 |
| `SPOTTED_SPEED_PX_PER_MS` | `0.6` | 鼠标速度阈值。 |
| `SPOTTED_COOLDOWN_MS` | `30000ms` | 触发后冷却（**v0.1.0：10s → 30s**）。 |
| `SPOTTED_DURATION_MS` | `1400ms` | 单次 spotted 持续。 |
| **养成数值** | | |
| `CARE_CHECK_INTERVAL_MS` | `30000ms` | 数值衰减 tick + 危险态评估。 |
| `CARE_DANGER_DURATION_MS` | `6000ms` | 危险态浮现时长。 |
| 衰减详见 | | [iterations.md 数值层](iterations.md#数值层) |

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
| 单击宠物 | 触发 `click` | 从 `affection/happy/play/excited/jumping` 洗牌池依次取值 | `1800ms` | 和纯随机不同：一轮内不重复，且尽量避免与上一次相同。 |
| 悬停宠物 | 触发 `pointerenter` | 不切换 mood（仅唤醒） | - | 若当前为 `sleep`，立即回 `idle`；同时刷新交互时间。 |
| 鼠标快速接近 | 桌面模式下鼠标在拉姆外圈 240px 内、速度 ≥ 0.6px/ms | `spotted` | `1400ms` | 10s 冷却；睡觉/走路/拖拽/限时态期间不触发；触发时朝向鼠标。 |
| 应用启动 | `onMounted` 后 1.5s | `waving` | `2200ms` | 一次性；启动时若已被拖拽/睡觉/限时态阻塞则跳过。 |
| 开始拖拽 | 按下后移动距离 `>= 4px` | `carried` | 直到拖拽结束 | 内部用长时限（1h）保持，松手时强制结束。 |
| 结束拖拽 | `pointerup/pointercancel` 且正在拖拽 | `idle` | 非限时 | 立即清掉限时标记并回待机。 |
| 任意交互唤醒 | 交互发生时当前为 `sleep` | `idle`（先唤醒） | 非限时 | 再进入具体交互目标 mood。 |

## 2) 自动行为 -> mood 映射

| 自动行为 | 触发周期/条件 | 触发 mood | 持续 | 阻塞条件 |
| --- | --- | --- | --- | --- |
| 自动走路 | 每 `25000ms` 尝试；70% 维持上次方向、30% 反向 | `walk` | `1920ms`（桌面模式分步走，每 `60ms` 调用 `pet-window:move-by` 移动 `6px`，总位移约 190px） | 拖拽中 / 限时态中 / 当前 `sleep` 时跳过；撞到屏幕边缘提前结束并把 `direction` 反向后回 `idle`。 |
| 环境随机 | 每 `30000ms` 尝试，从加权池 `[idle×3, study, work, play, excited]` 抽样 | 抽到 `idle` 则直接 `idle`（≈43% 概率）；否则切到对应忙碌态 | `study`=`8000ms`，`work`=`9000ms`，`play`=`3000ms`，`excited`=`2200ms` | 拖拽中 / 限时态中 / 当前 `sleep` 时跳过；数值危险态（hunger/cleanliness/mood/health < 30）会覆盖本次抽样。 |
| 危险态浮现 | `chooseAmbientMood` tick 中若 `dangerSignal` 非空（每 `30000ms` 评估一次） | 按优先级 `sick > hungry > dirty > sad` 取最高优先级 | `6000ms` | 拖拽中 / 限时态中 / 当前 `sleep` 时跳过。 |
| 闲置睡觉 | 每 `1000ms` 检查；距离最后交互超过 `300000ms` | `sleep` | 非限时（任意交互或菜单可唤醒） | 拖拽中 / 限时态中时不进入睡觉。 |
| 说话气泡 | 启动 `12000ms` 后首次；之后每 `300000ms`（5min） | 不切换 mood（若不在正向态则会切到正向态再说话） | 气泡 `7000ms` | 拖拽中 / 当前 `sleep` 或 `walk` / Codex 持久状态期间。 |
| 数值衰减 | 每 `30000ms` tick | 不直接切 mood，只衰减数值；阈值由"危险态浮现"消费 | — | 始终运行（数值变化在背景，不打扰）。 |

## 3) 菜单行为 -> mood 映射

右键拉姆 / 左键托盘 / 右键托盘均唤起同一菜单，实际 action 由 `window.ramPetWindow.onAction` 回传后在 renderer 端处理。当前 v0.1.0 菜单结构：

```
显示/隐藏拉姆       ← 窗口控制
重置位置
保持置顶 [✓]
─────────
查看状态            ← 弹出拉姆头顶气泡数值面板（5s 自动消失）
今日状态 ►          ← 子菜单展开四项数值
─────────
睡觉                ← 进入持久睡眠，任意交互可唤醒
─────────
（条件显示）
喂食（饱腹 42）      ← hunger < 60 才出现
洗澡（清洁 38）      ← cleanliness < 60 才出现
吃药（健康 25）      ← health < 60 才出现
─────────
退出
```

| 菜单项 | action 类型 | 实际行为 | 持续 | 数值影响 |
| --- | --- | --- | --- | --- |
| 查看状态 | `{type:'show-stats'}` | 拉姆头顶气泡浮出四项数值（带颜色分级和数字） | `5000ms` 自动隐藏 | — |
| 今日状态 | 子菜单 | 直接展示四项当前数值（main 进程缓存） | 子菜单常驻 | — |
| 睡觉 | `{type:'mood', mood:'sleep'}` | 直接 `mood='sleep'` + `transientUntil=0` + 清走路 timer | 持久（任意 hover/click/drag 唤醒） | — |
| 喂食 | `{type:'care', action:'feed'}` | `eating` mood + hunger +40 | `1800ms` | hunger +40 |
| 洗澡 | `{type:'care', action:'clean'}` | `cleaning` mood + cleanliness +40 | `1800ms` | cleanliness +40 |
| 吃药 | `{type:'care', action:'medicate'}` | `medicine` mood + health +30 | `1800ms` | health +30 |

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
| R10 | 菜单"睡觉"是**持久睡眠**（`transientUntil=0`），与闲置 5min 自动入睡一致；任意 hover/click/drag 都会通过 `markInteraction` 把 `mood` 从 `sleep` 唤醒回 `idle`。 |
| R11 | 数值危险态（`sick/hungry/dirty/sad`）只在 `chooseAmbientMood` tick 中评估并覆盖，不会打断走路、限时态、睡眠或正在拖拽。 |
| R12 | 单击洗牌池 `CLICK_MOOD_POOL = ['affection','happy','play','excited','jumping']` 全部 ⊆ `POSITIVE_INTERACTION_MOODS`，所以点击始终触发 `mood +5` 隐性回补。**扩展洗牌池时必须保持这一不变量**，否则会出现"点击不回血"的隐性 bug。 |

## 当前不会自动出现的已接入情绪

以下 mood 已在 `PetMood` 与素材中存在，但当前没有自动触发路径（仅可作为后续预留，等待数值/养成系统接入）：

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
