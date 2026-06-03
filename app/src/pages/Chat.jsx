import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import ConfidenceBadge from '../components/ConfidenceBadge'
import CitationCard from '../components/CitationCard'
import LocalAISetup from '../components/LocalAISetup'

const EXAMPLES = [
  '내 아이디어가 논문 기여로 충분한지 냉정하게 판단해줘.',
  '이 라이브러리에서 아직 비어 있는 contribution gap을 찾아줘.',
  '이번 주에 이 프로젝트를 검증할 수 있는 kill test를 짜줘.',
]

const LENSES = ['Decision', 'Evidence', 'Gap', 'Risk', 'Next Test']
const LEGACY_STORAGE_KEY = 'research-companion.chat.messages.v1'
const SESSIONS_STORAGE_KEY = 'research-companion.chat.sessions.v2'
const ACTIVE_SESSION_KEY = 'research-companion.chat.activeSessionId.v2'
const SLASH_COMMANDS = [
  { name: 'help', label: '/help', description: '사용 가능한 명령어 보기' },
  { name: 'new', label: '/new', description: '새 대화창 열기' },
  { name: 'clear', label: '/clear', description: '현재 대화 비우기' },
  { name: 'stop', label: '/stop', description: '생성 중인 답변 멈추기' },
  { name: 'memory', label: '/memory', description: '현재 기억/학습 상태 확인' },
  { name: 'health', label: '/health', description: '백엔드 상태 확인' },
  { name: 'export', label: '/export', description: '현재 대화 Markdown으로 저장' },
]

function newSession(messages = []) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return {
    id,
    title: messages.find(m => m.role === 'user')?.content?.slice(0, 48) || '새 대화',
    titleEdited: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages,
  }
}

function loadStoredSessions() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (!raw) {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!legacy) return [newSession()]
      const legacyMessages = JSON.parse(legacy)
      return Array.isArray(legacyMessages)
        ? [newSession(sanitizeMessages(legacyMessages))]
        : [newSession()]
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return [newSession()]
    return parsed.map(session => ({
      ...session,
      titleEdited: Boolean(session.titleEdited),
      messages: sanitizeMessages(session.messages || []),
    }))
  } catch {
    return [newSession()]
  }
}

function sanitizeMessages(messages) {
  return messages.filter(m => ['user', 'assistant', 'error'].includes(m.role))
}

function persistableMessages(messages) {
  return messages
    .filter(m => !m.streaming)
    .map(({ role, content, citations, confidence, sources }) => ({
      role,
      content,
      citations: citations ?? [],
      confidence: confidence ?? null,
      sources: sources ?? [],
    }))
}

function persistableSessions(sessions) {
  return sessions.map(session => ({
    ...session,
    messages: persistableMessages(session.messages || []),
  }))
}

function StreamingAnswer({ content }) {
  return (
    <div className="whitespace-pre-wrap text-[15px] leading-8 text-[#262824]">
      {content}
      <span className="inline-block w-0.5 h-4 bg-[#3f6f5d] animate-pulse ml-0.5 align-middle" />
    </div>
  )
}

const markdownComponents = {
  p: ({ children }) => <p className="mb-4 last:mb-0 leading-8">{children}</p>,
  li: ({ children }) => <li className="mb-2 leading-8">{children}</li>,
  hr: () => <hr className="my-8 border-gray-200" />,
}

function SourcePreview({ sources = [], streaming }) {
  if (!sources.length && !streaming) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {streaming && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#738075] mr-1">
          {sources.length ? 'Reading library' : 'Searching library'}
        </span>
      )}
      {sources.slice(0, 4).map(source => (
        <span key={`${source.index}-${source.title}`}
          className="max-w-[15rem] truncate rounded-md border border-[#d9d2c3] bg-[#fffdf8] px-2 py-1 text-[11px] text-[#5d625b]">
          [{source.index}] {source.title}
        </span>
      ))}
    </div>
  )
}

function CitationPanel({ confidence, citations = [] }) {
  if (!confidence) return null
  return (
    <details className="group rounded-md border border-[#d9d2c3] bg-[#fffdf8]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-[#5f665d]">
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={confidence} />
          <span>인용 {citations.length}개</span>
        </div>
        <span className="text-[#8c8171] group-open:rotate-180 transition-transform">⌄</span>
      </summary>
      {citations.length > 0 && (
        <div className="grid grid-cols-1 gap-1.5 border-t border-[#ebe5d9] p-2">
          {citations.map(c => <CitationCard key={c.index} citation={c} />)}
        </div>
      )}
    </details>
  )
}

export default function Chat({ backend }) {
  const [sessions, setSessions] = useState(loadStoredSessions)
  const [activeSessionId, setActiveSessionId] = useState(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(ACTIVE_SESSION_KEY)
  })
  const [input, setInput] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const pendingTextRef = useRef('')
  const pendingSessionRef = useRef(null)
  const abortRef = useRef(null)
  const frameRef = useRef(null)
  const composingRef = useRef(false)
  const activeSession = sessions.find(session => session.id === activeSessionId) || sessions[0] || newSession()
  const messages = activeSession.messages || []
  const trimmedInput = input.trim()
  const slashQuery = trimmedInput.startsWith('/') ? trimmedInput.slice(1).toLowerCase() : ''
  const slashMatches = trimmedInput.startsWith('/')
    ? SLASH_COMMANDS.filter(command => !slashQuery || command.name.startsWith(slashQuery) || command.label.includes(slashQuery))
    : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasActive = sessions.some(session => session.id === activeSessionId)
    if (!activeSessionId || !hasActive) {
      setActiveSessionId(sessions[0]?.id ?? null)
    }
  }, [activeSessionId, sessions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(persistableSessions(sessions)))
    if (activeSessionId) window.localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId)
  }, [sessions, activeSessionId])

  function updateActiveMessages(updater, sessionId = activeSession.id) {
    setSessions(prev => prev.map(session => {
      if (session.id !== sessionId) return session
      const nextMessages = typeof updater === 'function' ? updater(session.messages || []) : updater
      const firstUser = nextMessages.find(m => m.role === 'user')?.content
      return {
        ...session,
        title: !session.titleEdited && firstUser ? firstUser.slice(0, 48) : session.title,
        updatedAt: Date.now(),
        messages: nextMessages,
      }
    }))
  }

  function startTitleEdit() {
    setTitleDraft(activeSession.title || '새 대화')
    setEditingTitle(true)
  }

  function saveTitleEdit() {
    const nextTitle = titleDraft.trim() || '새 대화'
    setSessions(prev => prev.map(session => (
      session.id === activeSession.id
        ? { ...session, title: nextTitle.slice(0, 80), titleEdited: true, updatedAt: Date.now() }
        : session
    )))
    setEditingTitle(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function cancelTitleEdit() {
    setEditingTitle(false)
    setTitleDraft('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function resetInputHeight() {
    requestAnimationFrame(() => {
      if (!inputRef.current) return
      inputRef.current.style.height = 'auto'
    })
  }

  function flushPendingText() {
    if (!pendingTextRef.current) return
    const text = pendingTextRef.current
    const sessionId = pendingSessionRef.current || activeSession.id
    pendingTextRef.current = ''
    updateActiveMessages(prev => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, content: last.content + text }
      return next
    }, sessionId)
  }

  function queueToken(text) {
    pendingTextRef.current += text
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      flushPendingText()
    })
  }

  function addAssistantNote(content, sessionId = activeSession.id) {
    updateActiveMessages(prev => [...prev, {
      role: 'assistant',
      content,
      citations: [],
      confidence: null,
      sources: [],
    }], sessionId)
  }

  function stopGeneration() {
    if (!loading) return false
    abortRef.current?.abort()
    flushPendingText()
    const sessionId = pendingSessionRef.current || activeSession.id
    updateActiveMessages(prev => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        next[next.length - 1] = {
          ...last,
          content: last.content ? `${last.content}\n\n_중지됨._` : '_중지됨._',
          streaming: false,
        }
      }
      return next
    }, sessionId)
    setLoading(false)
    pendingSessionRef.current = null
    return true
  }

  async function exportConversation() {
    const body = messages.map(msg => {
      const prefix = msg.role === 'user' ? '## User' : msg.role === 'assistant' ? '## Research Companion' : '## Error'
      return `${prefix}\n\n${msg.content || ''}`
    }).join('\n\n---\n\n')
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeSession.title || 'research-companion-chat'}.md`.replace(/[\\/:*?"<>|]/g, '-')
    a.click()
    URL.revokeObjectURL(url)
  }

  async function runSlashCommand(raw) {
    const [name = ''] = raw.trim().slice(1).split(/\s+/)
    const command = name.toLowerCase()
    setInput('')
    resetInputHeight()

    if (!command || command === 'help') {
      addAssistantNote([
        '### 명령어',
        '- `/new` 새 대화창을 엽니다.',
        '- `/clear` 현재 대화를 비웁니다.',
        '- `/stop` 생성 중인 답변을 멈춥니다.',
        '- `/memory` 기억/학습 상태를 확인합니다.',
        '- `/health` 백엔드 상태를 확인합니다.',
        '- `/export` 현재 대화를 Markdown 파일로 저장합니다.',
      ].join('\n'))
      return true
    }

    if (command === 'new') {
      createConversation()
      return true
    }

    if (command === 'clear') {
      clearConversation()
      return true
    }

    if (command === 'stop' || command === 'pause') {
      if (!stopGeneration()) addAssistantNote('지금 생성 중인 답변이 없습니다.')
      return true
    }

    if (command === 'memory') {
      addAssistantNote([
        '### 기억 상태',
        `- 현재 저장된 대화창: ${sessions.length}개`,
        `- 현재 대화의 사용자 질문: ${messages.filter(m => m.role === 'user').length}개`,
        '- 저장 방식: 이 기기의 `localStorage`에 대화 내용을 보관합니다.',
        '- 학습 여부: 모델 파인튜닝이나 사용자 스타일 학습은 하지 않습니다. 다음 질문에 이전 대화 내용을 같이 보내는 방식입니다.',
        '- 로컬 조교: Ollama가 있으면 `qwen3:14b`로 figure/diagram evidence를 구조화하고, 없으면 deterministic OCR/caption parser로 fallback합니다.',
      ].join('\n'))
      return true
    }

    if (command === 'health') {
      try {
        const res = await fetch(`${backend}/health`)
        const data = await res.json()
        const local = data.local_reasoner || {}
        addAssistantNote([
          '### Backend',
          `- status: ${data.status}`,
          `- ready: ${data.ready}`,
          `- detail: ${data.detail}`,
          `- local reasoner: ${local.available ? local.model : 'not available'}`,
        ].join('\n'))
      } catch {
        addAssistantNote('백엔드에 연결하지 못했습니다.')
      }
      return true
    }

    if (command === 'export') {
      await exportConversation()
      addAssistantNote('현재 대화를 Markdown 파일로 저장했습니다.')
      return true
    }

    addAssistantNote(`알 수 없는 명령어입니다: \`/${command}\`\n\n\`/help\`로 사용 가능한 명령어를 확인하세요.`)
    return true
  }

  async function sendMessage(text) {
    const query = text.trim()
    if (!query) return
    if (query.startsWith('/')) {
      await runSlashCommand(query)
      return
    }
    if (loading) return
    const targetSessionId = activeSession.id
    pendingSessionRef.current = targetSessionId

    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    updateActiveMessages(prev => [...prev, { role: 'user', content: query }], targetSessionId)
    setInput('')
    resetInputHeight()
    setLoading(true)

    updateActiveMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      citations: [],
      confidence: null,
      streaming: true,
      sources: [],
    }], targetSessionId)

    try {
      abortRef.current = new AbortController()
      const res = await fetch(`${backend}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, filters: {}, conversation_history: history }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        updateActiveMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'error',
            content: err.detail || `Server error (${res.status})`,
          }
          return next
        }, targetSessionId)
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

            if (chunk.type === 'sources') {
              updateActiveMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                next[next.length - 1] = { ...last, sources: chunk.sources ?? [] }
                return next
              }, targetSessionId)
            } else if (chunk.type === 'token') {
              queueToken(chunk.text)
            } else if (chunk.type === 'done') {
              flushPendingText()
              updateActiveMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  citations: chunk.citations ?? [],
                  confidence: chunk.confidence,
                  streaming: false,
                }
                return next
              }, targetSessionId)
            } else if (chunk.type === 'no_source') {
              flushPendingText()
              updateActiveMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = {
                  role: 'assistant',
                  content: chunk.answer,
                  citations: [],
                  confidence: 'no_source',
                  streaming: false,
                }
                return next
              }, targetSessionId)
            }
          } catch {
            // Ignore malformed streaming chunks.
          }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      updateActiveMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'error',
          content: 'Could not reach the backend. Restart the app and try again.',
        }
        return next
      }, targetSessionId)
    } finally {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      flushPendingText()
      abortRef.current = null
      pendingSessionRef.current = null
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    const isComposing = composingRef.current || e.nativeEvent?.isComposing || e.keyCode === 229
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      sendMessage(e.currentTarget.value)
    }
  }

  function clearConversation() {
    updateActiveMessages([])
    if (typeof window !== 'undefined') window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    inputRef.current?.focus()
  }

  function createConversation() {
    if (loading) return
    const session = newSession()
    setSessions(prev => [session, ...prev])
    setActiveSessionId(session.id)
    setInput('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="flex h-full flex-col bg-[#f4f1ea]">
      <div className="border-b border-[#ddd5c7] bg-[#fbfaf7]/95 px-5 py-3">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#738075]">Decision desk</div>
            <h1 className="mt-0.5 text-lg font-semibold text-[#20211f]">Research Companion</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-72">
              <LocalAISetup backend={backend} />
            </div>
            <span className="rounded-md bg-[#dfe9e4] px-2 py-1 text-xs font-medium text-[#243c35]">Library-grounded</span>
            <span className="rounded-md bg-[#eadfca] px-2 py-1 text-xs font-medium text-[#69512d]">Visual evidence ready</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <select value={activeSession.id}
            onChange={e => setActiveSessionId(e.target.value)}
            className="max-w-[18rem] truncate rounded-md border border-[#d9d2c3] bg-[#fffdf8] px-2 py-1.5 text-xs text-[#3b3d39] focus:outline-none focus:ring-2 focus:ring-[#b8c9be]">
            {sessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.title || '새 대화'}
              </option>
            ))}
          </select>
          <div className="hidden text-xs text-[#8c8171] sm:block">
            질문 {messages.filter(m => m.role === 'user').length}개
          </div>
          {editingTitle ? (
            <div className="flex items-center gap-1">
              <input value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTitleEdit()
                  if (e.key === 'Escape') cancelTitleEdit()
                }}
                autoFocus
                className="w-48 rounded-md border border-[#cfc6b6] bg-[#fffdf8] px-2 py-1.5 text-xs text-[#20211f] focus:outline-none focus:ring-2 focus:ring-[#b8c9be]"
              />
              <button onClick={saveTitleEdit}
                className="rounded-md px-2 py-1.5 text-xs text-[#243c35] hover:bg-[#dfe9e4]">
                저장
              </button>
              <button onClick={cancelTitleEdit}
                className="rounded-md px-2 py-1.5 text-xs text-[#7b776e] hover:bg-[#f0ece3]">
                취소
              </button>
            </div>
          ) : (
            <button onClick={startTitleEdit}
              className="rounded-md px-2 py-1.5 text-xs text-[#7b776e] hover:bg-[#f0ece3] hover:text-[#20211f]">
              제목 수정
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={createConversation}
            disabled={loading}
            className="rounded-md bg-[#243c35] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#305448] disabled:opacity-40">
            새 대화
          </button>
          <button onClick={clearConversation}
            disabled={loading || messages.length === 0}
            className="rounded-md px-2 py-1.5 text-xs text-[#7b776e] hover:bg-[#f0ece3] hover:text-[#20211f] disabled:opacity-40">
            비우기
          </button>
        </div>
      </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl space-y-6">
        {messages.length === 0 && (
          <div className="grid min-h-[70vh] place-items-center">
          <div className="w-full max-w-3xl border border-[#ddd5c7] bg-[#fbfaf7] p-8 shadow-sm">
            <div className="max-w-xl space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#243c35] text-sm font-semibold text-white">
                RC
              </div>
              <h2 className="text-2xl font-semibold text-[#20211f]">Ask for a research judgment.</h2>
              <p className="text-sm leading-7 text-[#687064]">
                Turn your library into a judgment: contribution, risk, and the next test.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {LENSES.map(lens => (
                <span key={lens} className="rounded-md border border-[#d9d2c3] bg-[#fffdf8] px-2 py-1 text-xs text-[#5d625b]">
                  {lens}
                </span>
              ))}
            </div>
            <div className="mt-6 grid gap-2">
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => sendMessage(ex)}
                  className="border border-[#d9d2c3] bg-[#fffdf8] px-4 py-3 text-left text-sm text-[#3b3d39] transition-colors hover:border-[#9db4a8] hover:bg-[#f7fbf8]">
                  {ex}
                </button>
              ))}
            </div>
          </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' && (
              <div className="max-w-2xl border border-[#cfc6b6] bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-[#20211f] shadow-sm">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8c8171]">Question</div>
                <div>{msg.content}</div>
              </div>
            )}

            {msg.role === 'assistant' && (
              <div className="w-full max-w-4xl space-y-3">
                <SourcePreview sources={msg.sources} streaming={msg.streaming} />
                <div className="border-l-4 border-[#3f6f5d] bg-[#fbfaf7] px-5 py-4 min-h-[2.5rem] shadow-sm ring-1 ring-[#ddd5c7]">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#738075]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3f6f5d]" />
                    Decision memo
                  </div>
                  {msg.content ? (
                    msg.streaming ? (
                      <StreamingAnswer content={msg.content} />
                    ) : (
                      <div className="prose prose-sm max-w-none text-[#262824] prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-[#20211f] prose-strong:text-[#20211f]">
                        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center gap-2 h-5 text-xs text-[#687064]">
                      <span className="w-1.5 h-1.5 bg-[#3f6f5d] rounded-full animate-pulse" />
                      {msg.sources?.length ? 'Synthesizing decision memo...' : 'Finding relevant evidence...'}
                    </div>
                  )}
                </div>

                {!msg.streaming && msg.confidence && (
                  <div className="space-y-2 pl-1">
                    <CitationPanel confidence={msg.confidence} citations={msg.citations ?? []} />
                  </div>
                )}
              </div>
            )}

            {msg.role === 'error' && (
              <div className="max-w-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-[#ddd5c7] bg-[#fbfaf7] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-end gap-2">
          <div className="relative flex-1">
            {slashMatches.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-md border border-[#d9d2c3] bg-[#fffdf8] shadow-lg">
                {slashMatches.map(command => (
                  <button key={command.name}
                    onMouseDown={e => {
                      e.preventDefault()
                      runSlashCommand(command.label)
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-[#f0ece3]">
                    <span className="font-mono font-medium text-[#20211f]">{command.label}</span>
                    <span className="truncate text-[#7b776e]">{command.description}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea ref={inputRef} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={() => { composingRef.current = false }}
              placeholder="Ask about a contribution gap, project risk, or type / for commands..."
              rows={1}
              className="w-full resize-none border border-[#cfc6b6] bg-[#fffdf8] px-4 py-3 text-sm text-[#20211f] focus:outline-none focus:ring-2 focus:ring-[#9db4a8] max-h-32 overflow-y-auto"
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px' }}
            />
          </div>
          <button onClick={() => loading ? stopGeneration() : sendMessage(input)}
            disabled={!loading && !input.trim()}
            aria-label="Send message"
            className="p-3 bg-[#243c35] text-white hover:bg-[#305448] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            {loading ? (
              <span className="block h-4 w-4 rounded-sm bg-current" />
            ) : (
              <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
