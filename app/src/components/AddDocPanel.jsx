import { useState, useRef, useEffect } from 'react'

function getElectronApi() {
  return typeof window !== 'undefined' ? window.api : null
}

function getFilePath(file) {
  const api = getElectronApi()
  return api?.getPathForFile?.(file) || file.path || ''
}

function getParentFolder(filePath) {
  const separator = filePath.includes('\\') ? '\\' : '/'
  return filePath.substring(0, filePath.lastIndexOf(separator))
}

export default function AddDocPanel({ backend, onDone, compact = false }) {
  const [source, setSource] = useState(null)
  const [folderPath, setFolderPath] = useState('')
  const [notionToken, setNotionToken] = useState('')
  const [notionDbId, setNotionDbId] = useState('')
  const [dragging, setDragging] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [error, setError] = useState('')
  const dropRef = useRef(null)

  useEffect(() => {
    if (!jobId || jobStatus === 'done' || jobStatus === 'failed') return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${backend}/ingest/${jobId}`)
        const data = await res.json()
        setProgress({ processed: data.processed, total: data.total })
        if (data.status === 'done' || data.status === 'failed') {
          setJobStatus(data.status)
          if (data.error) setError(data.error)
          clearInterval(id)
        }
      } catch { clearInterval(id) }
    }, 1500)
    return () => clearInterval(id)
  }, [jobId, jobStatus, backend])

  function onDragOver(e) { e.preventDefault(); e.stopPropagation(); setDragging(true) }
  function onDragLeave(e) { e.preventDefault(); if (!dropRef.current?.contains(e.relatedTarget)) setDragging(false) }
  function onDrop(e) {
    e.preventDefault(); e.stopPropagation(); setDragging(false); setError('')
    const files = Array.from(e.dataTransfer.files)
    const items = Array.from(e.dataTransfer.items || [])
    if (!files.length) return
    const first = files[0]
    const filePath = getFilePath(first)
    if (!filePath) { setError('Electron 앱에서 실행 중인지 확인하세요.'); return }
    const entry = items[0]?.webkitGetAsEntry?.()
    const isDir = entry ? entry.isDirectory : (first.type === '')
    setFolderPath(isDir ? filePath : getParentFolder(filePath))
    setSource('folder')
  }

  async function handleSelectFolder() {
    const api = getElectronApi()
    const isElectron = !!api?.isElectron
    if (!isElectron) return
    const p = await api.selectFolder()
    if (p) { setFolderPath(p); setSource('folder'); setError('') }
  }

  async function handleIngest() {
    setError('')
    setJobStatus('processing')
    try {
      const body = source === 'folder'
        ? { source: 'local_folder', path: folderPath }
        : { source: 'notion', notion_token: notionToken, database_id: notionDbId }

      const res = await fetch(`${backend}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || '인제스트 실패'); setJobStatus('failed'); return }
      setJobId(data.job_id)
    } catch {
      setError('백엔드 연결 실패. 앱을 다시 시작해보세요.')
      setJobStatus('failed')
    }
  }

  function handleReset() {
    setSource(null); setFolderPath(''); setNotionToken(''); setNotionDbId('')
    setJobId(null); setJobStatus(null); setProgress({ processed: 0, total: 0 }); setError('')
  }

  const canIngest = source === 'folder' ? folderPath.trim() : notionToken.trim() && notionDbId.trim()
  const gap = compact ? 'space-y-3' : 'space-y-4'
  const isElectron = !!getElectronApi()?.isElectron

  return (
    <div className={gap}>
      {/* Source selector */}
      <div className={`grid grid-cols-2 gap-2`}>
        <button onClick={() => { setSource('folder'); setError('') }}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            source === 'folder' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
          <div className="text-xl mb-0.5">📁</div>
          <div className="font-medium text-sm text-gray-900">폴더 선택</div>
          <div className="text-xs text-gray-400">PDF 파일 폴더</div>
        </button>
        <button onClick={() => { setSource('notion'); setError('') }}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            source === 'notion' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
          <div className="text-xl mb-0.5">🔗</div>
          <div className="font-medium text-sm text-gray-900">Notion 연결</div>
          <div className="text-xs text-gray-400">노션 논문 DB</div>
        </button>
      </div>

      {/* Folder drop zone */}
      {source === 'folder' && (
        <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-default ${
            dragging ? 'border-blue-400 bg-blue-50'
            : folderPath ? 'border-green-300 bg-green-50'
            : 'border-gray-200 hover:border-gray-300'
          }`}>
          {folderPath ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-700">✓ 폴더 선택됨</p>
              <p className="text-xs font-mono bg-white rounded px-2 py-1 text-gray-600 break-all">{folderPath}</p>
              <button onClick={() => { setFolderPath(''); setError('') }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">변경</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm text-gray-500">{dragging ? '놓으면 추가됩니다' : 'PDF 폴더를 드래그하거나'}</p>
              {isElectron && (
                <button onClick={handleSelectFolder} className="text-sm text-blue-600 hover:underline">
                  폴더 직접 선택
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notion inputs */}
      {source === 'notion' && (
        <div className="space-y-2">
          <input type="password" value={notionToken} onChange={e => setNotionToken(e.target.value)}
            placeholder="Notion 통합 토큰 (secret_...)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" value={notionDbId} onChange={e => setNotionDbId(e.target.value)}
            placeholder="데이터베이스 ID"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      )}

      {/* Progress */}
      {jobStatus === 'processing' && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>처리 중...</span>
            <span>{progress.processed} / {progress.total || '?'}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: progress.total ? `${(progress.processed / progress.total) * 100}%` : '5%' }} />
          </div>
        </div>
      )}

      {jobStatus === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm text-green-700 flex items-center justify-between">
          <span>✅ {progress.total}개 청크 인덱싱 완료</span>
          <div className="flex gap-2">
            <button onClick={handleReset} className="text-xs text-green-600 hover:underline">더 추가</button>
            {onDone && <button onClick={onDone} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">완료</button>}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Ingest button */}
      {jobStatus !== 'done' && (
        <button onClick={handleIngest}
          disabled={!canIngest || jobStatus === 'processing'}
          className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {jobStatus === 'processing' ? '처리 중...' : '인덱싱 시작'}
        </button>
      )}
    </div>
  )
}
