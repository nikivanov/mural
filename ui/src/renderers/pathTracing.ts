import { svgStringToJson, getTransformedSvgString } from '../svgControl'
import {
  getInfillDensity,
  listenForRendererResult,
  type RendererDefinition,
  type ExecuteOpts,
} from './index'

async function execute({ svgState, params, backendState, onStatus, worker }: ExecuteOpts) {
  const svgString = getTransformedSvgString(svgState)
  onStatus('Preparing SVG')
  const svgJson = svgStringToJson(svgString)

  const resultPromise = listenForRendererResult(worker, onStatus)

  worker.postMessage({
    type: 'renderSvg',
    svgJson,
    width: svgState.width,
    height: svgState.baseHeight,
    svgWidth: svgState.width,
    svgHeight: svgState.baseHeight,
    homeX: backendState.homeX ?? 0,
    homeY: backendState.homeY ?? 0,
    infillDensity: getInfillDensity(params),
    flattenPaths: Boolean(params['flattenPaths']),
  })

  return resultPromise
}

export const pathTracingRenderer: RendererDefinition = {
  id: 'pathTracing',
  label: 'Path Tracing',
  description: 'Works well for most drawings',
  params: [
    { type: 'slider', id: 'infillDensity', label: 'Infill Density', min: 0, max: 4, step: 1, default: 0 },
    { type: 'checkbox', id: 'flattenPaths', label: 'Flatten paths', default: false },
  ],
  execute,
}
