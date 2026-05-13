import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stateDir = path.join(root, '.codex-pet')
const statePath = process.env.CODEX_PET_STATE
  ? path.resolve(process.env.CODEX_PET_STATE)
  : path.join(stateDir, 'status.json')
const pidPath = path.join(stateDir, 'pet.pid')

const statuses = new Set(['idle', 'thinking', 'reading', 'planning', 'running', 'review', 'success', 'blocked', 'error'])

const defaultMessages = {
  idle: 'Codex 已就绪',
  thinking: '我在想怎么处理。',
  reading: '我在看文件。',
  planning: '我在整理步骤。',
  running: '我正在执行命令。',
  review: '我在复查结果。',
  success: '完成啦。',
  blocked: '需要你确认一下。',
  error: '这里出了点问题。',
}

function usage(exitCode = 0) {
  console.log(`Codex RamPet

Usage:
  node scripts/codex-pet.mjs start
  node scripts/codex-pet.mjs status
  node scripts/codex-pet.mjs set <idle|thinking|reading|planning|running|review|success|blocked|error> [message] [--detail preview]
  node scripts/codex-pet.mjs <idle|thinking|reading|planning|running|review|success|blocked|error> [message] [--detail preview]
  node scripts/codex-pet.mjs stop
  node scripts/codex-pet.mjs path
`)
  process.exit(exitCode)
}

function ensureStateDir() {
  mkdirSync(path.dirname(statePath), { recursive: true })
  mkdirSync(stateDir, { recursive: true })
}

function splitMessageAndDetail(parts) {
  const detailIndex = parts.findIndex((part) => part === '--detail' || part === '--preview')
  if (detailIndex === -1) return { message: parts.join(' '), detail: '' }
  return {
    message: parts.slice(0, detailIndex).join(' '),
    detail: parts.slice(detailIndex + 1).join(' ').replaceAll('\\n', '\n'),
  }
}

function writeStatus(status, message = defaultMessages[status], detail = '') {
  if (!statuses.has(status)) usage(1)
  ensureStateDir()
  const payload = {
    status,
    message,
    detail,
    updatedAt: new Date().toISOString(),
    source: 'codex-pet-cli',
  }
  writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`${status}: ${message}`)
  console.log(statePath)
}

function printStatus() {
  if (!existsSync(statePath)) {
    console.log('No Codex RamPet status file yet.')
    console.log(statePath)
    return
  }
  console.log(readFileSync(statePath, 'utf8').trim())
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function electronBinary() {
  if (process.platform === 'win32') {
    return path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
  }
  return path.join(root, 'node_modules', '.bin', 'electron')
}

function readSavedPid() {
  if (!existsSync(pidPath)) return null
  const pid = Number(readFileSync(pidPath, 'utf8').trim())
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

function ensureBuild() {
  if (existsSync(path.join(root, 'dist', 'index.html'))) return
  const build = spawnSync(npmCommand(), ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

function startPet() {
  ensureStateDir()
  if (!existsSync(statePath)) writeStatus('idle')
  const existingPid = readSavedPid()
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Codex RamPet already running: ${existingPid}`)
    console.log(`State: ${statePath}`)
    return
  }
  ensureBuild()

  const electron = electronBinary()
  if (!existsSync(electron)) {
    console.error('Electron is not installed. Run npm.cmd ci first.')
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
    },
  })
  child.unref()
  writeFileSync(pidPath, `${child.pid}\n`, 'utf8')
  console.log(`Codex RamPet started: ${child.pid}`)
  console.log(`State: ${statePath}`)
}

function stopPet() {
  const pid = readSavedPid()
  if (!pid) {
    console.log('No Codex RamPet pid file found.')
  } else {
    try {
      process.kill(pid)
      console.log(`Stopped Codex RamPet: ${pid}`)
    } catch (error) {
      console.log(`Could not stop Codex RamPet ${pid}: ${error.message}`)
    }
  }

  if (process.platform === 'win32') {
    const escapedRoot = root.replaceAll("'", "''")
    spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${escapedRoot}\\*' } | Stop-Process -Force`,
    ], { stdio: 'ignore' })
  }

  try {
    if (existsSync(pidPath)) unlinkSync(pidPath)
  } catch {
    // A stale pid file is harmless; start will replace it.
  }
}

const [command = 'help', maybeStatus, ...messageParts] = process.argv.slice(2)

if (command === 'help' || command === '--help' || command === '-h') usage()
if (command === 'path') {
  console.log(statePath)
  process.exit(0)
}
if (command === 'status') {
  printStatus()
  process.exit(0)
}
if (command === 'start') {
  startPet()
  process.exit(0)
}
if (command === 'stop') {
  stopPet()
  process.exit(0)
}
if (command === 'set') {
  const parsed = splitMessageAndDetail(messageParts)
  writeStatus(maybeStatus, parsed.message || defaultMessages[maybeStatus], parsed.detail)
  process.exit(0)
}
if (statuses.has(command)) {
  const parsed = splitMessageAndDetail([maybeStatus, ...messageParts].filter(Boolean))
  writeStatus(command, parsed.message || defaultMessages[command], parsed.detail)
  process.exit(0)
}

usage(1)
