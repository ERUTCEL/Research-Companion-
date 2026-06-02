const CONFIG = {
  high:      { dot: 'bg-green-500',  label: '높음',   text: 'text-green-700',  bg: 'bg-green-50'  },
  medium:    { dot: 'bg-yellow-400', label: '보통',   text: 'text-yellow-700', bg: 'bg-yellow-50' },
  low:       { dot: 'bg-orange-400', label: '낮음',   text: 'text-orange-700', bg: 'bg-orange-50' },
  no_source: { dot: 'bg-gray-400',   label: '없음',   text: 'text-gray-500',   bg: 'bg-gray-50'   },
}

export default function ConfidenceBadge({ confidence }) {
  const c = CONFIG[confidence] ?? CONFIG.no_source
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      출처 신뢰도 {c.label}
    </span>
  )
}
