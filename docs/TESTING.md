# Testing

## Build

```bash
npm run build
```

## Desktop App

```bash
npm run desktop:prod
```

验收：

- 透明无边框窗口出现。
- 拉姆保持置顶。
- 拖拽可移动窗口。
- 重启后窗口位置恢复。
- 托盘图标可显示/隐藏拉姆。
- 右键菜单可重置位置、切换置顶、退出。
- 单击、双击、拖拽、闲置能切换状态。

## Known Gaps

- 当前没有偏好设置窗口。
- 当前没有正式 `.app` / `.dmg` 打包。
- 当前数值系统尚未持久化。
