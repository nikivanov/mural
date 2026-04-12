import { rasterizeSvg, svgStringToJson, RENDER_SCALE } from '../svgControl'
import {
  getInfillDensity,
  listenForRendererResult,
  type RendererDefinition,
  type ExecuteOpts,
} from './index'
import type { RenderResult } from '../types'

async function execute({ svgState, params, backendState, onStatus, worker }: ExecuteOpts): Promise<RenderResult> {
  // Step 1: Rasterize SVG → ImageData
  onStatus('Rasterizing')
  const raster = await rasterizeSvg(svgState)

  // Step 2: Vectorize (ImageData → SVG string via Potrace)
  const vectorizedSvg = await new Promise<string>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data as { type: string; payload: unknown }
      if (type === 'status') onStatus(payload as string)
      else if (type === 'vectorizer') resolve((payload as { svg: string }).svg)
      else if (type === 'log') console.log(`Worker: ${payload}`)
    }
    worker.onerror = (e) => reject(e)
    worker.postMessage({
      type: 'vectorize',
      raster,
      turdSize: Number(params['turdSize'] ?? 2),
    })
  })

  // Step 3: Render vectorized SVG → commands
  onStatus('Preparing vectorized SVG')
  const svgJson = svgStringToJson(vectorizedSvg)

  const resultPromise = listenForRendererResult(worker, onStatus)

  worker.postMessage({
    type: 'renderSvg',
    svgJson,
    width: svgState.width,
    height: svgState.baseHeight,
    svgWidth: svgState.width * RENDER_SCALE,
    svgHeight: svgState.baseHeight * RENDER_SCALE,
    homeX: backendState.homeX ?? 0,
    homeY: backendState.homeY ?? 0,
    infillDensity: getInfillDensity(params),
    flattenPaths: false,
  })

  return resultPromise
}

export const vectorRasterVectorRenderer: RendererDefinition = {
  id: 'vectorRasterVector',
  label: 'Vector → Raster → Vector',
  description: 'Preserves stroke width',
  params: [
    { type: 'slider', id: 'infillDensity', label: 'Infill Density', min: 0, max: 4, step: 1, default: 0 },
    {
      type: 'slider',
      id: 'turdSize',
      label: 'Despeckle',
      min: 2,
      max: 200,
      step: 11,
      default: 2,
    },
  ],
  execute,
}
