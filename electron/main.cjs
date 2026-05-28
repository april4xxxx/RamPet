const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !process.env.PET_LOAD_DIST && !app.isPackaged
const windowSize = 300
const codexStatusMoods = Object.freeze({
  idle: 'idle',
  thinking: 'studyAlt',
  reading: 'study',
  planning: 'work',
  running: 'spotted',
  review: 'work',
  success: 'happy',
  blocked: 'waving',
  error: 'sick',
})
const codexStatusLabels = Object.freeze({
  idle: '就绪',
  thinking: '思考中',
  reading: '阅读中',
  planning: '规划中',
  running: '执行中',
  review: '检查中',
  success: '已完成',
  blocked: '等待确认',
  error: '需要处理',
})

let petWindow = null
let tray = null
let config = null
let codexState = null
let codexStatePath = null
let codexActivityTimer = null
let lastCodexActivitySignature = ''
let cachedCodexSessionFile = null
let lastCodexSessionScanAt = 0
let isQuitting = false
let dragOffset = null
let dragTrackTimer = null
let isClickable = false
let persistTimer = null

function isCodexMode() {
  return process.env.CODEX_PET_MODE === '1' || Boolean(process.env.CODEX_PET_STATE)
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'ram-pet-config.json')
}

function defaultConfig() {
  const workArea = screen.getPrimaryDisplay().workArea
  return {
    alwaysOnTop: true,
    visible: true,
    petSize: 'medium',
    position: {
      x: workArea.x + workArea.width - windowSize - 36,
      y: workArea.y + workArea.height - windowSize - 70,
    },
  }
}

function readConfig() {
  const fallback = defaultConfig()
  try {
    const parsed = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
    return {
      ...fallback,
      ...parsed,
      position: { ...fallback.position, ...(parsed.position || {}) },
    }
  } catch {
    return fallback
  }
}

function writeConfig() {
  if (!config) return
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true })
  fs.writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function getCodexStatePath() {
  if (process.env.CODEX_PET_STATE) return path.resolve(process.env.CODEX_PET_STATE)
  return path.join(app.getPath('userData'), 'codex-pet-state.json')
}

function defaultCodexState(status = 'idle', message = 'Codex 已就绪') {
  return {
    status,
    message,
    detail: '',
    updatedAt: new Date().toISOString(),
    source: 'ram-pet',
  }
}

function normalizeCodexState(raw) {
  const status = Object.hasOwn(codexStatusMoods, raw?.status) ? raw.status : 'idle'
  const fallback = defaultCodexState(status, codexStatusLabels[status])
  const detail = Array.isArray(raw?.preview)
    ? raw.preview.filter((item) => typeof item === 'string' && item.trim()).join('\n')
    : raw?.detail
  return {
    ...fallback,
    ...raw,
    status,
    message: typeof raw?.message === 'string' && raw.message.trim() ? raw.message.trim().slice(0, 120) : fallback.message,
    detail: typeof detail === 'string' ? detail.replaceAll('\\n', '\n').trim().slice(0, 360) : '',
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
  }
}

function readCodexState() {
  try {
    return normalizeCodexState(JSON.parse(fs.readFileSync(codexStatePath, 'utf8')))
  } catch {
    return defaultCodexState()
  }
}

function writeCodexState(nextState) {
  codexState = normalizeCodexState(nextState)
  fs.mkdirSync(path.dirname(codexStatePath), { recursive: true })
  fs.writeFileSync(codexStatePath, `${JSON.stringify(codexState, null, 2)}\n`, 'utf8')
  publishCodexState()
  refreshTrayMenu()
}

function listFilesRecursive(root, predicate, maxDepth = 6) {
  const results = []
  function visit(dir, depth) {
    if (depth > maxDepth) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(filePath, depth + 1)
      } else if (predicate(entry.name, filePath)) {
        results.push(filePath)
      }
    }
  }
  visit(root, 0)
  return results
}

function findLatestCodexSessionFile() {
  const now = Date.now()
  if (cachedCodexSessionFile && now - lastCodexSessionScanAt < 5000) return cachedCodexSessionFile
  lastCodexSessionScanAt = now
  const root = path.join(app.getPath('home'), '.codex', 'sessions')
  let latest = null
  for (const filePath of listFilesRecursive(root, (name) => /^rollout-.*\.jsonl$/.test(name))) {
    try {
      const stats = fs.statSync(filePath)
      if (!latest || stats.mtimeMs > latest.mtimeMs) latest = { filePath, mtimeMs: stats.mtimeMs }
    } catch {
      // Ignore sessions that rotate while we are scanning.
    }
  }
  cachedCodexSessionFile = latest?.filePath || null
  return cachedCodexSessionFile
}

function readTailLines(filePath, maxBytes = 128 * 1024) {
  try {
    const stats = fs.statSync(filePath)
    const size = Math.min(stats.size, maxBytes)
    const buffer = Buffer.alloc(size)
    const fd = fs.openSync(filePath, 'r')
    try {
      fs.readSync(fd, buffer, 0, size, stats.size - size)
    } finally {
      fs.closeSync(fd)
    }
    return buffer.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-120)
  } catch {
    return []
  }
}

function textFromAssistantMessage(payload) {
  if (!Array.isArray(payload?.content)) return ''
  return payload.content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function summarizeCommand(payload) {
  let args = {}
  try {
    args = JSON.parse(payload?.arguments || '{}')
  } catch {
    args = {}
  }
  const command = typeof args.command === 'string' ? args.command : ''
  const toolName = payload?.name ? `tool: ${payload.name}` : ''
  return [toolName, command].filter(Boolean).join('\n').slice(0, 360)
}

function summarizeToolOutput(payload) {
  const output = typeof payload?.output === 'string' ? payload.output : ''
  return output.split(/\r?\n/).filter(Boolean).slice(0, 6).join('\n').slice(0, 360)
}

function inferredStateFromEntry(entry) {
  const payload = entry?.payload || {}
  const timestamp = typeof entry?.timestamp === 'string' ? entry.timestamp : new Date().toISOString()
  const base = {
    updatedAt: timestamp,
    source: 'codex-session-watch',
  }

  if (entry?.type === 'turn_context') {
    return {
      ...base,
      status: 'thinking',
      message: '我收到新任务，正在进入状态。',
      detail: '',
    }
  }

  if (entry?.type === 'event_msg') {
    if (payload.type === 'context_compacted') {
      return {
        ...base,
        status: 'reading',
        message: '我在恢复上下文。',
        detail: 'Codex 正在压缩并恢复当前会话上下文。',
      }
    }
    if (payload.type === 'agent_message' && typeof payload.message === 'string') {
      return {
        ...base,
        status: 'thinking',
        message: '我正在同步进展。',
        detail: payload.message.slice(0, 360),
      }
    }
    return null
  }

  if (entry?.type !== 'response_item') return null

  if (payload.type === 'function_call') {
    if (payload.name === 'update_plan') {
      return {
        ...base,
        status: 'planning',
        message: '我在整理计划。',
        detail: summarizeCommand(payload),
      }
    }
    if (payload.name === 'request_user_input') {
      return {
        ...base,
        status: 'blocked',
        message: '需要你确认一下。',
        detail: summarizeCommand(payload),
      }
    }
    return {
      ...base,
      status: 'running',
      message: '我正在执行命令。',
      detail: summarizeCommand(payload),
    }
  }

  if (payload.type === 'function_call_output') {
    return {
      ...base,
      status: 'review',
      message: '我在复查执行结果。',
      detail: summarizeToolOutput(payload),
    }
  }

  if (payload.type === 'reasoning') {
    return {
      ...base,
      status: 'thinking',
      message: '我在思考下一步。',
      detail: '',
    }
  }

  if (payload.type === 'message' && payload.role === 'assistant') {
    return {
      ...base,
      status: 'success',
      message: '我整理好了回复。',
      detail: textFromAssistantMessage(payload).slice(0, 360),
    }
  }

  return null
}

function inferLatestCodexActivity() {
  const sessionFile = findLatestCodexSessionFile()
  if (!sessionFile) return null
  const lines = readTailLines(sessionFile)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index])
      const next = inferredStateFromEntry(entry)
      if (!next) continue
      const payload = entry.payload || {}
      return {
        ...next,
        detail: [next.detail, `session: ${path.basename(sessionFile)}`].filter(Boolean).join('\n'),
        signature: [entry.timestamp, entry.type, payload.type, payload.call_id, payload.name].filter(Boolean).join('|'),
      }
    } catch {
      // Ignore incomplete JSONL lines while Codex is writing them.
    }
  }
  return null
}

function syncCodexActivity() {
  if (!codexStatePath) return
  const next = inferLatestCodexActivity()
  if (!next || next.signature === lastCodexActivitySignature) return
  const nextTime = Date.parse(next.updatedAt)
  const currentTime = Date.parse(codexState?.updatedAt || '')
  if (Number.isFinite(nextTime) && Number.isFinite(currentTime) && nextTime <= currentTime) return
  lastCodexActivitySignature = next.signature
  const { signature, ...state } = next
  writeCodexState(state)
}

function startCodexActivitySync() {
  if (process.env.CODEX_PET_AUTO_SYNC === '0') return
  syncCodexActivity()
  codexActivityTimer = setInterval(syncCodexActivity, 1200)
  if (typeof codexActivityTimer.unref === 'function') codexActivityTimer.unref()
}

function stopCodexActivitySync() {
  if (!codexActivityTimer) return
  clearInterval(codexActivityTimer)
  codexActivityTimer = null
}

function ensureCodexStateFile() {
  fs.mkdirSync(path.dirname(codexStatePath), { recursive: true })
  if (!fs.existsSync(codexStatePath)) writeCodexState(defaultCodexState())
}

function publishCodexState() {
  if (!codexState) codexState = readCodexState()
  sendPetAction({
    type: 'codex-status',
    ...codexState,
    mood: codexStatusMoods[codexState.status] || 'idle',
  })
}

function startCodexBridge() {
  codexStatePath = getCodexStatePath()
  ensureCodexStateFile()
  codexState = readCodexState()
  fs.watchFile(codexStatePath, { interval: 750 }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs) return
    codexState = readCodexState()
    publishCodexState()
    refreshTrayMenu()
  })
}

function stopCodexBridge() {
  if (!codexStatePath) return
  fs.unwatchFile(codexStatePath)
}

function rectContains(area, x, y) {
  return x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height
}

function distanceToRect(area, x, y) {
  const dx = Math.max(area.x - x, 0, x - (area.x + area.width - 1))
  const dy = Math.max(area.y - y, 0, y - (area.y + area.height - 1))
  return dx * dx + dy * dy
}

// Per-display clamp: keep window within the workArea of the display that
// contains the window's center. If no display contains the center (e.g. the
// window drifted into a "void" region between monitors after a display layout
// change), fall back to the nearest display.
function clampWindowPosition(x, y, width = windowSize, height = windowSize) {
  const displays = screen.getAllDisplays()
  if (!displays.length) {
    const fallback = screen.getPrimaryDisplay().workArea
    return clampToArea(fallback, x, y, width, height)
  }
  const centerX = x + width / 2
  const centerY = y + height / 2
  let target = displays.find((d) => rectContains(d.workArea, centerX, centerY))
  if (!target) {
    let bestDistance = Infinity
    for (const d of displays) {
      const dist = distanceToRect(d.workArea, centerX, centerY)
      if (dist < bestDistance) {
        bestDistance = dist
        target = d
      }
    }
  }
  return clampToArea(target.workArea, x, y, width, height)
}

function clampToArea(area, x, y, width, height) {
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  return {
    x: Math.max(area.x, Math.min(maxX, Math.round(x))),
    y: Math.max(area.y, Math.min(maxY, Math.round(y))),
  }
}

function applyWindowPosition(x, y) {
  if (!petWindow) return null
  const bounds = petWindow.getBounds()
  const next = clampWindowPosition(x, y, bounds.width, bounds.height)
  petWindow.setBounds({ x: next.x, y: next.y, width: bounds.width, height: bounds.height })
  return { applied: next, previous: bounds }
}

function persistWindowPosition() {
  if (!petWindow || !config) return
  const bounds = petWindow.getBounds()
  config.position = clampWindowPosition(bounds.x, bounds.y, bounds.width, bounds.height)
  writeConfig()
}

// Debounce config writes — drag and walk can move the window dozens of times
// per second; syncing to disk on every tick stalls the event loop.
function schedulePersistWindowPosition() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistWindowPosition()
  }, 250)
  if (typeof persistTimer.unref === 'function') persistTimer.unref()
}

function flushPersistWindowPosition() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  persistWindowPosition()
}

function reclampIntoVisibleArea() {
  if (!petWindow) return
  const bounds = petWindow.getBounds()
  const next = clampWindowPosition(bounds.x, bounds.y, bounds.width, bounds.height)
  if (next.x !== bounds.x || next.y !== bounds.y) {
    petWindow.setBounds({ x: next.x, y: next.y, width: bounds.width, height: bounds.height })
  }
  schedulePersistWindowPosition()
}

function setPetClickable(clickable) {
  if (!petWindow) return
  const desired = Boolean(clickable)
  if (desired === isClickable) return
  isClickable = desired
  petWindow.setIgnoreMouseEvents(!desired, { forward: true })
}

function startCursorDrag(offset) {
  dragOffset = {
    x: Number.isFinite(offset?.x) ? offset.x : 0,
    y: Number.isFinite(offset?.y) ? offset.y : 0,
  }
  stopCursorDrag(false)
  // Track at ~60fps. Use setInterval rather than chasing pointer events from
  // the renderer to bypass any DIP / event-coordinate mismatches.
  dragTrackTimer = setInterval(syncWindowToCursor, 16)
  if (typeof dragTrackTimer.unref === 'function') dragTrackTimer.unref()
  syncWindowToCursor()
}

function stopCursorDrag(clearOffset = true) {
  if (dragTrackTimer) {
    clearInterval(dragTrackTimer)
    dragTrackTimer = null
  }
  if (clearOffset) dragOffset = null
  flushPersistWindowPosition()
}

function syncWindowToCursor() {
  if (!petWindow || !dragOffset) return
  const cursor = screen.getCursorScreenPoint()
  applyWindowPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y)
  schedulePersistWindowPosition()
}

function sendPetAction(action) {
  if (!petWindow) return
  petWindow.webContents.send('pet-action', action)
}

function updateAlwaysOnTop(value) {
  config.alwaysOnTop = Boolean(value)
  if (petWindow) petWindow.setAlwaysOnTop(config.alwaysOnTop, 'floating')
  writeConfig()
}

function showPetWindow() {
  if (!petWindow) return
  petWindow.setAlwaysOnTop(config.alwaysOnTop, 'floating')
  petWindow.show()
  petWindow.moveTop()
  config.visible = true
  writeConfig()
}

function hidePetWindow() {
  if (!petWindow) return
  petWindow.hide()
  config.visible = false
  writeConfig()
}

function resetPetPosition() {
  if (!petWindow) return
  const next = defaultConfig().position
  petWindow.setPosition(next.x, next.y, false)
  config.position = next
  showPetWindow()
}

function sendVisiblePetAction(action) {
  showPetWindow()
  sendPetAction(action)
}

function findWindowsCodexExe() {
  const override = process.env.CODEX_APP_EXE
  if (override && fs.existsSync(override)) return override

  const roots = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsApps'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'WindowsApps'),
  ]
  const packagePattern = /^OpenAI\.Codex_.*__2p2nqsd0c76g0$/
  const candidates = []
  for (const root of roots) {
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !packagePattern.test(entry.name)) continue
      const exe = path.join(root, entry.name, 'app', 'Codex.exe')
      try {
        candidates.push({ exe, mtimeMs: fs.statSync(exe).mtimeMs })
      } catch {
        // Skip partial or inaccessible package entries.
      }
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0]?.exe || null
}

function openCodexApp() {
  if (process.platform === 'win32') {
    const codexExe = findWindowsCodexExe()
    if (codexExe) {
      const child = spawn(codexExe, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.unref()
      return
    }

    shell.openExternal('codex://').catch(() => {
      const child = spawn('explorer.exe', ['shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.unref()
    })
    return
  }
  shell.openExternal('codex://').catch(() => {})
}

function buildMenuTemplate() {
  const template = [
    ...(isCodexMode() ? [{ label: '打开 Codex', click: openCodexApp }, { type: 'separator' }] : []),
    {
      label: petWindow?.isVisible() ? '隐藏拉姆' : '显示拉姆',
      click: () => (petWindow?.isVisible() ? hidePetWindow() : showPetWindow()),
    },
    { label: '重置位置', click: resetPetPosition },
    {
      label: '保持置顶',
      type: 'checkbox',
      checked: Boolean(config.alwaysOnTop),
      click: (item) => updateAlwaysOnTop(item.checked),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        writeConfig()
        app.quit()
      },
    },
  ]
  return template
}

function refreshTrayMenu() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()))
}

function showTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate(buildMenuTemplate())
  tray.setContextMenu(menu)
  tray.popUpContextMenu(menu)
}

function showPetContextMenu() {
  refreshTrayMenu()
  Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: petWindow })
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png')
  const image = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
  tray = new Tray(image)
  tray.setToolTip('中级阶段拉姆宠物')
  tray.on('click', showTrayMenu)
  tray.on('right-click', showTrayMenu)
  refreshTrayMenu()
}

function createPetWindow() {
  const position = clampWindowPosition(config.position.x, config.position.y)

  petWindow = new BrowserWindow({
    width: windowSize,
    height: windowSize,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    alwaysOnTop: config.alwaysOnTop,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    title: '中级阶段拉姆宠物',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.setAlwaysOnTop(config.alwaysOnTop, 'floating')
  // Default the window to click-through; the renderer toggles back to
  // clickable only when the cursor is over the pet sprite itself, so the
  // transparent margins of the 300x300 window stop blocking the desktop.
  isClickable = false
  petWindow.setIgnoreMouseEvents(true, { forward: true })

  petWindow.on('moved', schedulePersistWindowPosition)
  petWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hidePetWindow()
  })
  petWindow.on('show', refreshTrayMenu)
  petWindow.on('hide', refreshTrayMenu)

  const url = isDev
    ? 'http://127.0.0.1:5173/?desktop=1'
    : `file://${path.join(__dirname, '../dist/index.html')}?desktop=1`

  petWindow.loadURL(url)
  petWindow.once('ready-to-show', () => {
    showPetWindow()
    if (isCodexMode()) publishCodexState()
  })
}

app.whenReady().then(() => {
  config = readConfig()
  createPetWindow()
  createTray()
  if (isCodexMode()) {
    startCodexBridge()
    startCodexActivitySync()
  }

  for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) {
    screen.on(event, reclampIntoVisibleArea)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow()
    showPetWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopCursorDrag()
  stopCodexActivitySync()
  stopCodexBridge()
  flushPersistWindowPosition()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('pet-window:move-by', (_event, delta) => {
  if (!petWindow) return { x: 0, y: 0 }
  const current = petWindow.getBounds()
  const result = applyWindowPosition(
    current.x + (Number(delta?.x) || 0),
    current.y + (Number(delta?.y) || 0),
  )
  if (!result) return { x: 0, y: 0 }
  config.visible = true
  schedulePersistWindowPosition()
  return {
    x: result.applied.x - result.previous.x,
    y: result.applied.y - result.previous.y,
  }
})

ipcMain.handle('pet-window:start-drag', (_event, offset) => {
  setPetClickable(true)
  startCursorDrag(offset)
})

ipcMain.handle('pet-window:end-drag', () => {
  stopCursorDrag()
})

ipcMain.handle('pet-window:set-clickable', (_event, clickable) => {
  setPetClickable(clickable)
})

ipcMain.handle('pet-window:show-context-menu', () => {
  showPetContextMenu()
})
