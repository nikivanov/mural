import { rasterizeImage } from '../rasterControl'
import { computeImageBoundsMm, listenForRendererResult, type ExecuteOpts, type RendererDefinition } from './index'

async function execute({ imageState, params, backendState, onStatus, worker }: ExecuteOpts) {
  if (!imageState) throw new Error('finiteCurve requires imageState')
  onStatus('Loading image')
  const imageData = await rasterizeImage(imageState)
  const resultPromise = listenForRendererResult(worker, onStatus)

  const { heightMm } = computeImageBoundsMm(imageState, imageData)

  worker.postMessage(
    {
      type: 'renderFiniteCurve',
      imageData,
      widthMm: imageState.width,
      heightMm,
      homeX: backendState.homeX ?? 0,
      homeY: backendState.homeY ?? 0,
      resolution: Number(params['resolution'] ?? 45),
      contrast: Number(params['contrast'] ?? 50),
      whiteCutoff: Number(params['whiteCutoff'] ?? 240),
      invert: Boolean(params['invert'] ?? false),
    },
    [imageData.data.buffer],
  )
  return resultPromise
}

export const finiteCurveRenderer: RendererDefinition = {
  id: 'finiteCurve',
  label: 'Finitecurve.com',
  description: 'One continuous stippled line, denser where the image is darker',
  inputType: 'raster',
  params: [
    { type: 'row', items: [
      { type: 'slider', id: 'resolution', label: 'Resolution', min: 30, max: 100, step: 1, default: 45 },
      { type: 'slider', id: 'contrast', label: 'Contrast', min: 0, max: 100, step: 1, default: 50 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'whiteCutoff', label: 'White Cutoff', min: 0, max: 255, step: 1, default: 240 },
      { type: 'checkbox', id: 'invert', label: 'Invert', default: false },
    ]},
  ],
  execute,
}
