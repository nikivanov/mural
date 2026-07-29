import { rasterizeImage } from '../rasterControl'
import { computeImageBoundsMm, listenForRendererResult, type ExecuteOpts, type RendererDefinition } from './index'

async function execute({ imageState, params, backendState, onStatus, worker }: ExecuteOpts) {
  if (!imageState) throw new Error('rasterSpaceFill requires imageState')
  onStatus('Loading image')
  const imageData = await rasterizeImage(imageState)
  const resultPromise = listenForRendererResult(worker, onStatus)

  const { heightMm, imageLeft, imageTop, imageRight, imageBottom } = computeImageBoundsMm(imageState, imageData)

  worker.postMessage(
    {
      type: 'renderRasterSpaceFill',
      imageData,
      widthMm: imageState.width,
      heightMm,
      homeX: backendState.homeX ?? 0,
      homeY: backendState.homeY ?? 0,
      maxSpacing: Number(params['maxSpacing'] ?? 12),
      minSpacing: Number(params['minSpacing'] ?? 2),
      brightness: Number(params['brightness'] ?? 0),
      contrast: Number(params['contrast'] ?? 0),
      blackPoint: Number(params['blackPoint'] ?? 0) / 100,
      whitePoint: Number(params['whitePoint'] ?? 100) / 100,
      gamma: Number(params['gamma'] ?? 1.6),
      whiteCutoff: Number(params['whiteCutoff'] ?? 5) / 100,
      liftOnTransparent: Boolean(params['liftOnTransparent'] ?? false),
      imageLeft,
      imageTop,
      imageRight,
      imageBottom,
    },
    [imageData.data.buffer],
  )
  return resultPromise
}

export const rasterSpaceFillRenderer: RendererDefinition = {
  id: 'rasterSpaceFill',
  label: 'Space-Filling Curve',
  description: 'Single continuous curve that packs tighter where the image is darker — no pen lifts',
  inputType: 'raster',
  params: [
    { type: 'row', items: [
      { type: 'slider', id: 'maxSpacing', label: 'Max Spacing (mm)', min: 2, max: 30, step: 1, default: 12 },
      { type: 'slider', id: 'minSpacing', label: 'Min Spacing (mm)', min: 0.5, max: 5, step: 0.5, default: 2 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'brightness', label: 'Brightness', min: -100, max: 100, step: 5, default: 0 },
      { type: 'slider', id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 5, default: 0 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'blackPoint', label: 'Black Point', min: 0, max: 90, step: 5, default: 0 },
      { type: 'slider', id: 'whitePoint', label: 'White Point', min: 10, max: 100, step: 5, default: 100 },
      { type: 'slider', id: 'gamma', label: 'Gamma', min: 0.3, max: 3, step: 0.1, default: 1.6 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'whiteCutoff', label: 'White Cutoff (%)', min: 0, max: 50, step: 1, default: 5 },
      { type: 'checkbox', id: 'liftOnTransparent', label: 'Lift On Transparent', default: false },
    ]},
  ],
  execute,
}
