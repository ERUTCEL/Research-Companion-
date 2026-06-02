import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'

let mainWindow
let backendProcess

// ── Backend (FastAPI) ────────────────────────────────────────────────────────

function startBackend() {
  const repoRoot = path.resolve(__dirname, '../../')
  const backendDir = path.join(repoRoot, 'research_companion')
  const venvPython = path.join(backendDir, '.venv', 'bin', 'python3')
  const uvicorn = path.join(backendDir, '.venv', 'bin', 'uvicorn')

  const python = fs.existsSync(venvPython) ? venvPython : 'python3'
  const cmd = fs.existsSync(uvicorn) ? uvicorn : null

  if (!cmd) {
    console.warn('uvicorn not found — skipping backend start')
    return
  }

  backendProcess = spawn(cmd, ['api.main:app', '--port', '8001', '--host', '127.0.0.1'], {
    cwd: backendDir,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProcess.on('exit', code => console.log('[backend] exited', code))
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', stopBackend)

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'PDF 폴더 선택',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-api-key', () => {
  return process.env.ANTHROPIC_API_KEY || ''
})

ipcMain.handle('set-api-key', (_, key) => {
  process.env.ANTHROPIC_API_KEY = key
  // .env 파일에도 기록
  const envPath = path.join(__dirname, '../../research_companion/.env')
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const updated = existing.replace(/^ANTHROPIC_API_KEY=.*/m, '')
    .trim()
    .concat('\nANTHROPIC_API_KEY=' + key + '\n')
  fs.writeFileSync(envPath, updated)
  return true
})
