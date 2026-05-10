# 协作方式

这个项目是非盈利、为爱发电的拉姆桌面宠物。

## 日常流程

1. 需要执行的想法放到 GitHub Issues。
2. 正在做的任务放到 GitHub Projects 看板。
3. 代码改动用 Pull Request，不直接改 `main`。
4. 重要结论更新到 `docs/` 或对应 issue。

## 本地运行

```bash
npm install
npm run desktop
```

如果只想检查前端页面：

```bash
npm run dev
```

## 开发分支

每次只做一个小任务，先从 `main` 新建分支：

```bash
git checkout main
git pull
git checkout -b feature/hunger-state
```

常见分支名：

- `feature/hunger-state`
- `feature/windows-build`
- `docs/task-system`
- `fix/window-position`

## 提交 PR 前

至少运行：

```bash
npm run build
```

PR 里写清楚：

- 改了什么
- 怎么测试
- 哪些问题还没解决

## Windows 协作注意

Windows 伙伴优先测试这些点：

- `npm install` 是否成功
- `npm run desktop` 是否能打开桌宠
- 透明窗口、置顶、拖拽、托盘菜单是否正常
- `npm run dist:win` 是否能生成可运行的 `.exe`

Windows 相关修复尽量单独开分支和 PR，避免和情绪、数值、素材改动混在一起。

## 用 Codex 改代码时

建议一次只让 Codex 做一个 issue，并明确范围，例如：

> 只修 Windows 透明窗口问题，不要改素材、情绪逻辑和数值配置。改完后运行 npm run build，并总结修改过的文件。

避免一次性大重构。项目还早，保持每次改动小一点更容易合并。

## 协作署名

项目由 Siyue 创建和维护。

开发过程中使用 Codex 和 Claude Code 协助代码编辑、文档整理、发布流程配置和实现检查。AI 协作内容以最终提交到 GitHub 的代码、文档和 Pull Request 记录为准。
