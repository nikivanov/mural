import { useState, useEffect } from 'react'
import type { BackendState } from '../types'
import type { SvgState } from '../svgControl'
import type { RasterImageState } from '../rasterControl'
import { jsonToPreviewDataUrl } from '../svgControl'
import { type RendererDefinition, type RendererParamLeaf, type RendererParamValue } from '../renderers/index'
import { useWorkerRenderer } from '../hooks/useWorkerRenderer'
import { Card } from '../components/Card'
import { Slider } from '../components/Slider'
import { Button } from '../components/Button'


interface Props {
  state: BackendState
  svgState?: SvgState
  imageState?: RasterImageState
  renderer: RendererDefinition
  onAccept: (commands: string) => void
  onBack: () => void
}

function defaultParams(renderer: RendererDefinition): Record<string, RendererParamValue> {
  const p: Record<string, RendererParamValue> = {}
  for (const param of renderer.params) {
    if (param.type === 'row') {
      for (const item of param.items) p[item.id] = item.default
    } else {
      p[param.id] = param.default
    }
  }
  return p
}

function renderLeaf(
  param: RendererParamLeaf,
  params: Record<string, RendererParamValue>,
  onChange: (id: string, value: RendererParamValue) => void,
) {
  if (param.type === 'slider') {
    return (
      <Slider
        id={param.id}
        label={param.label}
        min={param.min}
        max={param.max}
        step={param.step}
        value={Number(params[param.id] ?? param.default)}
        onChange={(v) => onChange(param.id, v)}
      />
    )
  }
  if (param.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(params[param.id] ?? param.default)}
          onChange={(e) => onChange(param.id, e.target.checked)}
          className="w-4 h-4 rounded accent-indigo-500 shrink-0"
        />
        <span className="text-sm text-slate-300 leading-tight">{param.label}</span>
      </label>
    )
  }
  if (param.type === 'select') {
    return (
      <div className="space-y-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">{param.label}</label>
        <select
          value={String(params[param.id] ?? param.default)}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {param.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    )
  }
  return null
}

export function DrawingPreviewScreen({ state, svgState, imageState, renderer, onAccept, onBack }: Props) {
  const [params, setParams] = useState<Record<string, RendererParamValue>>(() =>
    defaultParams(renderer),
  )
  const { render, isRendering, status, result } = useWorkerRenderer()

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [enlarged, setEnlarged] = useState(false)

  const previewWidth = svgState?.width ?? imageState!.width
  const previewHeight = svgState?.baseHeight ?? imageState!.height

  // Trigger initial render
  useEffect(() => {
    triggerRender(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Generate preview data URL when result arrives
  useEffect(() => {
    if (result) {
      const url = jsonToPreviewDataUrl(result.svgJson, previewWidth, previewHeight)
      setPreviewUrl(url)
    }
  }, [result, previewWidth, previewHeight])

  function triggerRender(p: Record<string, RendererParamValue>) {
    render(renderer, { svgState, imageState }, p, state)
  }

  function handleParamChange(id: string, value: RendererParamValue) {
    let newParams = { ...params, [id]: value }
    if (id === 'trimWhite' && value === true) newParams = { ...newParams, continuousPath: false }
    if (id === 'continuousPath' && value === true) newParams = { ...newParams, trimWhite: false }
    setParams(newParams)
    triggerRender(newParams)
  }

  function handleAccept() {
    if (!result) return
    onAccept(result.commands.join('\n'))
  }

  return (
    <Card title="Drawing Preview">
      <div className="relative w-full">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Render preview"
            onClick={() => { if (!isRendering) setEnlarged(true) }}
            className={`w-full rounded-lg border border-slate-700 object-contain max-h-56 sm:max-h-72 lg:max-h-96 2xl:max-h-[60vh] transition-opacity duration-150 ${isRendering ? 'opacity-40 cursor-wait' : 'opacity-100 cursor-zoom-in'}`}
          />
        ) : (
          <div className="w-full aspect-video rounded-lg bg-slate-800 border border-slate-700" />
        )}
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {enlarged && previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 cursor-zoom-out"
          onClick={() => setEnlarged(false)}
        >
          <img
            src={previewUrl}
            alt="Render preview enlarged"
            className="w-full h-full rounded-lg object-contain"
          />
        </div>
      )}

      {/* Status row — always present to prevent layout shift */}
      <p className="text-center text-xs 2xl:text-sm text-slate-400 min-h-[1rem]">
        {isRendering
          ? (status || 'Rendering…')
          : result
          ? <>
              Total:{' '}
              <span className="text-slate-200 font-medium">{(result.distance / 1000).toFixed(1)}m</span>
              {' '}/ Draw:{' '}
              <span className="text-slate-200 font-medium">{(result.drawDistance / 1000).toFixed(1)}m</span>
            </>
          : null}
      </p>

      {/* Dynamic renderer params */}
      <div className="space-y-4">
        {renderer.params.map((param, idx) => {
          if (param.type === 'row') {
            return (
              <div key={idx} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${param.items.length}, 1fr)` }}>
                {param.items.map((item) => (
                  <div key={item.id} className={item.type === 'checkbox' ? 'flex items-end pb-1' : ''}>
                    {renderLeaf(item, params, handleParamChange)}
                  </div>
                ))}
              </div>
            )
          }
          return (
            <div key={'id' in param ? param.id : idx}>
              {renderLeaf(param, params, handleParamChange)}
            </div>
          )
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
