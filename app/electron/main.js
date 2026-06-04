import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow
let backendProcess
let backendStatus = { state: 'idle', detail: 'Backend has not started.' }

// ── Settings (encrypted via safeStorage) ────────────────────────────────────

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'))
    const out = {}
    for (const [k, v] of Object.entries(raw)) {
      try { out[k] = safeStorage.decryptString(Buffer.from(v, 'base64')) }
      catch { out[k] = '' }
    }
    return out
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  const encrypted = {}
  for (const [k, v] of Object.entries(settings)) {
    if (v) encrypted[k] = safeStorage.encryptString(v).toString('base64')
  }
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(encrypted))
}

// ── Backend (FastAPI) ────────────────────────────────────────────────────────

function startBackend() {
  let command, args, cwd
  backendStatus = { state: 'starting', detail: 'Starting CLIO backend...' }

  if (isDev) {
    // Dev: use the venv uvicorn directly
    const repoRoot = path.resolve(__dirname, '../../')
    const backendDir = path.join(repoRoot, 'research_companion')
    const venvDir = path.join(backendDir, '.venv')
    const uvicornCandidates = [
      path.join(venvDir, 'bin', 'uvicorn'),
      path.join(venvDir, 'Scripts', 'uvicorn.exe'),
      path.join(venvDir, 'Scripts', 'uvicorn'),
    ]
    const pythonCandidates = [
      path.join(venvDir, 'bin', 'python'),
      path.join(venvDir, 'Scripts', 'python.exe'),
    ]
    const uvicorn = uvicornCandidates.find(c => fs.existsSync(c))
    const python = pythonCandidates.find(c => fs.existsSync(c))
    if (!uvicorn && !python) {
      console.warn('[backend] virtualenv not found')
      backendStatus = { state: 'failed', detail: 'Development virtualenv was not found.' }
      return
    }
    command = uvicorn || python
    args = uvicorn
      ? ['api.main:app', '--port', '8001', '--host', '127.0.0.1']
      : ['-m', 'uvicorn', 'api.main:app', '--port', '8001', '--host', '127.0.0.1']
    cwd = backendDir
  } else {
    // Production: use the bundled binary in app's resources
    const binName = process.platform === 'win32' ? 'clio-backend.exe' : 'clio-backend'
    command = path.join(process.resourcesPath, 'backend', binName)
    if (!fs.existsSync(command)) {
      console.error('[backend] bundled binary not found:', command)
      backendStatus = { state: 'failed', detail: `Bundled backend not found: ${command}` }
      return
    }
    args = []
    cwd = app.getPath('userData')
  }

  const settings = loadSettings()
  backendProcess = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      CLIO_PORT: '8001',
      ...(settings.CLIO_PROVIDER     && { CLIO_PROVIDER:     settings.CLIO_PROVIDER }),
      ...(settings.CLIO_MODEL        && { CLIO_MODEL:        settings.CLIO_MODEL }),
      ...(settings.ANTHROPIC_API_KEY && { ANTHROPIC_API_KEY: settings.ANTHROPIC_API_KEY }),
      ...(settings.OPENAI_API_KEY    && { OPENAI_API_KEY:    settings.OPENAI_API_KEY }),
      ...(settings.OPENAI_BASE_URL   && { OPENAI_BASE_URL:   settings.OPENAI_BASE_URL }),
      ...(settings.NOTION_TOKEN      && { NOTION_TOKEN:      settings.NOTION_TOKEN }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', d => {
    const detail = d.toString().trim()
    if (detail) backendStatus = { state: 'running', detail }
    console.log('[backend]', detail)
  })
  backendProcess.stderr.on('data', d => {
    const detail = d.toString().trim()
    if (detail) backendStatus = { state: 'error', detail }
    console.error('[backend]', detail)
  })
  backendProcess.on('spawn', () => {
    backendStatus = { state: 'running', detail: `Backend process started: ${command}` }
  })
  backendProcess.on('error', err => {
    backendStatus = { state: 'failed', detail: err.message }
    console.error('[backend] failed to start', err)
  })
  backendProcess.on('exit', code => {
    backendStatus = { state: code === 0 ? 'stopped' : 'failed', detail: `Backend exited with code ${code}` }
    console.log('[backend] exited', code)
  })
}

function stopBackend() {
  if (backendProcess) { backendProcess.kill(); backendProcess = null }
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1024,
    minHeight: 600,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : { frame: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => { stopBackend(); if (process.platform !== 'darwin') app.quit() })
app.on('quit', stopBackend)

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'PDF 폴더 선택',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false
  await shell.openExternal(url)
  return true
})

ipcMain.handle('get-settings', () => {
  const s = loadSettings()
  return {
    CLIO_PROVIDER:     s.CLIO_PROVIDER     || 'anthropic',
    CLIO_MODEL:        s.CLIO_MODEL        || '',
    ANTHROPIC_API_KEY: s.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY:    s.OPENAI_API_KEY    || '',
    OPENAI_BASE_URL:   s.OPENAI_BASE_URL   || '',
    NOTION_TOKEN:      s.NOTION_TOKEN      || '',
  }
})

ipcMain.handle('save-settings', async (_event, settings) => {
  saveSettings(settings)
  // restart backend with new keys
  stopBackend()
  await new Promise(r => setTimeout(r, 500))
  startBackend()
  return { ok: true }
})

ipcMain.handle('get-backend-status', () => backendStatus)
