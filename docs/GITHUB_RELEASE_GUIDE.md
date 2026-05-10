# GitHub 上传和自动发布步骤

这份文档给项目维护者使用。目标是：你在 Mac 上开发，GitHub 自动生成 Mac 和 Windows 包。

## 第一次上传 GitHub

1. 在 GitHub 新建一个空仓库。
2. 不要勾选自动创建 README、`.gitignore` 或 license。
3. 复制 GitHub 给你的仓库地址。
4. 在本地项目目录运行：

```bash
git remote add origin 你的仓库地址
git push -u origin main
```

如果 `remote origin already exists`，说明已经添加过 remote，可以先查看：

```bash
git remote -v
```

## 平时上传代码

```bash
git status
git add .
git commit -m "描述这次改了什么"
git push
```

## 自动生成 Release

当你想发布一个测试版本时，运行：

```bash
npm run release:patch -- "这次版本的简短说明"
git add package.json package-lock.json docs/CHANGELOG.md
git commit -m "Release v版本号"
git tag v版本号
git push origin main
git push origin v版本号
```

这会做三件事：

- 把 `package.json` 里的版本号加一位，比如 `0.0.3` 变成 `0.0.4`
- 把 `docs/CHANGELOG.md` 里的 `Unreleased` 内容归档到新版本
- 本地生成 Mac 包，确认当前版本可以打包
- 推送版本标签后触发 GitHub 自动打包

GitHub Actions 会自动生成：

- Mac `.dmg`
- Windows `.exe`

然后上传到 GitHub Releases。

## 去哪里看结果

在 GitHub 仓库页面：

- `Actions`：看自动打包是否成功
- `Releases`：下载生成好的安装包/运行包
- `Issues`：记录任务、bug、脑暴
- `Projects`：查看大家进度

## 常见提醒

- `main` 分支保持稳定，别人改代码尽量开 Pull Request。
- `release/`、`dist/`、`node_modules/` 不需要上传，GitHub 会自动重新生成。
- 没有代码签名时，Mac 和 Windows 都可能提示“不明开发者”或“未知发布者”，早期测试版这是正常的。
- Windows 包虽然能由 GitHub 自动生成，但仍然需要 Windows 真机测试透明窗口、托盘、置顶、拖拽等行为。
