#!/usr/bin/env node
// GitHub Copilot CLI -> RamPet bridge.
//
// Watches the active GitHub Copilot CLI session's events.jsonl and translates
// each event into a Codex-compatible status.json that RamPet already knows how
// to render. Pet UI, mood mapping, and ambient behavior are all reused from
// the existing Codex pet mode — this script just supplies the status feed.

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync, watch, openSync, readSync, closeSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { readdir, stat } from 'node:fs/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stateDir = path.join(root, '.codex-pet')
const statePath = process.env.GC_PET_STATE
  ? path.resolve(process.env.GC_PET_STATE)
  : path.join(stateDir, 'status.json')
const pidPath = path.join(stateDir, 'gc-pet.pid')
const watcherPidPath = path.join(stateDir, 'gc-pet-watcher.pid')

const copilotHome = process.env.COPILOT_HOME
  ? path.resolve(process.env.COPILOT_HOME)
  : path.join(os.homedir(), '.copilot')
const sessionStateDir = path.join(copilotHome, 'session-state')

const POLL_INTERVAL_MS = 250
const SESSION_RESCAN_MS = 5000

// --- helpers ----------------------------------------------------------------

function usage(exitCode = 0) {
  console.log(`GitHub Copilot CLI RamPet

Usage:
  node scripts/gc-pet.mjs start            Start watcher + Electron pet
  node scripts/gc-pet.mjs watch            Only run the watcher (pet already up)
  node scripts/gc-pet.mjs stop             Stop watcher + pet
  node scripts/gc-pet.mjs status           Print current status.json
  node scripts/gc-pet.mjs sessions         List discovered GC CLI sessions
  node scripts/gc-pet.mjs path             Print the status file path

Environment:
  COPILOT_HOME      Override the path to ~/.copilot (default: $HOME/.copilot)
  GC_PET_STATE      Override status.json output path
  GC_PET_SESSION    Force a specific session id (otherwise pick newest active)
`)
  process.exit(exitCode)
}

function ensureStateDir() {
  mkdirSync(path.dirname(statePath), { recursive: true })
  mkdirSync(stateDir, { recursive: true })
}

function writeStatus(payload) {
  ensureStateDir()
  const json = JSON.stringify({ ...payload, source: 'gc-pet-cli' }, null, 2)
  writeFileSync(statePath, `${json}\n`, 'utf8')
}

function readSavedPid(file) {
  if (!existsSync(file)) return null
  const pid = Number(readFileSync(file, 'utf8').trim())
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// --- session discovery ------------------------------------------------------

async function listSessions() {
  if (!existsSync(sessionStateDir)) return []
  const entries = await readdir(sessionStateDir, { withFileTypes: true })
  const sessions = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(sessionStateDir, entry.name)
    const events = path.join(dir, 'events.jsonl')
    if (!existsSync(events)) continue
    let mtime = 0
    let active = false
    try {
      mtime = (await stat(events)).mtimeMs
    } catch {
      continue
    }
    // An `inuse.<pid>.lock` file marks a live CLI process holding the session.
    try {
      const locks = (await readdir(dir)).filter((n) => /^inuse\.\d+\.lock$/.test(n))
      for (const lock of locks) {
        const pid = Number(lock.replace(/^inuse\.(\d+)\.lock$/, '$1'))
        if (Number.isInteger(pid) && isProcessRunning(pid)) {
          active = true
          break
        }
      }
    } catch {
      // ignore — dir may be missing files mid-scan
    }
    sessions.push({ id: entry.name, dir, events, mtime, active })
  }
  return sessions.sort((a, b) => b.mtime - a.mtime)
}

async function pickSession(preferredId) {
  const sessions = await listSessions()
  if (preferredId) {
    return sessions.find((s) => s.id === preferredId) || null
  }
  // Mirror codex-pet behavior: always tail the most recently modified session,
  // regardless of whether its owning CLI process is still alive.
  return sessions[0] || null
}

// --- event -> status mapping ------------------------------------------------

const READ_TOOLS = new Set([
  'view', 'grep', 'glob', 'read', 'web_fetch', 'web_search',
  'github-mcp-server-get_file_contents', 'github-mcp-server-search_code',
  'github-mcp-server-get_copilot_space', 'github-mcp-server-list_copilot_spaces',
  'github-mcp-server-search_users',
])
const WRITE_TOOLS = new Set(['edit', 'create', 'str_replace_editor'])
const SHELL_TOOLS = new Set(['powershell', 'bash', 'shell', 'sh'])
const DELEGATION_TOOLS = new Set(['task', 'explore', 'research', 'general-purpose', 'code-review'])

function classifyTool(name) {
  if (!name) return 'running'
  const lower = name.toLowerCase()
  if (SHELL_TOOLS.has(lower)) return 'running'
  if (WRITE_TOOLS.has(lower)) return 'planning'
  if (READ_TOOLS.has(lower) || lower.startsWith('view') || lower.startsWith('grep')) return 'reading'
  if (DELEGATION_TOOLS.has(lower)) return 'thinking'
  return 'running'
}

function summarize(text, max = 160) {
  if (!text) return ''
  const trimmed = String(text).replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function mapEvent(event, ctx) {
  if (!event || typeof event !== 'object') return null
  const type = event.type
  const data = event.data || {}
  const now = event.timestamp || new Date().toISOString()

  switch (type) {
    case 'user.message':
      return {
        status: 'thinking',
        message: '收到你的消息',
        detail: summarize(data.content, 200),
        updatedAt: now,
      }
    case 'assistant.turn_start':
      return { status: 'thinking', message: '收到新任务，进入状态', updatedAt: now }
    case 'tool.execution_start': {
      const name = data.toolName || ''
      const status = classifyTool(name)
      const desc = data.arguments?.description || data.arguments?.command || ''
      ctx.activeTools.set(data.toolCallId, name)
      const labels = {
        running: `执行 ${name || '命令'}`,
        planning: `修改文件 (${name})`,
        reading: `查看 ${name || '资料'}`,
        thinking: `派出子代理 (${name})`,
      }
      return {
        status,
        message: labels[status] || `调用 ${name}`,
        detail: summarize(desc, 160),
        updatedAt: now,
      }
    }
    case 'tool.execution_complete': {
      const success = data.success !== false
      const name = ctx.activeTools.get(data.toolCallId) || ''
      ctx.activeTools.delete(data.toolCallId)
      const content = data.result?.content || ''
      if (!success) {
        return {
          status: 'error',
          message: name ? `${name} 执行失败` : '上一步执行失败',
          detail: summarize(content, 200),
          updatedAt: now,
        }
      }
      return {
        status: 'review',
        message: name ? `${name} 完成,正在复查` : '复查刚才的结果',
        detail: summarize(content, 200),
        updatedAt: now,
      }
    }
    case 'permission.requested': {
      const intent = data.permissionRequest?.intention || data.promptRequest?.intention || ''
      const cmd = data.permissionRequest?.fullCommandText || ''
      return {
        status: 'blocked',
        message: '等你确认一下',
        detail: summarize(intent || cmd, 200),
        updatedAt: now,
      }
    }
    case 'permission.completed':
      return { status: 'thinking', message: '继续干活', updatedAt: now }
    case 'assistant.message': {
      const toolRequests = Array.isArray(data.toolRequests) ? data.toolRequests : []
      const content = data.content || ''
      if (toolRequests.length > 0) {
        // Mid-turn message that also dispatches tool calls — treat as planning preview.
        return {
          status: 'thinking',
          message: `即将调用 ${toolRequests.length} 个工具`,
          detail: summarize(content, 220),
          updatedAt: now,
        }
      }
      return {
        status: 'success',
        message: '我整理好了回复',
        detail: summarize(content, 220),
        updatedAt: now,
      }
    }
    case 'assistant.turn_end':
      return { status: 'idle', message: 'Copilot 已就绪', updatedAt: now }
    default:
      return null
  }
}

// --- jsonl tailer -----------------------------------------------------------

class Tailer {
  constructor(filePath, onLine) {
    this.filePath = filePath
    this.onLine = onLine
    this.offset = 0
    this.buffer = ''
    this.timer = null
    this.watcher = null
    this.busy = false
  }

  start() {
    try {
      this.offset = statSync(this.filePath).size
    } catch {
      this.offset = 0
    }
    // Pump now and on file changes; fall back to polling for safety on Windows.
    this.timer = setInterval(() => this.pump(), POLL_INTERVAL_MS)
    try {
      this.watcher = watch(this.filePath, () => this.pump())
    } catch {
      // file may vanish briefly during session rotation; poll loop will retry
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    if (this.watcher) this.watcher.close()
    this.timer = null
    this.watcher = null
  }

  pump() {
    if (this.busy) return
    this.busy = true
    let size = 0
    try {
      size = statSync(this.filePath).size
    } catch {
      this.busy = false
      return
    }
    if (size < this.offset) {
      // file was rotated/truncated; restart from beginning
      this.offset = 0
      this.buffer = ''
    }
    if (size === this.offset) {
      this.busy = false
      return
    }
    let fd = -1
    try {
      fd = openSync(this.filePath, 'r')
      const length = size - this.offset
      const buf = Buffer.allocUnsafe(length)
      const bytesRead = readSync(fd, buf, 0, length, this.offset)
      this.offset += bytesRead
      this.buffer += buf.subarray(0, bytesRead).toString('utf8')
      let nl
      while ((nl = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, nl).trim()
        this.buffer = this.buffer.slice(nl + 1)
        if (line) {
          try { this.onLine(JSON.parse(line)) } catch { /* skip malformed json */ }
        }
      }
    } catch {
      // transient read errors are fine; next tick retries
    } finally {
      if (fd !== -1) { try { closeSync(fd) } catch {} }
      this.busy = false
    }
  }
}

// --- watcher loop -----------------------------------------------------------

async function runWatcher() {
  ensureStateDir()
  writeFileSync(watcherPidPath, `${process.pid}\n`, 'utf8')
  console.log(`gc-pet watcher started (pid ${process.pid})`)
  console.log(`Status file: ${statePath}`)
  console.log(`Copilot home: ${copilotHome}`)

  let current = null
  let tailer = null
  const ctx = { activeTools: new Map() }

  async function rescan() {
    const next = await pickSession(process.env.GC_PET_SESSION)
    if (!next) {
      if (current) {
        console.log('No active session; pet returns to idle.')
        writeStatus({ status: 'idle', message: '等待 Copilot CLI 启动', updatedAt: new Date().toISOString() })
        if (tailer) { tailer.stop(); tailer = null }
        current = null
      }
      return
    }
    if (current && current.id === next.id) return
    if (tailer) tailer.stop()
    current = next
    console.log(`Tailing session ${next.id} (${next.active ? 'active' : 'stale'})`)
    writeStatus({ status: 'idle', message: `连接到 session ${next.id.slice(0, 8)}`, updatedAt: new Date().toISOString() })
    tailer = new Tailer(next.events, (event) => {
      const mapped = mapEvent(event, ctx)
      if (mapped) writeStatus(mapped)
    })
    tailer.start()
  }

  await rescan()
  const rescanTimer = setInterval(rescan, SESSION_RESCAN_MS)

  function shutdown() {
    clearInterval(rescanTimer)
    if (tailer) tailer.stop()
    try { unlinkSync(watcherPidPath) } catch {}
    writeStatus({ status: 'idle', message: 'gc-pet 已停止', updatedAt: new Date().toISOString() })
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// --- electron pet boot/stop (mirrors codex-pet.mjs) -------------------------

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function electronBinary() {
  if (process.platform === 'win32') {
    return path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
  }
  return path.join(root, 'node_modules', '.bin', 'electron')
}

function ensureBuild() {
  if (existsSync(path.join(root, 'dist', 'index.html'))) return
  const build = spawnSync(npmCommand(), ['run', 'build'], { cwd: root, stdio: 'inherit', env: process.env })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

function startPet() {
  ensureStateDir()
  if (!existsSync(statePath)) writeStatus({ status: 'idle', message: 'gc-pet 启动中', updatedAt: new Date().toISOString() })
  const existingPid = readSavedPid(pidPath)
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`gc-pet (Electron) already running: ${existingPid}`)
  } else {
    ensureBuild()
    const electron = electronBinary()
    if (!existsSync(electron)) {
      console.error('Electron not installed. Run npm.cmd ci first.')
      process.exit(1)
    }
    const child = spawn(electron, ['electron/main.cjs'], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PET_LOAD_DIST: '1',
        CODEX_PET_MODE: '1',
        CODEX_PET_STATE: statePath,
        CODEX_PET_AUTO_SYNC: '0', // disable RamPet's built-in Codex auto-sync; we drive status ourselves
      },
    })
    child.unref()
    writeFileSync(pidPath, `${child.pid}\n`, 'utf8')
    console.log(`gc-pet (Electron) started: ${child.pid}`)
  }

  // Spawn watcher as a detached child so the user gets their shell back.
  const watcherPid = readSavedPid(watcherPidPath)
  if (watcherPid && isProcessRunning(watcherPid)) {
    console.log(`gc-pet watcher already running: ${watcherPid}`)
    return
  }
  const watcher = spawn(process.execPath, [fileURLToPath(import.meta.url), 'watch'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  watcher.unref()
  console.log(`gc-pet watcher spawned: ${watcher.pid}`)
}

function stopPet() {
  for (const [label, file] of [['watcher', watcherPidPath], ['Electron', pidPath]]) {
    const pid = readSavedPid(file)
    if (pid && isProcessRunning(pid)) {
      try { process.kill(pid); console.log(`Stopped ${label} (${pid})`) }
      catch (err) { console.log(`Could not stop ${label} ${pid}: ${err.message}`) }
    }
    try { if (existsSync(file)) unlinkSync(file) } catch {}
  }
  if (process.platform === 'win32') {
    const escapedRoot = root.replaceAll("'", "''")
    spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${escapedRoot}\\*' } | Stop-Process -Force`,
    ], { stdio: 'ignore' })
  }
}

// --- cli dispatch -----------------------------------------------------------

const [command = 'help'] = process.argv.slice(2)

switch (command) {
  case 'help':
  case '--help':
  case '-h':
    usage(); break
  case 'path':
    console.log(statePath); break
  case 'status':
    if (!existsSync(statePath)) console.log('No status file yet.')
    else console.log(readFileSync(statePath, 'utf8').trim())
    break
  case 'sessions': {
    const sessions = await listSessions()
    if (!sessions.length) console.log('No GC CLI sessions found under ' + sessionStateDir)
    for (const s of sessions) {
      console.log(`${s.active ? '*' : ' '} ${s.id}  (mtime ${new Date(s.mtime).toISOString()})`)
    }
    break
  }
  case 'watch':
    await runWatcher(); break
  case 'start':
    startPet(); break
  case 'stop':
    stopPet(); break
  default:
    usage(1)
}
