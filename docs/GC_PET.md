# GitHub Copilot CLI RamPet

RamPet 也可以做 GitHub Copilot CLI 的桌宠：watcher 监听 GC CLI 的 `events.jsonl`，把事件实时翻译成
`.codex-pet/status.json`，Electron 端继续沿用 Codex pet 模式的 UI / 心情切换逻辑，UI 侧零改动。

## 启动

```powershell
npm.cmd run gc:pet
```

会同时启动：
1. RamPet Electron（如果还没在跑）—— 用 `CODEX_PET_MODE=1 + CODEX_PET_AUTO_SYNC=0`，关掉它自带的 Codex
   自动同步，由 watcher 独占驱动。
2. `gc-pet.mjs watch` 子进程 —— 后台 tail `~/.copilot/session-state/<id>/events.jsonl`。

会自动找当前活跃 session（按 `inuse.<pid>.lock` 判断进程是否还活着，再按 events.jsonl 最新修改时间排序）。

## 其他子命令

```powershell
npm.cmd run gc:sessions   # 列出本机所有 GC CLI session,* 标记是活跃的
npm.cmd run gc:status     # 打印当前 status.json
npm.cmd run gc:watch      # 只跑 watcher (不调起 Electron)
npm.cmd run gc:stop       # 停 watcher + Electron
```

## 事件 -> 状态映射

| GC CLI 事件 | Pet 状态 | 备注 |
| --- | --- | --- |
| `user.message` | `thinking` | 收到你的消息 |
| `assistant.turn_start` | `thinking` | 新任务 |
| `tool.execution_start` (shell/powershell/bash) | `running` | 执行命令 |
| `tool.execution_start` (edit/create) | `planning` | 改文件 |
| `tool.execution_start` (view/grep/glob/web_*) | `reading` | 查资料 |
| `tool.execution_start` (task/explore/research) | `thinking` | 派子代理 |
| `tool.execution_complete` success | `review` | 复查结果 |
| `tool.execution_complete` failed | `error` | 执行失败 |
| `permission.requested` | `blocked` | 等你确认 |
| `permission.completed` | `thinking` | 继续干活 |
| `assistant.message` (带 toolRequests) | `thinking` | 即将调用工具 |
| `assistant.message` (纯文本) | `success` | 整理好了回复 |
| `assistant.turn_end` | `idle` | Copilot 已就绪 |

`tool.execution_complete` 事件本身不带 toolName,watcher 在内存里维护一个
`toolCallId -> toolName` 的映射,start 时记录,complete 时取出再清理。

## 多 session 时跟谁

和 `codex-pet` 一致：**总是选 `events.jsonl` mtime 最新的那个 session**,无论它的 CLI 进程是否还活着。
每 5 秒重新扫描一次。`sessions` 子命令额外展示 active 标记 (`*`),仅作调试参考,不影响选择。

如果想锁定指定 session,设 `GC_PET_SESSION=<id>` 环境变量。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `COPILOT_HOME` | 覆盖 `~/.copilot` 路径 |
| `GC_PET_STATE` | 覆盖 status.json 路径 (默认 `<repo>/.codex-pet/status.json`) |
| `GC_PET_SESSION` | 强制 watch 指定 session id |

## 和 Codex 模式共存

两条路径写的是**同一个**`.codex-pet/status.json`,所以不要同时启动 `codex:pet` 和 `gc:pet`,
否则两个 source 会互相覆盖。要切换前先 `gc:stop` / `codex:pet` 的 stop。
