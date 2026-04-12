import type { BackendState, InfillDensity, RenderResult } from '../types'
import type { SvgState } from '../svgControl'

export type RendererParamValue = number | boolean | string

export type RendererParam =
  | {
      type: 'slider'
      id: string
      label: string
      min: number
      max: number
      step: number
      default: number
    }
  | { type: 'checkbox'; id: string; label: string; default: boolean }
  | {
      type: 'select'
      id: string
      label: string
      options: { value: string; label: string }[]
      default: string
    }

export interface ExecuteOpts {
  svgState: SvgState
  params: Record<string, RendererParamValue>
  backendState: BackendState
  onStatus: (status: string) => void
  worker: Worker
}

export interface RendererDefinition {
  id: string
  label: string
  description?: string
  params: RendererParam[]
  execute(opts: ExecuteOpts): Promise<RenderResult>
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

export const RENDERERS: RendererDefinition[] = [
  pathTracingRenderer,
  vectorRasterVectorRenderer,
  // Add new renderer definitions here — no other files need to change
]
