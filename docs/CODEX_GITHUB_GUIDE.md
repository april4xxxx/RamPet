# Codex + GitHub 使用指南

这份指南只说明如何用 Codex 和 GitHub 管理 RamPet 项目代码、在 Mac/Windows 上开发、打包，以及自动生成 GitHub Release。

## 1. 项目地址

仓库地址：

```text
https://github.com/april4xxxx/RamPet.git
```

## 2. 第一次下载项目

### Mac

打开终端，进入你想放项目的目录：

```bash
cd ~/Desktop
git clone https://github.com/april4xxxx/RamPet.git
cd RamPet
npm install
npm run desktop
```

### Windows

建议先安装：

- Git for Windows
- Node.js LTS
- Codex

然后打开 PowerShell：

```powershell
cd Desktop
git clone https://github.com/april4xxxx/RamPet.git
cd RamPet
npm install
npm run desktop
```

如果 `npm run desktop` 成功，会启动本地开发版桌宠。

## 3. 用 Codex 改代码的推荐流程

每次开始前，先同步最新版：

```bash
git checkout main
git pull
```

新建一个分支：

```bash
git checkout -b feature/你的功能名
```

然后打开 Codex，让它只做一个明确任务，例如：

```text
请帮我实现“拉姆饿了”状态，只修改状态逻辑和必要 UI，不要重构整个项目。改完后运行 npm run build，并总结修改文件。
```

改完后检查：

```bash
npm run build
git status
```

提交：

```bash
git add .
git commit -m "Add hunger state"
git push -u origin feature/你的功能名
```

然后去 GitHub 页面创建 Pull Request。

## 4. 如果你自己直接维护 main 分支

如果是项目主维护者，小改动也可以直接提交到 `main`：

```bash
git checkout main
git pull
git add .
git commit -m "描述这次改了什么"
git push
```

建议每次提交前至少运行：

```bash
npm run build
```

## 5. 本地运行

开发运行：

```bash
npm run desktop
```

只看网页前端：

```bash
npm run dev
```

生产模式本地预览：

```bash
npm run desktop:prod
```

## 6. 本地打包

### Mac 打包

在 Mac 上运行：

```bash
npm run dist:mac
```

生成文件会在：

```text
release/
```

通常是 `.dmg`。

### Windows 打包

在 Windows 上运行：

```powershell
npm run dist:win
```

在 Mac 上也可以运行：

```bash
npm run dist:win
```

当前配置会生成常见 Windows x64 版本：

```text
release/RamPet-版本号-win-x64.exe
```

注意：Mac 可以打 Windows 包，但不能真正验证 Windows 窗口行为。Windows 版仍然需要 Windows 真机测试。

## 7. 自动 Release

项目已经配置 GitHub Actions。

当推送 `v*` 版本标签时，GitHub 会自动：

1. 安装依赖
2. 构建项目
3. 在 macOS runner 上打 Mac 包
4. 在 Windows runner 上打 Windows 包
5. 创建 GitHub Release
6. 上传 `.dmg` 和 `.exe`

### 发布一个新测试版本

在本地运行：

```bash
git checkout main
git pull
npm version patch
git push
git push origin --tags
```

示例：

- 当前版本 `0.0.3`
- 执行 `npm version patch`
- 会变成 `0.0.4`
- Git 会自动创建标签 `v0.0.4`
- 推送标签后触发自动 Release

## 8. 查看自动打包结果

打开 GitHub 仓库：

```text
https://github.com/april4xxxx/RamPet
```

查看打包过程：

```text
Actions
```

下载发布包：

```text
Releases
```

如果 Actions 失败，点进去看红色失败步骤，把报错复制给 Codex。

## 9. 常见问题

### npm install 失败

先确认 Node.js 版本：

```bash
node -v
npm -v
```

建议使用 Node.js LTS。

### npm run desktop 失败

先运行：

```bash
npm install
npm run build
```

如果仍然失败，把完整报错交给 Codex。

### Git push 失败

常见原因：

- 没有 GitHub 权限
- 没有登录 GitHub
- 本地代码落后于远程

可以先运行：

```bash
git pull
git push
```

如果还失败，把报错交给 Codex。

### Release 里没有安装包

去 GitHub 的 `Actions` 页面查看是否失败。

如果失败，把失败日志交给 Codex。不要手动上传 `release/` 文件夹到仓库。

## 10. 交给 Codex 的常用提示词

开发新功能：

```text
请基于当前仓库实现一个小功能：XXX。请保持改动范围小，先读相关文件，不要重构无关代码。完成后运行 npm run build，并总结改动文件。
```

修 bug：

```text
这个项目在 XXX 场景报错：YYY。请定位原因并修复，只改必要文件。完成后运行 npm run build。
```

处理 GitHub Actions 失败：

```text
这是 GitHub Actions 的失败日志：XXX。请帮我判断原因并修复 release workflow 或项目配置。
```

准备发布：

```text
请检查当前项目是否适合发布新版本，运行构建检查，并告诉我能不能执行 npm version patch 和推送 tag。
```
