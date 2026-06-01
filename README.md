# 中级阶段拉姆桌面宠物

这是一个 Vue 3 + Electron 的本地桌面宠物 App。App 运行时使用 `src/assets/ram/` 下的单张状态 PNG。

当前版本：`0.1.0`（首个养成系统 milestone）。设计与数值见 [docs/iterations.md](docs/iterations.md) 和 [docs/plan.md](docs/plan.md)。

## 本地运行

```bash
npm install
npm run desktop
```

## 功能概览

- 透明无边框桌面悬浮窗，托盘 + 右键菜单。
- 21 个情绪状态（21 个 `PetMood`），其中 14 个有自动触发路径，包括启动打招呼、单击洗牌池、鼠标接近反应、自动走路、环境随机、闲置睡觉。
- **养成数值层**：`hunger/cleanliness/mood/health` 四项数值会自然衰减，低于阈值会触发对应情绪态（`hungry/dirty/sad/sick`），用户可通过菜单"喂食/洗澡/吃药"回补；数值持久化到 `userData/ram-care-stats.json`，离线衰减封顶 8 小时。
- 状态查看：右键菜单"查看状态"在拉姆头顶浮出气泡面板，托盘菜单"今日状态"展示四项数值。

## Codex desktop pet mode

```powershell
npm.cmd run codex:pet
```

Codex mode watches `.codex-pet/status.json` and changes the pet mood from Codex status updates. See `docs/CODEX_PET.md` for the status commands.

## 打包

Mac：

```bash
npm run dist:mac
```

Windows：

```bash
npm run dist:win
```

GitHub Release 会在推送 `v*` 版本标签时自动生成，完整发布步骤见 `docs/GITHUB_RELEASE_GUIDE.md`。

## 目录说明

- `src/`、`electron/`、`public/`：桌面 App 源码。
- `src/lib/pet-state.ts`：所有数值常量（包括养成数值层）。
- `src/lib/care-stats.ts`：养成数值的衰减、阈值、持久化 composable。
- `src/assets/ram/`：App 直接加载的拉姆状态素材。
- `scripts/extract-*.mjs`：从 `references/` 源图裁切 App 状态素材的脚本。
- `references/`：App 素材生成需要的源图和调试参考图。

## 文档

- [docs/CHANGELOG.md](docs/CHANGELOG.md) — 版本变更
- [docs/plan.md](docs/plan.md) — 路线图（设计中 / 已实现 / 已废弃）
- [docs/iterations.md](docs/iterations.md) — 迭代日志（为什么做、测试发现、UX 决策、数值层）
- [docs/INTERACTION_LOGIC.md](docs/INTERACTION_LOGIC.md) — 当前交互逻辑（代码层视角）
- [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) — 素材生成与裁切

## 大版本更新文档约定

每次涉及功能/数据/架构变化的大版本，以下 5 份文档必须同步更新：

1. `package.json` — bump 版本
2. `docs/CHANGELOG.md` — Added / Changed / Fixed
3. `README.md` — 功能/数据/架构/脚本变化时同步
4. `docs/iterations.md` — 为什么做、测试发现、UX 决策、下一步；**数值类改动单独写"数值层"小节**
5. `docs/plan.md` — 路线状态变化（设计中→已实现→已废弃）
