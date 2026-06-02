import { useState, useEffect } from 'react'
import Onboarding from './pages/Onboarding'
import Chat from './pages/Chat'
import Library from './pages/Library'

const BACKEND = 'http://127.0.0.1:8001'
const POLL_MS = 1500

export default function App() {
  const [page, setPage] = useState('onboarding')
  const [ready, setReady] = useState(false)
  const [readyDetail, setReadyDetail] = useState('백엔드 시작 중...')

  // Poll /health until ready
  useEffect(() => {
    if (ready) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND}/health`)
        const data = await res.json()
        setReadyDetail(data.detail ?? '로딩 중...')
        if (data.ready) {
          setReady(true)
          clearInterval(id)
        }
      } catch {
        setReadyDetail('백엔드 연결 대기 중...')
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [ready])

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">🔬</div>
        <p className="text-white font-semibold text-lg">Research Companion</p>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          {readyDetail}
        </div>
        <p className="text-gray-600 text-xs mt-2">임베딩 모델 로딩 중 — 최초 실행 시 30초~1분 소요됩니다</p>
      </div>
    )
  }

  if (page === 'onboarding') {
    return <Onboarding backend={BACKEND} onComplete={() => setPage('chat')} />
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="w-14 bg-gray-900 flex flex-col items-center py-4 gap-4">
        <button onClick={() => setPage('chat')} title="채팅"
          className={`p-2 rounded-lg text-lg ${page === 'chat' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
          💬
        </button>
        <button onClick={() => setPage('library')} title="라이브러리"
          className={`p-2 rounded-lg text-lg ${page === 'library' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
          📚
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {page === 'chat'    && <Chat    backend={BACKEND} />}
        {page === 'library' && <Library backend={BACKEND} />}
      </div>
    </div>
  )
}
