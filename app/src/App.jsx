import { useState, useEffect } from 'react'
import Onboarding from './pages/Onboarding'
import Chat from './pages/Chat'
import Library from './pages/Library'
import BrandMark from './components/BrandMark'
import SettingsModal from './components/SettingsModal'

const BACKEND = window.api?.backendUrl || '/api'
const POLL_MS = 1500

export default function App() {
  const [page, setPage] = useState(() =>
    localStorage.getItem('onboarding_done') ? 'chat' : 'onboarding'
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
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
        try {
          const backendStatus = await window.api?.getBackendStatus?.()
          setReadyDetail(backendStatus?.detail || '백엔드 연결 대기 중...')
        } catch {
          setReadyDetail('백엔드 연결 대기 중...')
        }
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [ready])

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#f7f7f4] flex flex-col items-center justify-center gap-4 text-[#171717]">
        <BrandMark size="lg" />
        <p className="font-semibold text-lg">CLIO</p>
        <div className="flex items-center gap-2 text-[#59606b] text-sm">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          {readyDetail}
        </div>
        <p className="max-w-md text-center text-[#7b8190] text-xs mt-2">
          최초 실행은 임베딩 모델을 다운로드하므로 네트워크 환경에 따라 수 분 걸릴 수 있습니다.
        </p>
      </div>
    )
  }

  if (page === 'onboarding') {
    return <Onboarding backend={BACKEND} onComplete={() => {
      localStorage.setItem('onboarding_done', '1')
      setPage('chat')
    }} />
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-[#1E293B]">
      <div className="w-20 border-r border-[#E2E8F0] bg-white flex flex-col items-center py-4 gap-3">
        <div className="mb-2"><BrandMark /></div>
        <button onClick={() => setPage('chat')} title="Decision desk"
          className={`flex h-12 w-14 flex-col items-center justify-center rounded-md text-[11px] transition-colors ${
            page === 'chat' ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]'
          }`}>
          <span className="text-sm font-semibold">D</span>
          Desk
        </button>
        <button onClick={() => setPage('library')} title="Library"
          className={`flex h-12 w-14 flex-col items-center justify-center rounded-md text-[11px] transition-colors ${
            page === 'library' ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]'
          }`}>
          <span className="text-sm font-semibold">L</span>
          Library
        </button>
        <button onClick={() => setSettingsOpen(true)} title="API 키 설정"
          className="mt-auto flex h-8 w-8 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {page === 'chat'    && <Chat    backend={BACKEND} />}
        {page === 'library' && <Library backend={BACKEND} />}
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
