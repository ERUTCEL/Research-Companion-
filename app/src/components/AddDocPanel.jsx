import { useState, useRef, useEffect } from 'react'

function getElectronApi() {
  return typeof window !== 'undefined' ? window.api : null
}

function getFilePath(file) {
  const api = getElectronApi()
  return api?.getPathForFile?.(file) || file.path || ''
}

export default function AddDocPanel({ backend, onDone, compact = false }) {
  const [source, setSource] = useState(null)
  const [documentPath, setDocumentPath] = useState('')
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
    if (!files.length) return
    const first = files[0]
    const filePath = getFilePath(first)
    if (!filePath) { setError('Electron 앱에서 실행 중인지 확인하세요.'); return }
    if (!filePath.toLowerCase().endsWith('.pdf')) { setError('PDF 문서만 선택할 수 있습니다.'); return }
    setDocumentPath(filePath)
    setSource('folder')
  }

  async function handleSelectPdf() {
    const api = getElectronApi()
    const isElectron = !!api?.isElectron
    if (!isElectron) return
    const p = await api.selectPdf()
    if (p) { setDocumentPath(p); setSource('folder'); setError('') }
  }

  async function handleIngest() {
    setError('')
    setJobStatus('processing')
    try {
      const body = source === 'folder'
        ? { source: 'local_folder', path: documentPath }
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
    setSource(null); setDocumentPath(''); setNotionToken(''); setNotionDbId('')
    setJobId(null); setJobStatus(null); setProgress({ processed: 0, total: 0 }); setError('')
  }

  const canIngest = source === 'folder' ? documentPath.trim() : notionToken.trim() && notionDbId.trim()
  const gap = compact ? 'space-y-3' : 'space-y-4'
  const isElectron = !!getElectronApi()?.isElectron

  return (
    <div className={gap}>
      {/* Source selector */}
      <div className={`grid grid-cols-2 gap-2`}>
        <button onClick={() => { setSource('folder'); setError('') }}
          className={`rounded-md border p-3 text-left transition-all ${
            source === 'folder' ? 'border-[#2dd4bf] bg-[#ecfffb]' : 'border-[#dce2e8] bg-white hover:border-[#aeb8c6]'
          }`}>
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-[#151a23] text-[10px] font-semibold text-white">PDF</div>
          <div className="font-medium text-sm text-[#171717]">문서 선택</div>
          <div className="text-xs text-[#7b8190]">PDF 파일</div>
        </button>
        <button onClick={() => { setSource('notion'); setError('') }}
          className={`rounded-md border p-3 text-left transition-all ${
            source === 'notion' ? 'border-[#f2b24b] bg-[#fff7e6]' : 'border-[#dce2e8] bg-white hover:border-[#aeb8c6]'
          }`}>
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-[#f2b24b] text-[10px] font-semibold text-[#171717]">DB</div>
          <div className="font-medium text-sm text-[#171717]">Notion 연결</div>
          <div className="text-xs text-[#7b8190]">노션 논문 DB</div>
        </button>
      </div>

      {/* Folder drop zone */}
      {source === 'folder' && (
        <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          className={`rounded-md border border-dashed p-4 text-center transition-colors cursor-default ${
            dragging ? 'border-[#2dd4bf] bg-[#ecfffb]'
            : documentPath ? 'border-[#0f9f8d] bg-[#ecfffb]'
            : 'border-[#cfd6df] bg-white hover:border-[#aeb8c6]'
          }`}>
          {documentPath ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#086c61]">PDF 선택됨</p>
              <p className="text-xs font-mono bg-white rounded px-2 py-1 text-[#59606b] break-all">{documentPath}</p>
              <button onClick={() => { setDocumentPath(''); setError('') }}
                className="text-xs text-[#697386] hover:text-[#171717] underline">변경</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm text-[#59606b]">{dragging ? '놓으면 추가됩니다' : 'PDF 문서를 드래그하거나'}</p>
              {isElectron && (
                <button onClick={handleSelectPdf} className="text-sm font-medium text-[#086c61] hover:underline">
                  PDF 문서 선택
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
            className="w-full rounded-md border border-[#dce2e8] bg-white px-3 py-2 text-sm text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]" />
          <input type="text" value={notionDbId} onChange={e => setNotionDbId(e.target.value)}
            placeholder="데이터베이스 ID"
            className="w-full rounded-md border border-[#dce2e8] bg-white px-3 py-2 text-sm text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]" />
        </div>
      )}

      {/* Progress */}
      {jobStatus === 'processing' && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-[#59606b]">
            <span>처리 중...</span>
            <span>{progress.processed} / {progress.total || '?'}</span>
          </div>
          <div className="w-full bg-[#dce2e8] rounded-full h-1.5">
            <div className="bg-[#0f9f8d] h-1.5 rounded-full transition-all duration-500"
              style={{ width: progress.total ? `${(progress.processed / progress.total) * 100}%` : '5%' }} />
          </div>
        </div>
      )}

      {jobStatus === 'done' && (
        <div className="bg-[#ecfffb] border border-[#b8ece4] rounded-md px-3 py-2.5 text-sm text-[#086c61] flex items-center justify-between">
          <span>{progress.total}개 청크 인덱싱 완료</span>
          <div className="flex gap-2">
            <button onClick={handleReset} className="text-xs text-[#086c61] hover:underline">더 추가</button>
            {onDone && <button onClick={onDone} className="text-xs bg-[#151a23] text-white px-2 py-1 rounded hover:bg-[#283241]">완료</button>}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[#fff1f0] border border-[#f2b8b5] rounded-md px-3 py-2.5 text-sm text-[#b9413c]">{error}</div>
      )}

      {/* Ingest button */}
      {jobStatus !== 'done' && (
        <button onClick={handleIngest}
          disabled={!canIngest || jobStatus === 'processing'}
          className="w-full rounded-md bg-[#151a23] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#283241] disabled:cursor-not-allowed disabled:opacity-40">
          {jobStatus === 'processing' ? '처리 중...' : '인덱싱 시작'}
        </button>
      )}
    </div>
  )
}
