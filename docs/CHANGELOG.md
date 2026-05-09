# Changelog

All notable changes to pet are documented here.
Format: [Semantic Versioning](https://semver.org) · Dates in YYYY-MM-DD

---

## [Unreleased]

### Changed

- 调整项目约定：日常每次修改都记录到 `Unreleased`，但只有发版打包时才升级版本号。

---

## [0.0.3] — 2026-05-09

### Changed

- 新增自动发布版本脚本，并补充 CLAUDE.md 版本号与 changelog 同步规则。
- 新增 `scripts/release.mjs`，确保 `npm run release:* -- "说明"` 可以稳定把说明写入 changelog 后再打包。

---

## [0.0.2] — 2026-05-09

### Project Notes

- 项目约定：之后每次编辑代码或文档，都同步更新本 changelog。

### Added

- 新增小拉姆说话气泡 demo：定时在拉姆上方显示提醒文案，用于验证桌宠提醒体感。
- 新增提醒文案池：久坐、肩颈活动、喝水休息眼睛、陪拉姆动一动。
- 在 roadmap 中补充下一步提醒方向：后续接入 API，让提醒内容和提醒时机从固定文案升级为基于上下文判断。

### Changed

- 菜单栏/托盘图标单击从“显示/隐藏切换”改为弹出托盘菜单；右键也弹出同一菜单。
- 应用启动并加载窗口成功后会主动显示拉姆，并重新应用当前置顶配置；上次隐藏状态不再阻止本次启动显示。
- 互动菜单项会先显示拉姆再触发对应动作，避免拉姆隐藏时点击互动没有桌面反馈。
- `work` 状态改为按方向使用专用素材：向右使用 `work.png`，向左使用 `work-1.png`，不再通过 CSS 镜像工作素材。
- 提醒气泡频率改为每 1 分钟尝试一次，并上移气泡位置，减少和拉姆图片重合。
- 提醒气泡仅在 `affection` / `happy` / `play` / `excited` 积极状态下显示；如果提醒触发时不在这些状态，会先切到其中一个状态再说话。
- `sleep`、`walk` 和拖拽期间不弹出新提醒；进入 `sleep` 或 `walk` 时会立即清掉已有气泡。
- 当提醒文案为“站起来陪我动一动？”时，气泡消失后自动触发 `walk`。

### Fixed

- 修复菜单栏/托盘图标单击可能造成“像是在改置顶或需要再点一次才出现”的交互歧义。
- 修复 `work-1.png` 被 CSS `scaleX` 二次翻转导致左右工作素材方向不符合预期的问题。

---

## [0.0.1] — 2026-05-07

### Added

- 新增“悬停仅唤醒”交互：鼠标进入拉姆区域时，只刷新交互时间并在睡眠态下唤醒到 `idle`，不触发安抚情绪。
- 在 `docs/INTERACTION_LOGIC.md` 新增 `Plan（后续待做）`，记录“悬停唤醒后的动态过渡”待办。
- 右键互动菜单新增 `走路（测试）` 入口，便于手动触发 walk 行为做排查。

### Changed

- 单击情绪触发从“纯随机”改为“洗牌池随机”：`affection/happy/play/excited` 一轮内不重复，并尽量避免与上一次相同。
- `WALK_DURATION_MS` 从 `1600ms` 调整为 `1920ms`，使 `walk-1/walk-2` 以完整循环结束，减少收尾突兀感。
- `walk` 结束逻辑调整：自然到时回 `idle`，碰撞屏幕边缘也会立即停止并回到 `idle`。
- `walk` 帧切换 timer 改为仅在 `walk` 期间启动，退出 `walk` 时立即清理并重置帧。
- `WALK_EVERY_MS` 从 `5200ms` 调整为 `6200ms`，降低自动走路频率，减少打扰感。
- `SLEEP_AFTER_MS` 从 `30000ms` 调整为 `60000ms`，延后闲置睡眠触发，提升陪伴连续性。
- `SLEEP_AFTER_MS` 从 `60000ms` 进一步调整为 `300000ms`（5 分钟），减少“很快睡着”的体感。
- `AMBIENT` 轮询周期从 `7000ms` 调整为 `10000ms`，降低切换频率、增强常驻陪伴感。
- 环境态持续时长从统一 `2200ms` 改为分档：`study=8000ms`、`work=9000ms`、`play=3000ms`、`excited=2200ms`。
- `WALK_EVERY_MS` 从 `6200ms` 调整为 `9000ms`，进一步降低自动走路频率，减少打扰。
- `study` 状态新增双阶段素材表现：前 `2000ms` 使用 `study.png`，后续自动切换到 `study-1.png`。
- 宠物显示尺寸样式已恢复为固定尺寸方案（取消原图尺寸直出），保持 `150/164` 容器与 `128/150` 图片规格。

### Fixed

- 修复打包后拉姆素材无法加载的问题：素材路径改为 Vite 构建可解析的资源导入。
- 修复 macOS `.app` 中前端资源路径问题：Vite `base` 调整为相对路径，确保 `file://` 环境可访问。
- 修复 `study` 替换素材逻辑的计时器清理，避免状态切换后残留触发。

---

## [0.0.0] — 2026-05-06

### Added

- 创建中级阶段拉姆桌面宠物 Vue/Electron 项目。
- 新增透明无边框桌面悬浮窗口、托盘、右键菜单与窗口配置持久化。
- 新增状态资源与 `PetMood` 体系：基础状态、陪伴状态及资源映射。
- 新增交互与自动行为基础状态机：点击互动、拖拽抱起、自动走路、环境随机、闲置睡觉。
- 新增文档体系：
  - `docs/EMOTION_STATES.md`
  - `docs/INTERACTION_LOGIC.md`
  - `docs/IMPLEMENTATION_NOTES.md`
  - `src/assets/ram/README.md`
  - `docs/PROJECT_NARRATIVE.md`
- 新增候选素材与对比图（`src/assets/ram/candidates/` 与 `src/assets/ram/candidates/v3/`）。

### Changed

- 暂停需求数值驱动（保留类型与资源，不自动驱动 `hungry/dirty/sick/sad` 等需求态）。
- 点击策略从单/双击分流调整为“单击统一入口”。
- 拖拽阈值调整为 `4px`，优化轻拖体验。
- 闲置睡眠阈值调整为 `30000ms`，减少过早睡眠。
- 文档职责重分配：交互细节集中在 `docs/INTERACTION_LOGIC.md`，其余文档保持分类清晰。

### Fixed

- 修复睡眠表现与朝向一致性问题（含 `sleep-sway` 朝向保留）。
- 修复拖拽 capture 释放不彻底导致的轻点异常。
- 修复走路帧体积差异导致的切换跳变（`walk-2` 对齐 `walk-1` 体量）。

### Removed

- 移除点击成功后的外圈发光反馈。
