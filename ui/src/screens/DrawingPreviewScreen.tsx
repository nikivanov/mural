import { useState, useEffect } from 'react'
import type { BackendState } from '../types'
import type { SvgState } from '../svgControl'
import { jsonToPreviewDataUrl } from '../svgControl'
import { type RendererDefinition, type RendererParamValue } from '../renderers/index'
import { useWorkerRenderer } from '../hooks/useWorkerRenderer'
import { Card } from '../components/Card'
import { Slider } from '../components/Slider'
import { Button } from '../components/Button'
import { ProgressBar } from '../components/ProgressBar'

interface Props {
  state: BackendState
  svgState: SvgState
  renderer: RendererDefinition
  onAccept: (commands: string) => void
  onBack: () => void
}

function defaultParams(renderer: RendererDefinition): Record<string, RendererParamValue> {
  const p: Record<string, RendererParamValue> = {}
  for (const param of renderer.params) {
    p[param.id] = param.default
  }
  return p
}

export function DrawingPreviewScreen({ state, svgState, renderer, onAccept, onBack }: Props) {
  const [params, setParams] = useState<Record<string, RendererParamValue>>(() =>
    defaultParams(renderer),
  )
  const { render, isRendering, status, result } = useWorkerRenderer()

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Trigger initial render
  useEffect(() => {
    triggerRender(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Generate preview data URL when result arrives
  useEffect(() => {
    if (result) {
      const url = jsonToPreviewDataUrl(result.svgJson, svgState.width, svgState.baseHeight)
      setPreviewUrl(url)
    }
  }, [result, svgState.width, svgState.baseHeight])

  function triggerRender(p: Record<string, RendererParamValue>) {
    setPreviewUrl(null)
    render(renderer, svgState, p, state)
  }

  function handleParamChange(id: string, value: RendererParamValue) {
    const newParams = { ...params, [id]: value }
    setParams(newParams)
    triggerRender(newParams)
  }

  function handleAccept() {
    if (!result) return
    onAccept(result.commands.join('\n'))
  }

  return (
    <Card title="Drawing Preview">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Render preview"
          className="w-full rounded-lg border border-slate-700 object-contain max-h-56 sm:max-h-72 lg:max-h-96"
        />
      ) : (
        <div className="w-full aspect-video rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Render progress */}
      {isRendering && (
        <ProgressBar value={100} animated label={status || 'Rendering…'} />
      )}

      {/* Distance stats */}
      {result && !isRendering && (
        <p className="text-center text-xs text-slate-400">
          Total:{' '}
          <span className="text-slate-200 font-medium">
            {(result.distance / 1000).toFixed(1)}m
          </span>{' '}
          / Draw:{' '}
          <span className="text-slate-200 font-medium">
            {(result.drawDistance / 1000).toFixed(1)}m
          </span>
        </p>
      )}

      {/* Dynamic renderer params */}
      <div className="space-y-4">
        {renderer.params.map((param) => {
          if (param.type === 'slider') {
            return (
              <Slider
                key={param.id}
                id={param.id}
                label={param.label}
                min={param.min}
                max={param.max}
                step={param.step}
                value={Number(params[param.id] ?? param.default)}
                onChange={(v) => handleParamChange(param.id, v)}
              />
            )
          }
          if (param.type === 'checkbox') {
            return (
              <label key={param.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(params[param.id] ?? param.default)}
                  onChange={(e) => handleParamChange(param.id, e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-500"
                />
                <span className="text-sm text-slate-300">{param.label}</span>
              </label>
            )
          }
          if (param.type === 'select') {
            return (
              <div key={param.id} className="space-y-1">
                <label className="text-xs text-slate-400 uppercase tracking-wide">
                  {param.label}
                </label>
                <select
                  value={String(params[param.id] ?? param.default)}
                  onChange={(e) => handleParamChange(param.id, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {param.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          return null
        })}
      </div>

      <Button onClick={handleAccept} disabled={!result || isRendering}>
        Accept
      </Button>
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Card>
  )
}
