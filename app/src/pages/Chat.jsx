import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import ConfidenceBadge from '../components/ConfidenceBadge'
import CitationCard from '../components/CitationCard'

const EXAMPLES = [
  'Evaluate whether this idea is worth pursuing based on my library.',
  'What contribution gap appears across these papers and my notes?',
  'Give me a one-week validation plan for this project.',
]

export default function Chat({ backend }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text) {
    const query = text.trim()
    if (!query || loading) return

    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, { role: 'user', content: query }])
    setInput('')
    setLoading(true)

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      citations: [],
      confidence: null,
      streaming: true,
    }])

    try {
      const res = await fetch(`${backend}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, filters: {}, conversation_history: history }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'error',
            content: err.detail || `Server error (${res.status})`,
          }
          return next
        })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const chunk = JSON.parse(line.slice(6))

            if (chunk.type === 'token') {
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                next[next.length - 1] = { ...last, content: last.content + chunk.text }
                return next
              })
            } else if (chunk.type === 'done') {
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  citations: chunk.citations ?? [],
                  confidence: chunk.confidence,
                  streaming: false,
                }
                return next
              })
            } else if (chunk.type === 'no_source') {
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = {
                  role: 'assistant',
                  content: chunk.answer,
                  citations: [],
                  confidence: 'no_source',
                  streaming: false,
                }
                return next
              })
            }
          } catch {
            // Ignore malformed streaming chunks.
          }
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'error',
          content: 'Could not reach the backend. Restart the app and try again.',
        }
        return next
      })
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
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="max-w-xl space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white">
                RC
              </div>
              <h2 className="text-xl font-semibold text-gray-800">Ask for a research decision</h2>
              <p className="text-gray-500 text-sm">
                Use your papers and notes to find the gap, judge the contribution, and choose the next validation step.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-md">
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => sendMessage(ex)}
                  className="text-sm text-left px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
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
                <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 min-h-[2.5rem]">
                  {msg.content ? (
                    <div className="prose prose-sm max-w-none text-gray-800">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex gap-1 items-center h-5">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>

                {!msg.streaming && msg.confidence && (
                  <div className="space-y-2 pl-1">
                    <ConfidenceBadge confidence={msg.confidence} />
                    {msg.citations?.length > 0 && (
                      <div className="grid grid-cols-1 gap-1.5">
                        {msg.citations.map(c => <CitationCard key={c.index} citation={c} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {msg.role === 'error' && (
              <div className="max-w-xl px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about a contribution gap, project risk, or next validation step..."
            rows={1}
            className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 max-h-32 overflow-y-auto"
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px' }}
          />
          <button onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
