import type { BackendState, InfillDensity, RenderResult } from '../types'
import type { SvgState } from '../svgControl'
import type { RasterImageState } from '../rasterControl'

export type RendererParamValue = number | boolean | string

export type RendererParamLeaf =
  | {
      type: 'slider'
      id: string
      label: string
      min: number
      max: number
      step: number
      default: number
      disabledWhen?: { id: string; value: RendererParamValue }
    }
  | { type: 'checkbox'; id: string; label: string; default: boolean; disabledWhen?: { id: string; value: RendererParamValue } }
  | {
      type: 'select'
      id: string
      label: string
      options: { value: string; label: string }[]
      default: string
    }

export type RendererParam =
  | RendererParamLeaf
  | { type: 'row'; items: RendererParamLeaf[] }

export interface ExecuteOpts {
  svgState?: SvgState
  imageState?: RasterImageState
  params: Record<string, RendererParamValue>
  backendState: BackendState
  onStatus: (status: string) => void
  worker: Worker
}

export interface RendererDefinition {
  id: string
  label: string
  description?: string
  inputType: 'svg' | 'raster' | 'testPattern'
  params: RendererParam[]
  execute(opts: ExecuteOpts): Promise<RenderResult>
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Compute where the image content actually lives within the canvas (mm),
 * accounting for any pan/zoom/crop the user applied.
 * heightMm is derived from imageData pixel height to account for canvas expansion
 * when the image is shifted down (t[5] > 0).
 */
export function computeImageBoundsMm(imageState: RasterImageState, imageData: ImageData) {
  const t = imageState.transform
  const W = imageState.width
  const H = imageState.height
  const heightMm = imageData.height * (H / imageState.naturalHeight)
  return {
    heightMm,
    imageLeft: Math.max(0, t[4] * W),
    imageTop: Math.max(0, t[5] * H),
    imageRight: Math.min(W, (t[4] + t[0]) * W),
    imageBottom: Math.min(heightMm, (t[5] + t[3]) * H),
  }
}

export function getInfillDensity(params: Record<string, RendererParamValue>): InfillDensity {
  const v = Number(params['infillDensity'] ?? 0)
  if (v === 0 || v === 1 || v === 2 || v === 3 || v === 4) return v
  throw new Error('Invalid infill density')
}

export function listenForRendererResult(
  worker: Worker,
  onStatus: (s: string) => void,
): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data as { type: string; payload: unknown }
      if (type === 'status') onStatus(payload as string)
      else if (type === 'renderer') resolve(payload as RenderResult)
      else if (type === 'log') console.log(`Worker: ${payload}`)
    }
    worker.onerror = (e) => reject(e)
  })
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

import { pathTracingRenderer } from './pathTracing'
import { vectorRasterVectorRenderer } from './vectorRasterVector'
import { rasterZigZagRenderer } from './rasterZigZag'
import { finiteCurveRenderer } from './finiteCurve'
import { testPatternRenderer } from './testPattern'

export const RENDERERS: RendererDefinition[] = [
  pathTracingRenderer,
  vectorRasterVectorRenderer,
  rasterZigZagRenderer,
  finiteCurveRenderer,
  testPatternRenderer,
]

export function getRenderersByInputType(type: 'svg' | 'raster' | 'testPattern'): RendererDefinition[] {
  return RENDERERS.filter((r) => r.inputType === type)
}
