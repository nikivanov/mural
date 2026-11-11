import { useState, useRef, useCallback, useEffect } from 'react'
import type { BackendState, RenderResult } from '../types'
import type { SvgState } from '../svgControl'
import type { RasterImageState } from '../rasterControl'
import type { RendererDefinition, RendererParamValue } from '../renderers/index'

export interface WorkerRendererState {
  isRendering: boolean
  status: string
  result: RenderResult | null
}

export function useWorkerRenderer() {
  const [state, setState] = useState<WorkerRendererState>({
    isRendering: false,
    status: '',
    result: null,
  })
  const workerRef = useRef<Worker | null>(null)

  const render = useCallback(
    async (
      renderer: RendererDefinition,
      inputState: { svgState?: SvgState; imageState?: RasterImageState },
      params: Record<string, RendererParamValue>,
      backendState: BackendState,
    ) => {
      if (workerRef.current) {
        workerRef.current.terminate()
      }

      setState({ isRendering: true, status: '', result: null })

      const worker = new Worker(`./worker/worker.js?v=${Date.now()}`)
      workerRef.current = worker

      try {
        const result = await renderer.execute({
          svgState: inputState.svgState,
          imageState: inputState.imageState,
          params,
          backendState,
          onStatus: (status) => setState((s) => ({ ...s, status })),
          worker,
        })
        setState({ isRendering: false, status: 'Done', result })
      } catch (err) {
        console.error('Render failed:', err)
        setState({ isRendering: false, status: 'Error', result: null })
      }
    },
    [],
  )

  // Terminate worker on unmount
  useEffect(() => {
    return () => workerRef.current?.terminate()
  }, [])

  return { render, ...state }
}
