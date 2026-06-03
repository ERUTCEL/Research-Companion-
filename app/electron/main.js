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
  const uvicorn = uvicornCandidates.find(candidate => fs.existsSync(candidate))
  const python = pythonCandidates.find(candidate => fs.existsSync(candidate))

  if (!uvicorn && !python) {
    console.warn('[backend] virtualenv not found; run ./run.sh or .\\run.ps1 first')
    return
  }

  // .env is loaded by python-dotenv inside FastAPI — no need to parse it here
  const command = uvicorn || python
  const args = uvicorn
    ? ['api.main:app', '--port', '8001', '--host', '127.0.0.1']
    : ['-m', 'uvicorn', 'api.main:app', '--port', '8001', '--host', '127.0.0.1']

  backendProcess = spawn(command, args, {
    cwd: backendDir,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProcess.on('exit', code => console.log('[backend] exited', code))
}

function stopBackend() {
  if (backendProcess) { backendProcess.kill(); backendProcess = null }
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
