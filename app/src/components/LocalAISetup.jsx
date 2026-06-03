import { useEffect, useState } from 'react'

export default function LocalAISetup({ backend }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [pulling, setPulling] = useState('')

  async function refresh() {
    try {
      const res = await fetch(`${backend}/local-ai/status`)
      setStatus(await res.json())
    } catch {
      setStatus({ available: false, installed_models: [], recommended: [] })
      setMessage('로컬 AI 상태를 확인하지 못했습니다.')
    }
  }

  useEffect(() => { refresh() }, [])

  async function pull(model) {
    setPulling(model)
    setMessage(`${model} 설치를 시작했습니다. 모델 크기에 따라 오래 걸릴 수 있습니다.`)
    try {
      const res = await fetch(`${backend}/local-ai/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      const job = await res.json()
      const id = setInterval(async () => {
        const s = await fetch(`${backend}/local-ai/pull/${job.job_id}`).then(r => r.json())
        if (s.status === 'done' || s.status === 'failed' || s.status === 'missing') {
          clearInterval(id)
          setPulling('')
          setMessage(s.status === 'done' ? `${model} 설치 완료` : `설치 실패: ${s.error || 'unknown error'}`)
          refresh()
        }
      }, 2000)
    } catch {
      setPulling('')
      setMessage('설치를 시작하지 못했습니다.')
    }
  }

  const available = status?.available

  return (
    <div className="rounded-md border border-[#d9d2c3] bg-[#fffdf8]">
      <button onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs">
        <span className="font-medium text-[#20211f]">Local AI</span>
        <span className={available ? 'text-[#3f6f5d]' : 'text-[#8c8171]'}>
          {available ? status.model : '설정 필요'}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#ebe5d9] p-3 text-xs text-[#5d625b]">
          <p>
            로컬 AI는 그림/다이어그램 근거를 정리할 때 사용됩니다. 앱은 없어도 작동하지만,
            설치하면 figure evidence 품질이 올라갑니다.
          </p>
          <div className="space-y-2">
            {(status?.recommended || []).map(item => {
              const installed = status?.installed_models?.includes(item.name)
              return (
                <div key={item.name} className="flex items-center justify-between gap-3 rounded-md bg-[#f4f1ea] px-3 py-2">
                  <div>
                    <div className="font-mono text-[#20211f]">{item.name}</div>
                    <div className="text-[#8c8171]">{item.role} · {item.target}</div>
                  </div>
                  <button onClick={() => pull(item.name)}
                    disabled={installed || !!pulling}
                    className="rounded-md bg-[#243c35] px-2 py-1 text-white disabled:bg-[#cfc6b6]">
                    {installed ? '설치됨' : pulling === item.name ? '설치 중' : '설치'}
                  </button>
                </div>
              )
            })}
          </div>
          {message && <div className="rounded-md bg-[#f4f1ea] px-3 py-2 text-[#69512d]">{message}</div>}
          {!status?.installed_models?.length && (
            <div className="text-[#8c8171]">
              Ollama 앱이 설치되어 있지 않으면 먼저 Ollama가 필요합니다. 이후 모델 설치는 여기서 처리합니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
