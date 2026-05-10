# 中级阶段拉姆桌面宠物

这是一个 Vue 3 + Electron 的本地桌面宠物 App。App 运行时使用 `src/assets/ram/` 下的单张状态 PNG，不依赖 Codex spritesheet。

## 本地运行

```bash
npm install
npm run desktop
```

## 打包

Mac：

```bash
npm run dist:mac
```

Windows：

```bash
npm run dist:win
```

GitHub Release 会在推送 `v*` 版本标签时自动生成，Codex + GitHub 的完整使用步骤见 `docs/CODEX_GITHUB_GUIDE.md`。

## 目录说明

- `src/`、`electron/`、`public/`：桌面 App 源码。
- `src/assets/ram/`：App 直接加载的拉姆状态素材。
- `scripts/extract-*.mjs`：从 `references/` 源图裁切 App 状态素材的脚本。
- `references/`：App 素材生成需要的源图和调试参考图。
- `codex-related-export/`：Codex 宠物包、spritesheet、hatch 过程产物和历史导出文件；默认不上传 GitHub。
