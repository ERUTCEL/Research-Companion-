import AddDocPanel from '../components/AddDocPanel'

export default function Onboarding({ backend, onComplete }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 space-y-6">

        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white">
            RC
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Research Companion</h1>
          <p className="text-gray-500 text-sm">
            Add papers and notes, then turn them into contribution gaps, project risks, and next-step decisions.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            Evidence
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            Contribution
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            Decision
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Add your research materials</p>
          <AddDocPanel backend={backend} onDone={onComplete} />
        </div>

        <button onClick={onComplete} className="w-full py-2 text-gray-400 text-sm hover:text-gray-600">
          Skip for now
        </button>

      </div>
    </div>
  )
}
