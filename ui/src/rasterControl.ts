import { type AffineTransform, DEFAULT_TRANSFORM } from './svgControl'

export type { AffineTransform }

const PREVIEW_SIZE = 800 // preview canvas width in px

export interface RasterImageState {
  /** Source File object */
  file: File
  /** Object URL for the raw file — call URL.revokeObjectURL on cleanup */
  previewUrl: string
  /** Drawing width in mm (= safeWidth from backend) */
  width: number
  /** Drawing height in mm (aspect-ratio scaled from naturalWidth/naturalHeight) */
  height: number
  /** Original image pixel width */
  naturalWidth: number
  /** Original image pixel height */
  naturalHeight: number
  /** Current pan/zoom/crop transform */
  transform: AffineTransform
}

/** Create a RasterImageState from an uploaded file */
export async function parseRasterImage(file: File, safeWidth: number): Promise<RasterImageState> {
  const bitmap = await createImageBitmap(file)
  const naturalWidth = bitmap.width
  const naturalHeight = bitmap.height
  bitmap.close()

  const height = (safeWidth / naturalWidth) * naturalHeight
  const previewUrl = URL.createObjectURL(file)

  return {
    file,
    previewUrl,
    width: safeWidth,
    height,
    naturalWidth,
    naturalHeight,
    transform: [...DEFAULT_TRANSFORM] as AffineTransform,
  }
}

/**
 * Render a transformed preview of the image. Returns a blob URL — caller must
 * revoke it when done (URL.revokeObjectURL).
 *
 * Transform semantics (same as SVG):
 *   t[0]/t[3] = scale (1 = image fills canvas exactly)
 *   t[4]      = x offset as fraction of canvas width  (positive = shift right)
 *   t[5]      = y offset as fraction of canvas height (positive = shift down)
 * Areas not covered by the image appear white (= blank canvas = no drawing).
 */
export async function getRasterPreviewDataUrl(state: RasterImageState): Promise<string> {
  const t = state.transform
  const W = PREVIEW_SIZE
  const H = Math.round(W * (state.height / state.width))

  const bitmap = await createImageBitmap(state.file)
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(bitmap, t[4] * W, t[5] * H, t[0] * W, t[3] * H)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  return URL.createObjectURL(blob)
}

/**
 * Render image to full-resolution ImageData for sending to the worker, with
 * the current transform applied (pan / zoom / crop).
 */
export async function rasterizeImage(state: RasterImageState): Promise<ImageData> {
  const t = state.transform
  const W = state.naturalWidth
  const H = state.naturalHeight

  const bitmap = await createImageBitmap(state.file)
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(bitmap, t[4] * W, t[5] * H, t[0] * W, t[3] * H)
  bitmap.close()

  return ctx.getImageData(0, 0, W, H)
}
