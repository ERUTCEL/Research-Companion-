import { useState } from 'react'
import Onboarding from './pages/Onboarding'
import Chat from './pages/Chat'
import Library from './pages/Library'

const BACKEND = 'http://127.0.0.1:8001'

export default function App() {
  const [page, setPage] = useState('onboarding')

  if (page === 'onboarding') {
    return <Onboarding backend={BACKEND} onComplete={() => setPage('chat')} />
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="w-14 bg-gray-900 flex flex-col items-center py-4 gap-4">
        <button
          onClick={() => setPage('chat')}
          title="채팅"
          className={`p-2 rounded-lg text-lg ${page === 'chat' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >💬</button>
        <button
          onClick={() => setPage('library')}
          title="라이브러리"
          className={`p-2 rounded-lg text-lg ${page === 'library' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >📚</button>
      </div>
      <div className="flex-1 overflow-hidden">
        {page === 'chat' && <Chat backend={BACKEND} />}
        {page === 'library' && <Library backend={BACKEND} />}
      </div>
    </div>
  )
}
