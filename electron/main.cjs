const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !process.env.PET_LOAD_DIST && !app.isPackaged
const windowSize = 220

let petWindow = null
let tray = null
let config = null
let isQuitting = false

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

function clampWindowPosition(x, y, width = windowSize, height = windowSize) {
  const display = screen.getDisplayNearestPoint({ x, y })
  const bounds = display.workArea
  return {
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, Math.round(x))),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, Math.round(y))),
  }
}

function persistWindowPosition() {
  if (!petWindow || !config) return
  const bounds = petWindow.getBounds()
  config.position = clampWindowPosition(bounds.x, bounds.y, bounds.width, bounds.height)
  writeConfig()
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

function buildMenuTemplate() {
  return [
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
      label: '互动',
      submenu: [
        { label: '摸摸', click: () => sendVisiblePetAction({ type: 'mood', mood: 'affection' }) },
        { label: '玩耍', click: () => sendVisiblePetAction({ type: 'mood', mood: 'play' }) },
        { label: '学习', click: () => sendVisiblePetAction({ type: 'mood', mood: 'study' }) },
        { label: '工作', click: () => sendVisiblePetAction({ type: 'mood', mood: 'work' }) },
        { label: '睡觉', click: () => sendVisiblePetAction({ type: 'mood', mood: 'sleep' }) },
        { label: '走路（测试）', click: () => sendVisiblePetAction({ type: 'mood', mood: 'walk' }) },
      ],
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

  petWindow.on('moved', persistWindowPosition)
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
  petWindow.once('ready-to-show', showPetWindow)
}

app.whenReady().then(() => {
  config = readConfig()
  createPetWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow()
    showPetWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  persistWindowPosition()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('pet-window:move-by', (_event, delta) => {
  if (!petWindow) return { x: 0, y: 0 }
  const bounds = petWindow.getBounds()
  const next = clampWindowPosition(bounds.x + delta.x, bounds.y + delta.y, bounds.width, bounds.height)
  petWindow.setPosition(next.x, next.y, false)
  config.visible = true
  persistWindowPosition()
  return { x: next.x - bounds.x, y: next.y - bounds.y }
})

ipcMain.handle('pet-window:show-context-menu', () => {
  showPetContextMenu()
})
