import type { RendererDefinition } from '../renderers/index'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

interface Props {
  renderers: RendererDefinition[]
  onChoose: (renderer: RendererDefinition) => void
  onBack: () => void
}

export function ChooseRendererScreen({ renderers, onChoose, onBack }: Props) {
  return (
    <Card title="Choose Render Type">
      <div className="space-y-3">
        {renderers.map((r) => (
          <button
            key={r.id}
            onClick={() => onChoose(r)}
            className="w-full rounded-xl px-5 py-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 transition-all text-center"
          >
            <p className="text-base font-semibold text-white">{r.label}</p>
            {r.description && (
              <p className="text-sm text-slate-400 mt-1">{r.description}</p>
            )}
          </button>
        ))}
      </div>
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Card>
  )
}
