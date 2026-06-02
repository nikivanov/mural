import { useState, useEffect } from 'react'
import type { BackendState } from '../types'
import type { SvgState } from '../svgControl'
import type { RasterImageState } from '../rasterControl'
import { jsonToPreviewDataUrl } from '../svgControl'
import { compressCommands } from '../commandCompression'
import { type RendererDefinition, type RendererParamLeaf, type RendererParamValue } from '../renderers/index'
import { useWorkerRenderer } from '../hooks/useWorkerRenderer'
import { Card } from '../components/Card'
import { Slider } from '../components/Slider'
import { Button } from '../components/Button'


const hatchStyle: React.CSSProperties = {
  backgroundColor: '#111',
  backgroundImage: [
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 0, transparent 50%)',
    'repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 0, transparent 50%)',
  ].join(', '),
  backgroundSize: '8px 8px',
}

interface Props {
  state: BackendState
  svgState?: SvgState
  imageState?: RasterImageState
  renderer: RendererDefinition
  onAccept: (blob: Blob) => void
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
    const disabled = param.disabledWhen ? params[param.disabledWhen.id] === param.disabledWhen.value : false
    return (
      <Slider
        id={param.id}
        label={param.label}
        min={param.min}
        max={param.max}
        step={param.step}
        value={Number(params[param.id] ?? param.default)}
        onChange={(v) => onChange(param.id, v)}
        disabled={disabled}
      />
    )
  }
  if (param.type === 'checkbox') {
    const disabled = param.disabledWhen ? params[param.disabledWhen.id] === param.disabledWhen.value : false
    return (
      <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
        <input
          type="checkbox"
          checked={Boolean(params[param.id] ?? param.default)}
          onChange={(e) => onChange(param.id, e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded accent-cyan-500 shrink-0"
        />
        <span className="text-sm text-gray-300 leading-tight">{param.label}</span>
      </label>
    )
  }
  if (param.type === 'select') {
    return (
      <div className="space-y-1">
        <label className="text-xs text-gray-400 uppercase tracking-wide">{param.label}</label>
        <select
          value={String(params[param.id] ?? param.default)}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
  const [params, setParams] = useState<Record<string, RendererParamValue>>(() => {
    const defaults = defaultParams(renderer)
    try {
      const saved = localStorage.getItem(`muralParams_${renderer.id}`)
      if (saved) return { ...defaults, ...JSON.parse(saved) }
    } catch {}
    return defaults
  })
  const { render, isRendering, status, result } = useWorkerRenderer()

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [enlarged, setEnlarged] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [penWidthMm, setPenWidthMm] = useState<number>(() =>
    parseFloat(localStorage.getItem('muralPenWidthMm') ?? '1.5'),
  )
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null)

  const previewWidth = svgState?.width ?? imageState!.width
  const previewHeight = svgState?.baseHeight ?? imageState!.height

  // Context-view geometry (only valid when topDistance is known)
  const topDist = (state.topDistance && state.topDistance > 0) ? state.topDistance : null
  const ctxOffsetX = topDist ? topDist * state.safeXFraction : 0
  const ctxOffsetY = topDist ? topDist * state.safeYFraction : 0
  const ctxTotalH = ctxOffsetY + previewHeight
  const ctxDrawingLeftPct  = topDist ? (ctxOffsetX / topDist) * 100 : 0
  const ctxDrawingTopPct   = topDist ? (ctxOffsetY / ctxTotalH) * 100 : 0
  const ctxDrawingWidthPct = topDist ? (previewWidth / topDist) * 100 : 100
  const ctxDrawingHeightPct = topDist ? (previewHeight / ctxTotalH) * 100 : 100

  const contextActive = showContext && !!topDist && !!previewUrl

  // Trigger initial render
  useEffect(() => {
    triggerRender(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(`muralParams_${renderer.id}`, JSON.stringify(params))
  }, [params, renderer.id])

  useEffect(() => {
    localStorage.setItem('muralPenWidthMm', String(penWidthMm))
  }, [penWidthMm])

  // Generate preview data URL when result or pen width changes
  useEffect(() => {
    if (result) {
      const url = jsonToPreviewDataUrl(result.svgJson, previewWidth, previewHeight, penWidthMm)
      setPreviewUrl(url)
    }
  }, [result, previewWidth, previewHeight, penWidthMm])

  // Compress result once — blob is reused for upload, size drives the thermometer.
  // Don't clear the stale blob while re-rendering; the Accept button is already
  // disabled via isRendering, so showing the old size avoids a layout shift that
  // scrolls the page on every slider drag.
  useEffect(() => {
    if (!result) return
    let stale = false
    compressCommands(result.commands.join('\n')).then((blob) => {
      if (!stale) setCompressedBlob(blob)
    })
    return () => { stale = true }
  }, [result])

  function triggerRender(p: Record<string, RendererParamValue>) {
    render(renderer, { svgState, imageState }, p, state)
  }

  function handleParamChange(id: string, value: RendererParamValue) {
    let newParams = { ...params, [id]: value }
    setParams(newParams)
    triggerRender(newParams)
  }

  function handleAccept() {
    if (!compressedBlob) return
    onAccept(compressedBlob)
  }

  function handleReset() {
    const defaults = defaultParams(renderer)
    setParams(defaults)
    triggerRender(defaults)
  }

  const contextDrawingStyle: React.CSSProperties = {
    position: 'absolute',
    left:   `${ctxDrawingLeftPct}%`,
    top:    `${ctxDrawingTopPct}%`,
    width:  `${ctxDrawingWidthPct}%`,
    height: `${ctxDrawingHeightPct}%`,
  }

  return (
    <Card title="Drawing Preview">
      {/* Preview area — height is pinned to the drawing's own aspect ratio so toggling context view doesn't cause a scroll jump */}
      <div
        className="relative w-full max-h-56 sm:max-h-72 lg:max-h-96 2xl:max-h-[60vh] overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
        style={{ aspectRatio: `${previewWidth} / ${previewHeight}` }}
      >
        {contextActive ? (
          <div
            className={`absolute inset-0 flex items-center justify-center ${isRendering ? 'cursor-wait' : 'cursor-zoom-in'}`}
            style={hatchStyle}
            onClick={() => { if (!isRendering) setEnlarged(true) }}
          >
            {/* Canvas context — scaled to fit the stable container */}
            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: `${topDist} / ${ctxTotalH}`, maxHeight: '100%' }}
            >
              {/* Safe-area dashed outline */}
              <div className="absolute border border-dashed border-gray-600 pointer-events-none z-10" style={contextDrawingStyle} />
              {/* Motor pulley dots */}
              <div className="absolute w-2.5 h-2.5 rounded-full bg-gray-500 -translate-x-1/2 -translate-y-1/2" style={{ left: '0%', top: '0%' }} />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-gray-500 translate-x-1/2 -translate-y-1/2" style={{ right: '0%', top: '0%' }} />
              {/* Drawing image */}
              <img
                src={previewUrl!}
                alt="Render preview"
                className={`transition-opacity duration-150 ${isRendering ? 'opacity-40' : 'opacity-100'}`}
                style={contextDrawingStyle}
              />
            </div>
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="w-8 h-8 border-2 border-gray-600 border-t-cyan-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Render preview"
                onClick={() => { if (!isRendering) setEnlarged(true) }}
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-150 ${isRendering ? 'opacity-40 cursor-wait' : 'opacity-100 cursor-zoom-in'}`}
              />
            )}
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-8 border-2 border-gray-600 border-t-cyan-500 rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Enlarged modal */}
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
      <p className="text-center text-xs 2xl:text-sm text-gray-400 min-h-[1rem]">
        {isRendering
          ? (status || 'Rendering…')
          : result
          ? <>
              Total:{' '}
              <span className="text-gray-200 font-medium">{(result.distance / 1000).toFixed(1)}m</span>
              {' '}/ Draw:{' '}
              <span className="text-gray-200 font-medium">{(result.drawDistance / 1000).toFixed(1)}m</span>
              {' '}/ Lifts:{' '}
              <span className="text-gray-200 font-medium">{result.penLiftCount}</span>
            </>
          : null}
      </p>

      {/* Canvas context toggle + reset */}
      <div className="flex items-center justify-between">
        {topDist && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showContext}
              onChange={(e) => setShowContext(e.target.checked)}
              className="w-4 h-4 rounded accent-cyan-500 shrink-0"
            />
            <span className="text-sm text-gray-300">Show in canvas area</span>
          </label>
        )}
        <button
          onClick={handleReset}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors ml-auto"
        >
          Reset
        </button>
      </div>

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

      <div className="border-t border-gray-700 pt-3">
        <Slider
          label="Pen width (mm) — preview only"
          min={0.5}
          max={2}
          step={0.1}
          value={penWidthMm}
          onChange={setPenWidthMm}
        />
      </div>

      {compressedBlob !== null && (() => {
        const MAX_KB = state.freeKb ?? 2600
        const WARN_KB = Math.round(MAX_KB * 0.8)
        const sizeKb = Math.round(compressedBlob.size / 1024)
        const pct = Math.min(100, (sizeKb / MAX_KB) * 100)
        const barColor = sizeKb >= MAX_KB ? 'bg-red-500' : sizeKb >= WARN_KB ? 'bg-yellow-400' : 'bg-emerald-500'
        const labelColor = sizeKb >= MAX_KB ? 'text-red-400' : sizeKb >= WARN_KB ? 'text-yellow-400' : 'text-gray-400'
        return (
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <p className={`text-xs ${labelColor}`}>Upload size</p>
              <p className={`text-xs font-medium ${labelColor}`}>{sizeKb} / {MAX_KB} kb</p>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            {sizeKb >= MAX_KB && (
              <p className="text-xs text-red-400">Warning: upload exceeds device storage. Drawing may fail.</p>
            )}
          </div>
        )
      })()}

      <Button onClick={handleAccept} disabled={!compressedBlob || isRendering}>
        Accept
      </Button>
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Card>
  )
}
