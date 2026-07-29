import { rasterizeImage } from '../rasterControl'
import { listenForRendererResult, type ExecuteOpts, type RendererDefinition } from './index'

async function execute({ imageState, params, backendState, onStatus, worker }: ExecuteOpts) {
  if (!imageState) throw new Error('rasterZigZag requires imageState')
  onStatus('Loading image')
  const imageData = await rasterizeImage(imageState)
  const resultPromise = listenForRendererResult(worker, onStatus)

  // Compute where the image content actually lives within the canvas (mm),
  // accounting for any pan/zoom/crop the user applied.
  // heightMm is derived from imageData pixel height to account for canvas expansion
  // when the image is shifted down (t[5] > 0).
  const t = imageState.transform
  const W = imageState.width
  const H = imageState.height
  const heightMm = imageData.height * (H / imageState.naturalHeight)
  const imageLeft   = Math.max(0, t[4] * W)
  const imageTop    = Math.max(0, t[5] * H)
  const imageRight  = Math.min(W, (t[4] + t[0]) * W)
  const imageBottom = Math.min(heightMm, (t[5] + t[3]) * H)

  worker.postMessage(
    {
      type: 'renderRasterZigZag',
      imageData,
      widthMm: imageState.width,
      heightMm,
      homeX: backendState.homeX ?? 0,
      homeY: backendState.homeY ?? 0,
      lineSpacing: Number(params['lineSpacing'] ?? 8),
      amplitude: Number(params['amplitude'] ?? 3),
      brightness: Number(params['brightness'] ?? 0),
      contrast: Number(params['contrast'] ?? 0),
      blackPoint: Number(params['blackPoint'] ?? 0) / 100,
      whitePoint: Number(params['whitePoint'] ?? 100) / 100,
      angle: Number(params['angle'] ?? 0),
      continuousPath: Boolean(params['continuousPath'] ?? false),
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

export const rasterZigZagRenderer: RendererDefinition = {
  id: 'rasterZigZag',
  label: 'Raster Zig-Zag',
  description: 'Converts a photo to zig-zag scan lines — darker areas = taller zig-zags',
  inputType: 'raster',
  params: [
    { type: 'row', items: [
      { type: 'slider', id: 'lineSpacing', label: 'Spacing (mm)', min: 1, max: 20, step: 1, default: 5 },
      { type: 'slider', id: 'amplitude', label: 'Amplitude (mm)', min: 0.5, max: 10, step: 0.5, default: 3.5 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'brightness', label: 'Brightness', min: -100, max: 100, step: 5, default: 0 },
      { type: 'slider', id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 5, default: 0 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'blackPoint', label: 'Black Point', min: 0, max: 90, step: 5, default: 0 },
      { type: 'slider', id: 'whitePoint', label: 'White Point', min: 10, max: 100, step: 5, default: 100 },
    ]},
    { type: 'row', items: [
      { type: 'slider', id: 'angle', label: 'Angle (°)', min: -90, max: 90, step: 15, default: 45 },
      { type: 'checkbox', id: 'liftOnTransparent', label: 'Lift On Transparent', default: false },
      { type: 'checkbox', id: 'continuousPath', label: 'Link Scan Lines', default: true },
    ]},
  ],
  execute,
}
