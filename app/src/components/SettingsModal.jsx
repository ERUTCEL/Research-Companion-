import { useState, useEffect } from 'react'

const isElectron = typeof window !== 'undefined' && !!window.api?.isElectron

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-ant-...',
    keyEnv: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
    showBaseUrl: false,
  },
  openai: {
    label: 'OpenAI (GPT)',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-...',
    keyEnv: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o',
    showBaseUrl: false,
  },
  groq: {
    label: 'Groq (Llama / Mixtral)',
    keyLabel: 'API Key',
    keyPlaceholder: 'gsk_...',
    keyEnv: 'OPENAI_API_KEY',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    showBaseUrl: false,
  },
  deepseek: {
    label: 'DeepSeek',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-...',
    keyEnv: 'OPENAI_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    showBaseUrl: false,
  },
  ollama: {
    label: 'Ollama (로컬)',
    keyLabel: null,
    keyPlaceholder: '',
    keyEnv: null,
    models: [],
    defaultModel: 'qwen3:8b',
    showBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    keyLabel: 'API Key',
    keyPlaceholder: 'your-api-key',
    keyEnv: 'OPENAI_API_KEY',
    models: [],
    defaultModel: '',
    showBaseUrl: true,
    defaultBaseUrl: '',
  },
}

export default function SettingsModal({ open, onClose }) {
  const [provider, setProvider]     = useState('anthropic')
  const [model, setModel]           = useState('claude-sonnet-4-6')
  const [apiKey, setApiKey]         = useState('')
  const [baseUrl, setBaseUrl]       = useState('')
  const [notionToken, setNotionToken] = useState('')
  const [saving, setSaving]   = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open || !isElectron) return
    window.api.getSettings().then(s => {
      setProvider(s.CLIO_PROVIDER || 'anthropic')
      setModel(s.CLIO_MODEL || 'claude-sonnet-4-6')
      setApiKey(s.ANTHROPIC_API_KEY || s.OPENAI_API_KEY || '')
      setBaseUrl(s.OPENAI_BASE_URL || '')
      setNotionToken(s.NOTION_TOKEN || '')
    })
  }, [open])

  const meta = PROVIDERS[provider] || PROVIDERS.custom

  function handleProviderChange(p) {
    setProvider(p)
    setModel(PROVIDERS[p]?.defaultModel || '')
    setBaseUrl(PROVIDERS[p]?.defaultBaseUrl || '')
    setApiKey('')
    setMessage('')
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const settings = {
        CLIO_PROVIDER: provider,
        CLIO_MODEL:    model.trim(),
        NOTION_TOKEN:  notionToken.trim(),
      }
      if (provider === 'anthropic') {
        settings.ANTHROPIC_API_KEY = apiKey.trim()
      } else if (provider !== 'ollama') {
        settings.OPENAI_API_KEY  = apiKey.trim()
        settings.OPENAI_BASE_URL = baseUrl.trim()
      } else {
        settings.OPENAI_BASE_URL = baseUrl.trim() || 'http://localhost:11434/v1'
      }

      if (isElectron) {
        await window.api.saveSettings(settings)
        setMessage('저장 완료. 백엔드를 재시작 중입니다...')
      } else {
        setMessage('Electron 앱에서만 저장할 수 있습니다.')
      }
    } catch (e) {
      setMessage(`오류: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">Configuration</div>
            <h2 className="mt-0.5 text-sm font-semibold text-[#1E293B]">AI 프로바이더 설정</h2>
          </div>
          <button onClick={onClose}
            className="rounded-md border border-[#E2E8F0] p-1.5 text-[#64748B] hover:bg-[#F1F5F9]">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">

          {/* Provider */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#1E293B]">AI 프로바이더</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PROVIDERS).map(([key, p]) => (
                <button key={key} type="button" onClick={() => handleProviderChange(key)}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    provider === key
                      ? 'border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5] font-medium'
                      : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#1E293B]">모델</label>
            {meta.models.length > 0 ? (
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20">
                {meta.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input type="text" value={model} onChange={e => setModel(e.target.value)}
                placeholder={meta.defaultModel || '모델명 입력 (예: qwen3:8b)'}
                className="w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-mono focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20" />
            )}
          </div>

          {/* API Key */}
          {meta.keyLabel && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1E293B]">
                {meta.keyLabel}
                <span className="ml-1.5 text-[#EF4444]">필수</span>
              </label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={meta.keyPlaceholder}
                className="w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-mono focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20" />
            </div>
          )}

          {/* Base URL */}
          {meta.showBaseUrl && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1E293B]">
                Base URL
                {provider === 'ollama' && <span className="ml-1.5 text-[#94A3B8]">기본값: localhost:11434</span>}
              </label>
              <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder={meta.defaultBaseUrl || 'https://your-api-endpoint/v1'}
                className="w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-mono focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20" />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-[#E2E8F0]" />

          {/* Notion */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#1E293B]">
              Notion Integration Token
              <span className="ml-1.5 text-[#94A3B8]">선택</span>
            </label>
            <input type="password" value={notionToken} onChange={e => setNotionToken(e.target.value)}
              placeholder="secret_..."
              className="w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-mono focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20" />
          </div>

          <div className="rounded-md border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2 text-[11px] leading-5 text-[#3730A3]">
            키는 시스템 키체인에 암호화 저장됩니다. 저장 후 백엔드가 자동으로 재시작됩니다.
          </div>

          {message && (
            <div className={`rounded-md px-3 py-2 text-xs ${
              message.includes('오류') ? 'bg-red-50 text-red-600' : 'bg-[#F0FDF4] text-[#166534]'
            }`}>
              {message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] px-5 py-3">
          <button onClick={onClose}
            className="rounded-md border border-[#E2E8F0] px-3 py-1.5 text-xs text-[#475569] hover:bg-[#F1F5F9]">
            취소
          </button>
          <button onClick={handleSave} disabled={saving || (!!meta.keyLabel && !apiKey.trim())}
            className="rounded-md bg-[#4F46E5] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-40">
            {saving ? '저장 중...' : '저장 및 적용'}
          </button>
        </div>
      </div>
    </div>
  )
}
