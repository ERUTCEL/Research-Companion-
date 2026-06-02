import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import ConfidenceBadge from '../components/ConfidenceBadge'
import CitationCard from '../components/CitationCard'

const EXAMPLES = [
  '이 논문들의 핵심 방법론을 요약해줘',
  '2022년 이후 논문 중 중요도 높은 것 알려줘',
  '내 노션 메모에서 인상 깊었던 내용이 뭐야?',
]

export default function Chat({ backend }) {
  const [messages, setMessages] = useState([])   // { role, content, citations, confidence }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text) {
    const query = text.trim()
    if (!query || loading) return

    const userMsg = { role: 'user', content: query }
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${backend}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          filters: {},
          conversation_history: history,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessages(prev => [...prev, {
          role: 'error',
          content: err.detail || `서버 오류 (${res.status})`,
        }])
        return
      }

      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        citations: data.citations ?? [],
        confidence: data.confidence,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'error',
        content: '백엔드 연결 실패. 서버가 실행 중인지 확인하세요.',
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div>
              <div className="text-4xl mb-2">🔬</div>
              <h2 className="text-xl font-semibold text-gray-800">논문에 대해 물어보세요</h2>
              <p className="text-gray-400 text-sm mt-1">인덱싱된 논문과 노션 메모를 바탕으로 답변합니다</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  onClick={() => sendMessage(ex)}
                  className="text-sm text-left px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' && (
              <div className="max-w-xl px-4 py-2.5 bg-gray-900 text-white rounded-2xl rounded-br-sm text-sm">
                {msg.content}
              </div>
            )}

            {msg.role === 'assistant' && (
              <div className="max-w-2xl w-full space-y-3">
                {/* Answer bubble */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="prose prose-sm max-w-none text-gray-800">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>

                {/* Confidence + Citations */}
                <div className="space-y-2 pl-1">
                  <ConfidenceBadge confidence={msg.confidence} />
                  {msg.citations?.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5">
                      {msg.citations.map(c => (
                        <CitationCard key={c.index} citation={c} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {msg.role === 'error' && (
              <div className="max-w-xl px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="논문에 대해 질문하세요... (Enter로 전송, Shift+Enter 줄바꿈)"
            rows={1}
            className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 max-h-32 overflow-y-auto"
            style={{ lineHeight: '1.5' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  )
}
