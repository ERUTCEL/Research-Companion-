export default function CitationCard({ citation }) {
  const { index, title, author, year, page, source_type, is_user_memo, parse_quality_warning } = citation

  const isNotion = source_type?.startsWith('notion') || is_user_memo
  const label = is_user_memo ? '내 메모' : '논문'
  const labelColor = is_user_memo
    ? 'bg-purple-100 text-purple-700'
    : 'bg-blue-100 text-blue-700'

  let meta = ''
  if (!is_user_memo) {
    if (author) meta += author
    if (year)   meta += (meta ? ', ' : '') + year
    if (page)   meta += (meta ? ', ' : '') + `p.${page}`
  }

  return (
    <div className="flex items-start gap-2.5 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
      <span className="text-xs font-bold text-gray-400 mt-0.5 w-4 shrink-0">[{index}]</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${labelColor}`}>{label}</span>
          {parse_quality_warning && (
            <span title="파싱 품질이 낮습니다 — 직접 확인 권장" className="text-xs">⚠️</span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{title || '(제목 없음)'}</p>
        {meta && <p className="text-xs text-gray-500 mt-0.5">{meta}</p>}
      </div>
    </div>
  )
}
