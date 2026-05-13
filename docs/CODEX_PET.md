# Codex RamPet

RamPet can run as a Codex desktop companion by watching a local status file and, by default, the active Codex session JSONL stream.

## Start

```powershell
npm.cmd run codex:pet
```

This starts Electron in production mode and points it at:

```text
.codex-pet/status.json
```

## Update Status

```powershell
node scripts/codex-pet.mjs thinking "Thinking through the task"
node scripts/codex-pet.mjs reading "Reading files"
node scripts/codex-pet.mjs planning "Planning the patch"
node scripts/codex-pet.mjs running "Running tests"
node scripts/codex-pet.mjs thinking "Reading the repo" --detail "Checking Electron bridge\nFinding Vue state flow"
node scripts/codex-pet.mjs review "Reviewing the result"
node scripts/codex-pet.mjs success "Task complete"
node scripts/codex-pet.mjs blocked "Waiting for your confirmation"
node scripts/codex-pet.mjs error "Something needs attention"
node scripts/codex-pet.mjs idle "Codex ready"
```

The tray menu shows the current Codex status only. Manual status changes come from the watched status file; automatic work-state changes come from the newest Codex `rollout-*.jsonl` session file under `~/.codex/sessions`.

Set `CODEX_PET_AUTO_SYNC=0` before starting the pet to disable automatic Codex session sync.

## Automatic Sync

RamPet infers live Codex activity from the current session:

| Codex session event | Pet status | Bubble text |
| --- | --- | --- |
| new turn context | `thinking` | 我收到新任务，正在进入状态。 |
| context compacted | `reading` | 我在恢复上下文。 |
| agent progress message | `thinking` | 我正在同步进展。 |
| plan update | `planning` | 我在整理计划。 |
| user confirmation request | `blocked` | 需要你确认一下。 |
| tool call / shell command | `running` | 我正在执行命令。 |
| tool output | `review` | 我在复查执行结果。 |
| reasoning item | `thinking` | 我在思考下一步。 |
| assistant message | `success` | 我整理好了回复。 |

## Status Mapping

| Codex status | Pet mood |
| --- | --- |
| `idle` | idle |
| `thinking` | study-1 |
| `reading` | study |
| `planning` | work |
| `running` | spotted |
| `review` | work |
| `success` | happy |
| `blocked` | waving |
| `error` | sick |

Persistent states such as `running`, `review`, `blocked`, and `error` pause ambient wandering so the pet keeps showing the active Codex state until the next update.

The optional `detail` field is shown in the chat preview bubble. Use it for a short thinking preview rather than a full log.
