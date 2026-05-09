# Asset Pipeline

## Source Sheets

- `references/ram-states-no-feet-sheet.png`
  - 基础无脚状态表。
  - 裁切脚本：`scripts/extract-generated-ram-states.mjs`
- `references/ram-waving-jumping-corrected.png`
  - 修正嘴部位置后的 waving / jumping。
  - 裁切脚本：`scripts/extract-corrected-waving-jumping.mjs`
- `references/ram-extra-states-sheet.png`
  - QQ 宠物式陪伴状态表。
  - 裁切脚本：`scripts/extract-ram-extra-states.mjs`

## Regeneration

```bash
node scripts/extract-generated-ram-states.mjs
node scripts/extract-corrected-waving-jumping.mjs
node scripts/extract-ram-extra-states.mjs
```

## Output

所有桌面 App 状态素材输出到：

```text
src/assets/ram/
```

要求：

- `512x512`
- 透明 PNG
- 无脚、无手、无腿
- 嘴巴位于脸部下半区，不贴眼睛
