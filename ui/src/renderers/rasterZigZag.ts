import { rasterizeImage } from '../rasterControl'
import { listenForRendererResult, type ExecuteOpts, type RendererDefinition } from './index'

async function execute({ imageState, params, backendState, onStatus, worker }: ExecuteOpts) {
  if (!imageState) throw new Error('rasterZigZag requires imageState')
  onStatus('Loading image')
  const imageData = await rasterizeImage(imageState)
  const resultPromise = listenForRendererResult(worker, onStatus)
  worker.postMessage(
    {
      type: 'renderRasterZigZag',
      imageData,
      widthMm: imageState.width,
      heightMm: imageState.height,
      homeX: backendState.homeX ?? 0,
      homeY: backendState.homeY ?? 0,
      lineSpacing: Number(params['lineSpacing'] ?? 8),
      amplitude: Number(params['amplitude'] ?? 3),
      brightness: Number(params['brightness'] ?? 0),
      contrast: Number(params['contrast'] ?? 0),
      angle: Number(params['angle'] ?? 0),
      continuousPath: Boolean(params['continuousPath'] ?? false),
      trimWhite: Boolean(params['trimWhite'] ?? false),
    },
    [imageData.data.buffer],
  )
  return resultPromise
}

export const rasterZigZagRenderer: RendererDefinition = {
  id: 'rasterZigZag',
  label: 'Raster Zig-Zag',
  description: 'Converts a photo to zig-zag scan lines — darker areas = taller zig-zags',
  params: [
    { type: 'row', items: [
      { type: 'slider', id: 'lineSpacing', label: 'Spacing (mm)', min: 1, max: 20, step: 1, default: 8 },
      { type: 'slider', id: 'amplitude', label: 'Amplitude (mm)', min: 0.5, max: 10, step: 0.5, default: 3 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'brightness', label: 'Brightness', min: -100, max: 100, step: 5, default: 0 },
      { type: 'slider', id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 5, default: 0 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'angle', label: 'Angle (°)', min: -90, max: 90, step: 15, default: 0 },
      { type: 'checkbox', id: 'trimWhite', label: 'Trim White Lines', default: false },
      { type: 'checkbox', id: 'continuousPath', label: 'No Pen Lift', default: false },
    ]},
  ],
  execute,
}
