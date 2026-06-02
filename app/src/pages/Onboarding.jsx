import { useState, useEffect } from 'react'

const isElectron = typeof window !== 'undefined' && !!window.api

export default function Onboarding({ backend, onComplete }) {
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [source, setSource] = useState(null)       // 'folder' | 'notion'
  const [folderPath, setFolderPath] = useState('')
  const [notionToken, setNotionToken] = useState('')
  const [notionDbId, setNotionDbId] = useState('')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)  // null | 'processing' | 'done' | 'failed'
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [error, setError] = useState('')

  // Load saved API key on mount
  useEffect(() => {
    if (isElectron) {
      window.api.getApiKey().then(k => { if (k) { setApiKey(k); setApiKeySaved(true) } })
    }
  }, [])

  // Poll job status
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

  async function handleSaveApiKey() {
    if (!apiKey.trim()) return
    if (isElectron) await window.api.setApiKey(apiKey.trim())
    setApiKeySaved(true)
  }

  async function handleSelectFolder() {
    if (isElectron) {
      const path = await window.api.selectFolder()
      if (path) setFolderPath(path)
    }
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
    } catch (e) {
      setError('백엔드 연결 실패. 서버가 실행 중인지 확인하세요.')
      setJobStatus('failed')
    }
  }

  const canIngest = source === 'folder'
    ? folderPath.trim()
    : notionToken.trim() && notionDbId.trim()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-4xl">🔬</div>
          <h1 className="text-2xl font-bold text-gray-900">Research Companion</h1>
          <p className="text-gray-500 text-sm">내 논문 전체를 아는 AI 연구 파트너</p>
        </div>

        {/* Step 1 — API Key */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
            <span className="bg-gray-900 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">1</span>
            Anthropic API Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setApiKeySaved(false) }}
              placeholder="sk-ant-..."
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              {apiKeySaved ? '✓ 저장됨' : '저장'}
            </button>
          </div>
        </div>

        {/* Step 2 — Source */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
            <span className="bg-gray-900 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">2</span>
            논문 어디 있어요?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSource('folder')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                source === 'folder' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-1">📁</div>
              <div className="font-medium text-sm text-gray-900">폴더 선택</div>
              <div className="text-xs text-gray-500">PDF 파일이 있는 폴더</div>
            </button>
            <button
              onClick={() => setSource('notion')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                source === 'notion' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-1">🔗</div>
              <div className="font-medium text-sm text-gray-900">Notion 연결</div>
              <div className="text-xs text-gray-500">노션 논문 DB</div>
            </button>
          </div>
        </div>

        {/* Source Detail */}
        {source === 'folder' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={folderPath}
                onChange={e => setFolderPath(e.target.value)}
                placeholder="/Users/me/Papers"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {isElectron && (
                <button
                  onClick={handleSelectFolder}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  찾아보기
                </button>
              )}
            </div>
          </div>
        )}

        {source === 'notion' && (
          <div className="space-y-2">
            <input
              type="password"
              value={notionToken}
              onChange={e => setNotionToken(e.target.value)}
              placeholder="Notion 통합 토큰 (secret_...)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={notionDbId}
              onChange={e => setNotionDbId(e.target.value)}
              placeholder="데이터베이스 ID"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Progress */}
        {jobStatus === 'processing' && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>처리 중...</span>
              <span>{progress.processed} / {progress.total || '?'}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: progress.total ? `${(progress.processed / progress.total) * 100}%` : '5%' }}
              />
            </div>
          </div>
        )}

        {jobStatus === 'done' && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
            ✅ {progress.total}개 청크 인덱싱 완료
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {jobStatus !== 'done' ? (
            <button
              onClick={handleIngest}
              disabled={!apiKeySaved || !canIngest || jobStatus === 'processing'}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {jobStatus === 'processing' ? '처리 중...' : '논문 인덱싱 시작'}
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              시작하기 →
            </button>
          )}
          {jobStatus === null && (
            <button
              onClick={onComplete}
              className="w-full py-2 text-gray-400 text-sm hover:text-gray-600"
            >
              건너뛰기 (나중에 추가)
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
