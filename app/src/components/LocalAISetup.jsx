import { useEffect, useState } from 'react'

function modelTone(index) {
  return [
    'border-[#b8ece4] bg-[#ecfffb] text-[#086c61]',
    'border-[#f2d49a] bg-[#fff7e6] text-[#8a5a00]',
    'border-[#c9d3dd] bg-[#f6f9fb] text-[#34566f]',
  ][index % 3]
}

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

  function openOllamaDownload() {
    window.open('https://ollama.com/download', '_blank', 'noopener,noreferrer')
  }

  async function pull(model) {
    if (status && status.server_running === false) {
      setMessage('Ollama가 실행 중이 아닙니다. Ollama를 먼저 설치하거나 실행한 뒤 다시 시도하세요.')
      return
    }
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
  const serverReady = status?.server_running !== false

  return (
    <div className="relative rounded-md border border-[#E2E8F0] bg-white shadow-sm">
      <button onClick={() => setOpen(v => !v)}
        className="flex h-9 w-full items-center justify-between gap-3 px-3 text-left text-xs">
        <span className="flex items-center gap-2 font-medium text-[#1E293B]">
          <span className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-[#059669]' : serverReady ? 'bg-[#F59E0B]' : 'bg-[#94A3B8]'}`} />
          Local AI
        </span>
        <span className={`max-w-[8rem] truncate ${available ? 'text-[#059669]' : 'text-[#64748B]'}`}>
          {available ? status.model : '설정 필요'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 max-h-[34rem] w-[28rem] overflow-y-auto rounded-md border border-[#E2E8F0] bg-white p-4 text-xs text-[#475569] shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">Optional local engine</div>
              <h3 className="mt-1 text-sm font-semibold text-[#1E293B]">로컬 AI 설치</h3>
            </div>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-md border border-[#E2E8F0] px-2 py-1 text-[#64748B] hover:bg-[#F1F5F9]">
              닫기
            </button>
          </div>
          <div className="mb-3 flex items-center justify-between rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            <span className="text-[#64748B]">
              상태: {available ? `사용 가능 (${status.model})` : serverReady ? 'Ollama 실행됨, 모델 필요' : 'Ollama 실행 필요'}
            </span>
            <button type="button" onClick={refresh}
              className="rounded-md border border-[#E2E8F0] bg-white px-2 py-1 font-medium text-[#475569] hover:bg-[#F1F5F9]">
              새로고침
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Required</div>
              <div className="mt-1 font-semibold text-[#1E293B]">10GB+</div>
            </div>
            <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Default</div>
              <div className="mt-1 font-semibold text-[#1E293B]">20GB+</div>
            </div>
            <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Full set</div>
              <div className="mt-1 font-semibold text-[#1E293B]">40GB+</div>
            </div>
          </div>
          <p className="mt-3 leading-6">
            로컬 AI는 필수는 아니지만, 그림/다이어그램 근거 정리 품질을 올려줍니다.
            처음에는 Light 모델만 설치하고 필요할 때 Default나 Deep 모델을 추가하세요.
          </p>
          {status?.server_running === false && (
            <div className="mt-3 rounded-md border border-[#FDE68A] bg-[#FEFCE8] p-3 text-[#854D0E]">
              <div className="font-semibold text-[#713F12]">Ollama가 실행 중이 아닙니다.</div>
              <div className="mt-2 grid gap-2">
                <div className="rounded-md bg-white/70 p-2">
                  <div className="font-semibold text-[#713F12]">macOS</div>
                  <p className="mt-1 leading-6">Applications 폴더에서 Ollama 앱을 더블클릭하세요. 화면 위 메뉴 막대에 Ollama 아이콘이 보이면 실행 중입니다.</p>
                </div>
                <div className="rounded-md bg-white/70 p-2">
                  <div className="font-semibold text-[#713F12]">Windows</div>
                  <p className="mt-1 leading-6">시작 메뉴에서 Ollama를 검색해 실행하세요. 오른쪽 아래 작업표시줄 트레이에 Ollama 아이콘이 보이면 실행 중입니다.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={openOllamaDownload}
                  className="rounded-md bg-[#4F46E5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA]">
                  macOS/Windows 설치 파일 받기
                </button>
                <button type="button" onClick={refresh}
                  className="rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]">
                  실행 확인
                </button>
              </div>
              <details className="mt-3 rounded-md bg-white/70 px-2 py-1.5 text-[11px] text-[#713F12]">
                <summary className="cursor-pointer font-medium">고급 사용자용 터미널 대체 방법</summary>
                <div className="mt-1 font-mono">ollama serve</div>
              </details>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {(status?.recommended || []).map((item, index) => {
              const installed = status?.installed_models?.includes(item.name)
              const buttonLabel = installed ? '설치됨' : pulling === item.name ? '설치 중' : serverReady ? '설치' : '대기'
              return (
                <div key={item.name} className="rounded-md border border-[#E2E8F0] bg-white p-3 shadow-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[11px] font-semibold text-[#1E293B]" title={item.name}>
                        {item.name}
                      </div>
                      <div className="mt-1 text-[#64748B]">{item.role}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${modelTone(index)}`}>
                      {index === 0 ? 'Light' : index === 1 ? 'Default' : 'Deep'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-[#F8FAFC] px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Download</div>
                      <div className="mt-0.5 whitespace-nowrap font-medium text-[#1E293B]">
                        {item.download_size || '확인 필요'}
                      </div>
                    </div>
                    <div className="rounded-md bg-[#F8FAFC] px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Storage</div>
                      <div className="mt-0.5 whitespace-nowrap font-medium text-[#1E293B]">
                        {item.free_space || '10GB 이상'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[#64748B]">{item.target}</div>
                  <button onClick={() => pull(item.name)}
                    disabled={installed || !!pulling || !serverReady}
                    className="mt-3 flex h-8 w-full items-center justify-center rounded-md bg-[#4F46E5] px-3 text-xs font-medium text-white transition-colors hover:bg-[#4338CA] disabled:bg-[#CBD5E1] disabled:text-[#64748B]">
                    <span className="whitespace-nowrap">{buttonLabel}</span>
                  </button>
                </div>
              )
            })}
          </div>
          {message && <div className="mt-3 rounded-md bg-[#F8FAFC] px-3 py-2 text-[#475569]">{message}</div>}
          {!status?.installed_models?.length && (
            <div className="mt-3 text-[#64748B]">
              Ollama 앱이 설치되어 있지 않으면 먼저 Ollama가 필요합니다. 이후 모델 설치는 여기서 처리합니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
