const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !process.env.PET_LOAD_DIST && !app.isPackaged
const windowSize = 300
// The Electron window is 300x300, but `.ram-pet` (the actual clickable /
// visible pet bbox in the renderer) is `PET_BODY` sized, offset by
// `PET_INSET` inside the window. The remaining margins are transparent
// padding for the speech / Codex bubble. Clamping the *window* to workArea
// would leave the visible pet a corresponding 68 / 92 / 44 px short of
// each screen edge, so we clamp the visible pet bbox instead — the
// transparent margins are allowed to overhang workArea.
// Must stay in sync with the values used by `RamPet.vue` and `style.css`.
const PET_BODY = Object.freeze({ width: 164, height: 164 })
const PET_INSET = Object.freeze({ left: 68, top: 92 })
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
const MONITOR_SOURCES = Object.freeze({
  NONE: 'none',
  CODEX: 'codex',
  GITHUB_COPILOT: 'github-copilot',
})
const COPILOT_READ_TOOLS = new Set([
  'view', 'grep', 'glob', 'read', 'web_fetch', 'web_search',
  'github-mcp-server-get_file_contents', 'github-mcp-server-search_code',
  'github-mcp-server-get_copilot_space', 'github-mcp-server-list_copilot_spaces',
  'github-mcp-server-search_users',
])
const COPILOT_WRITE_TOOLS = new Set(['edit', 'create', 'str_replace_editor'])
const COPILOT_SHELL_TOOLS = new Set(['powershell', 'bash', 'shell', 'sh'])
const COPILOT_DELEGATION_TOOLS = new Set(['task', 'explore', 'research', 'general-purpose', 'code-review'])

let petWindow = null
let tray = null
let config = null
let codexState = null
let codexStatePath = null
let codexBridgeStarted = false
let codexActivityTimer = null
let lastCodexActivitySignature = ''
let cachedCodexSessionFile = null
let lastCodexSessionScanAt = 0
let githubCopilotActivityTimer = null
let lastGitHubCopilotActivitySignature = ''
let cachedGitHubCopilotSessionFile = null
let lastGitHubCopilotSessionScanAt = 0
let monitorSource = MONITOR_SOURCES.NONE
let isQuitting = false
let dragOffset = null
let dragTrackTimer = null
let isClickable = false
let persistTimer = null

// 由 renderer 推送上来的当前数值，供菜单条件显示和托盘子菜单使用
let currentCareStats = { hunger: 82, cleanliness: 88, mood: 86, health: 92 }
const CARE_MENU_THRESHOLD = 60
const CARE_STAT_LABELS = {
  hunger: '饱腹',
  cleanliness: '清洁',
  mood: '心情',
  health: '健康',
}

function isCodexMode() {
  return process.env.CODEX_PET_MODE === '1' || Boolean(process.env.CODEX_PET_STATE)
}

function normalizeMonitorSource(value) {
  return Object.values(MONITOR_SOURCES).includes(value) ? value : MONITOR_SOURCES.NONE
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
    monitorSource: MONITOR_SOURCES.NONE,
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
      monitorSource: normalizeMonitorSource(parsed.monitorSource),
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
  stopCodexActivitySync()
  lastCodexActivitySignature = ''
  syncCodexActivity()
  codexActivityTimer = setInterval(syncCodexActivity, 1200)
  if (typeof codexActivityTimer.unref === 'function') codexActivityTimer.unref()
}

function stopCodexActivitySync() {
  if (!codexActivityTimer) return
  clearInterval(codexActivityTimer)
  codexActivityTimer = null
}

function summarizeCopilotText(text, max = 160) {
  if (!text) return ''
  const trimmed = String(text).replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function classifyGitHubCopilotTool(name) {
  if (!name) return 'running'
  const lower = name.toLowerCase()
  if (COPILOT_SHELL_TOOLS.has(lower)) return 'running'
  if (COPILOT_WRITE_TOOLS.has(lower)) return 'planning'
  if (COPILOT_READ_TOOLS.has(lower) || lower.startsWith('view') || lower.startsWith('grep')) return 'reading'
  if (COPILOT_DELEGATION_TOOLS.has(lower)) return 'thinking'
  return 'running'
}

function findLatestGitHubCopilotSessionFile() {
  const now = Date.now()
  if (cachedGitHubCopilotSessionFile && now - lastGitHubCopilotSessionScanAt < 5000) {
    return cachedGitHubCopilotSessionFile
  }
  lastGitHubCopilotSessionScanAt = now
  const root = path.join(app.getPath('home'), '.copilot', 'session-state')
  let latest = null
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    cachedGitHubCopilotSessionFile = null
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const filePath = path.join(root, entry.name, 'events.jsonl')
    try {
      const stats = fs.statSync(filePath)
      if (!latest || stats.mtimeMs > latest.mtimeMs) latest = { filePath, mtimeMs: stats.mtimeMs }
    } catch {
      // Ignore sessions that rotate while we are scanning.
    }
  }
  cachedGitHubCopilotSessionFile = latest?.filePath || null
  return cachedGitHubCopilotSessionFile
}

function findGitHubCopilotToolName(lines, startIndex, toolCallId) {
  if (!toolCallId) return ''
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index])
      const data = entry?.data || {}
      if (entry?.type === 'tool.execution_start' && data.toolCallId === toolCallId) {
        return typeof data.toolName === 'string' ? data.toolName : ''
      }
    } catch {
      // Ignore malformed historical lines while searching for the matching start event.
    }
  }
  return ''
}

function inferredStateFromGitHubCopilotEntry(entry, lines, index) {
  const data = entry?.data || {}
  const timestamp = typeof entry?.timestamp === 'string' ? entry.timestamp : new Date().toISOString()
  const base = {
    updatedAt: timestamp,
    source: 'github-copilot-session-watch',
  }

  switch (entry?.type) {
    case 'user.message':
      return {
        ...base,
        status: 'thinking',
        message: '收到你的消息',
        detail: summarizeCopilotText(data.content, 200),
      }
    case 'assistant.turn_start':
      return {
        ...base,
        status: 'thinking',
        message: '收到新任务，进入状态',
        detail: '',
      }
    case 'tool.execution_start': {
      const toolName = typeof data.toolName === 'string' ? data.toolName : ''
      const detail = data.arguments?.description || data.arguments?.command || ''
      const status = classifyGitHubCopilotTool(toolName)
      const labels = {
        running: `执行 ${toolName || '命令'}`,
        planning: `修改文件 (${toolName})`,
        reading: `查看 ${toolName || '资料'}`,
        thinking: `派出子代理 (${toolName})`,
      }
      return {
        ...base,
        status,
        message: labels[status] || `调用 ${toolName}`,
        detail: summarizeCopilotText(detail, 160),
      }
    }
    case 'tool.execution_complete': {
      const success = data.success !== false
      const toolName = findGitHubCopilotToolName(lines, index, data.toolCallId)
      const detail = data.result?.content || ''
      if (!success) {
        return {
          ...base,
          status: 'error',
          message: toolName ? `${toolName} 执行失败` : '上一步执行失败',
          detail: summarizeCopilotText(detail, 200),
        }
      }
      return {
        ...base,
        status: 'review',
        message: toolName ? `${toolName} 完成,正在复查` : '复查刚才的结果',
        detail: summarizeCopilotText(detail, 200),
      }
    }
    case 'permission.requested': {
      const detail = data.permissionRequest?.intention || data.promptRequest?.intention || data.permissionRequest?.fullCommandText || ''
      return {
        ...base,
        status: 'blocked',
        message: '等你确认一下',
        detail: summarizeCopilotText(detail, 200),
      }
    }
    case 'permission.completed':
      return {
        ...base,
        status: 'thinking',
        message: '继续干活',
        detail: '',
      }
    case 'assistant.message': {
      const toolRequests = Array.isArray(data.toolRequests) ? data.toolRequests : []
      const detail = typeof data.content === 'string' ? data.content : ''
      if (toolRequests.length > 0) {
        return {
          ...base,
          status: 'thinking',
          message: `即将调用 ${toolRequests.length} 个工具`,
          detail: summarizeCopilotText(detail, 220),
        }
      }
      return {
        ...base,
        status: 'success',
        message: '我整理好了回复',
        detail: summarizeCopilotText(detail, 220),
      }
    }
    case 'assistant.turn_end':
      return {
        ...base,
        status: 'idle',
        message: 'GitHub Copilot 已就绪',
        detail: '',
      }
    default:
      return null
  }
}

function inferLatestGitHubCopilotActivity() {
  const sessionFile = findLatestGitHubCopilotSessionFile()
  if (!sessionFile) return null
  const lines = readTailLines(sessionFile, 160 * 1024)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index])
      const next = inferredStateFromGitHubCopilotEntry(entry, lines, index)
      if (!next) continue
      return {
        ...next,
        detail: [next.detail, `session: ${path.basename(path.dirname(sessionFile))}`].filter(Boolean).join('\n'),
        signature: [
          entry.timestamp,
          entry.type,
          entry?.data?.toolCallId,
          entry?.data?.toolName,
        ].filter(Boolean).join('|'),
      }
    } catch {
      // Ignore incomplete JSONL lines while Copilot is writing them.
    }
  }
  return null
}

function syncGitHubCopilotActivity() {
  if (!codexStatePath) return
  const next = inferLatestGitHubCopilotActivity()
  if (!next || next.signature === lastGitHubCopilotActivitySignature) return
  const nextTime = Date.parse(next.updatedAt)
  const currentTime = Date.parse(codexState?.updatedAt || '')
  if (Number.isFinite(nextTime) && Number.isFinite(currentTime) && nextTime <= currentTime) return
  lastGitHubCopilotActivitySignature = next.signature
  const { signature, ...state } = next
  writeCodexState(state)
}

function startGitHubCopilotActivitySync() {
  stopGitHubCopilotActivitySync()
  lastGitHubCopilotActivitySignature = ''
  syncGitHubCopilotActivity()
  githubCopilotActivityTimer = setInterval(syncGitHubCopilotActivity, 1200)
  if (typeof githubCopilotActivityTimer.unref === 'function') githubCopilotActivityTimer.unref()
}

function stopGitHubCopilotActivitySync() {
  if (!githubCopilotActivityTimer) return
  clearInterval(githubCopilotActivityTimer)
  githubCopilotActivityTimer = null
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
  if (codexBridgeStarted) return
  codexStatePath = getCodexStatePath()
  ensureCodexStateFile()
  codexState = readCodexState()
  fs.watchFile(codexStatePath, { interval: 750 }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs) return
    codexState = readCodexState()
    publishCodexState()
    refreshTrayMenu()
  })
  codexBridgeStarted = true
}

function stopCodexBridge() {
  if (!codexStatePath) return
  fs.unwatchFile(codexStatePath)
  codexBridgeStarted = false
}

function setMonitorSource(nextSource, options = {}) {
  const source = normalizeMonitorSource(nextSource)
  const persist = options.persist !== false

  stopCodexActivitySync()
  stopGitHubCopilotActivitySync()
  monitorSource = source

  if (persist && config) {
    config.monitorSource = source
    writeConfig()
  }

  if (source === MONITOR_SOURCES.NONE) {
    if (codexBridgeStarted || isCodexMode()) {
      startCodexBridge()
      writeCodexState(defaultCodexState('idle', '拉姆未监控任何代理'))
    }
    refreshTrayMenu()
    return
  }

  startCodexBridge()
  writeCodexState(defaultCodexState(
    'idle',
    source === MONITOR_SOURCES.CODEX ? 'Codex 已就绪' : 'GitHub Copilot 已就绪',
  ))
  if (source === MONITOR_SOURCES.CODEX) startCodexActivitySync()
  if (source === MONITOR_SOURCES.GITHUB_COPILOT) startGitHubCopilotActivitySync()
  refreshTrayMenu()
}

function rectContains(area, x, y) {
  return x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height
}

function distanceToRect(area, x, y) {
  const dx = Math.max(area.x - x, 0, x - (area.x + area.width - 1))
  const dy = Math.max(area.y - y, 0, y - (area.y + area.height - 1))
  return dx * dx + dy * dy
}

// Per-display clamp: keep the *visible pet bbox* within the workArea of the
// display that contains the pet's center. If no display contains the center
// (e.g. the window drifted into a "void" region between monitors after a
// display layout change), fall back to the nearest display.
//
// Note: the returned window position can be slightly outside the workArea —
// only the pet's visible portion is constrained, the transparent margins of
// the Electron window are allowed to overhang.
function clampWindowPosition(x, y) {
  const displays = screen.getAllDisplays()
  if (!displays.length) return clampToArea(screen.getPrimaryDisplay().workArea, x, y)
  const petCenterX = x + PET_INSET.left + PET_BODY.width / 2
  const petCenterY = y + PET_INSET.top + PET_BODY.height / 2
  let target = displays.find((d) => rectContains(d.workArea, petCenterX, petCenterY))
  if (!target) {
    let bestDistance = Infinity
    for (const d of displays) {
      const dist = distanceToRect(d.workArea, petCenterX, petCenterY)
      if (dist < bestDistance) {
        bestDistance = dist
        target = d
      }
    }
  }
  return clampToArea(target.workArea, x, y)
}

function clampToArea(area, x, y) {
  const minX = area.x - PET_INSET.left
  const maxX = area.x + area.width - PET_INSET.left - PET_BODY.width
  const minY = area.y - PET_INSET.top
  const maxY = area.y + area.height - PET_INSET.top - PET_BODY.height
  return {
    x: Math.max(minX, Math.min(maxX, Math.round(x))),
    y: Math.max(minY, Math.min(maxY, Math.round(y))),
  }
}

function applyWindowPosition(x, y) {
  if (!petWindow) return null
  const bounds = petWindow.getBounds()
  const next = clampWindowPosition(x, y)
  petWindow.setBounds({ x: next.x, y: next.y, width: bounds.width, height: bounds.height })
  return { applied: next, previous: bounds }
}

function persistWindowPosition() {
  if (!petWindow || !config) return
  const bounds = petWindow.getBounds()
  config.position = clampWindowPosition(bounds.x, bounds.y)
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
  const next = clampWindowPosition(bounds.x, bounds.y)
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

function getCareStatsPath() {
  return path.join(app.getPath('userData'), 'ram-care-stats.json')
}

function readCareStats() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getCareStatsPath(), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const stats = parsed.stats || parsed
    const out = {
      hunger: Number.isFinite(stats?.hunger) ? stats.hunger : 82,
      cleanliness: Number.isFinite(stats?.cleanliness) ? stats.cleanliness : 88,
      mood: Number.isFinite(stats?.mood) ? stats.mood : 86,
      health: Number.isFinite(stats?.health) ? stats.health : 92,
    }
    const savedAt = Number.isFinite(parsed?.savedAt) ? parsed.savedAt : Date.now()
    return { stats: out, savedAt }
  } catch {
    return null
  }
}

function writeCareStats(payload) {
  try {
    fs.mkdirSync(path.dirname(getCareStatsPath()), { recursive: true })
    fs.writeFileSync(getCareStatsPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch {
    // 持久化失败不影响游戏，下一次 tick 会再尝试
  }
}

function buildStatsSubmenu() {
  return Object.entries(CARE_STAT_LABELS).map(([key, label]) => ({
    label: `${label}：${Math.round(currentCareStats[key] ?? 0)}`,
    enabled: false,
  }))
}

function buildCareActionMenu() {
  const actions = [
    { key: 'hunger', label: '喂食', kind: 'feed' },
    { key: 'cleanliness', label: '洗澡', kind: 'clean' },
    { key: 'health', label: '吃药', kind: 'medicate' },
  ]
  const items = []
  for (const action of actions) {
    const value = Math.round(currentCareStats[action.key] ?? 100)
    if (value >= CARE_MENU_THRESHOLD) continue
    items.push({
      label: `${action.label}（${CARE_STAT_LABELS[action.key]} ${value}）`,
      click: () => sendVisiblePetAction({ type: 'care', action: action.kind }),
    })
  }
  return items
}

function buildMenuTemplate() {
  const careActions = buildCareActionMenu()
  const template = [
    ...((monitorSource === MONITOR_SOURCES.CODEX || isCodexMode()) ? [{ label: '打开 Codex', click: openCodexApp }, { type: 'separator' }] : []),
    {
      label: '监控模式',
      submenu: [
        {
          label: '不监控',
          type: 'radio',
          checked: monitorSource === MONITOR_SOURCES.NONE,
          click: () => setMonitorSource(MONITOR_SOURCES.NONE),
        },
        {
          label: '监控 Codex',
          type: 'radio',
          checked: monitorSource === MONITOR_SOURCES.CODEX,
          click: () => setMonitorSource(MONITOR_SOURCES.CODEX),
        },
        {
          label: '监控 GitHub Copilot',
          type: 'radio',
          checked: monitorSource === MONITOR_SOURCES.GITHUB_COPILOT,
          click: () => setMonitorSource(MONITOR_SOURCES.GITHUB_COPILOT),
        },
      ],
    },
    { type: 'separator' },
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
      label: '查看状态',
      click: () => sendVisiblePetAction({ type: 'show-stats' }),
    },
    {
      label: '今日状态',
      submenu: buildStatsSubmenu(),
    },
    { type: 'separator' },
    {
      label: '睡觉',
      click: () => sendVisiblePetAction({ type: 'mood', mood: 'sleep' }),
    },
    ...(careActions.length ? [{ type: 'separator' }, ...careActions] : []),
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
  monitorSource = normalizeMonitorSource(config.monitorSource)
  createPetWindow()
  createTray()

  if (isCodexMode()) {
    startCodexBridge()
    if (process.env.CODEX_PET_AUTO_SYNC !== '0') {
      monitorSource = MONITOR_SOURCES.CODEX
      startCodexActivitySync()
    } else {
      monitorSource = MONITOR_SOURCES.NONE
    }
    refreshTrayMenu()
  } else if (monitorSource !== MONITOR_SOURCES.NONE) {
    setMonitorSource(monitorSource, { persist: false })
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
  stopGitHubCopilotActivitySync()
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

ipcMain.handle('pet-window:load-care-stats', () => {
  return readCareStats()
})

ipcMain.handle('pet-window:save-care-stats', (_event, payload) => {
  if (!payload || typeof payload !== 'object' || !payload.stats) return
  writeCareStats(payload)
})

ipcMain.handle('pet-window:report-care-stats', (_event, stats) => {
  if (!stats || typeof stats !== 'object') return
  currentCareStats = {
    hunger: Number.isFinite(stats.hunger) ? stats.hunger : currentCareStats.hunger,
    cleanliness: Number.isFinite(stats.cleanliness) ? stats.cleanliness : currentCareStats.cleanliness,
    mood: Number.isFinite(stats.mood) ? stats.mood : currentCareStats.mood,
    health: Number.isFinite(stats.health) ? stats.health : currentCareStats.health,
  }
  refreshTrayMenu()
})
