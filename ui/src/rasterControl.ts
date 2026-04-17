export interface RasterImageState {
  /** Source File object */
  file: File
  /** Object URL for preview — call URL.revokeObjectURL on cleanup */
  previewUrl: string
  /** Drawing width in mm (= safeWidth from backend) */
  width: number
  /** Drawing height in mm (aspect-ratio scaled from naturalWidth/naturalHeight) */
  height: number
  /** Original image pixel width */
  naturalWidth: number
  /** Original image pixel height */
  naturalHeight: number
}

/** Create a RasterImageState from an uploaded file */
export async function parseRasterImage(file: File, safeWidth: number): Promise<RasterImageState> {
  const bitmap = await createImageBitmap(file)
  const naturalWidth = bitmap.width
  const naturalHeight = bitmap.height
  bitmap.close()

  const height = (safeWidth / naturalWidth) * naturalHeight
  const previewUrl = URL.createObjectURL(file)

  return { file, previewUrl, width: safeWidth, height, naturalWidth, naturalHeight }
}

/** Render image to full-resolution ImageData for sending to the worker */
export async function rasterizeImage(state: RasterImageState): Promise<ImageData> {
  const bitmap = await createImageBitmap(state.file)
  const canvas = new OffscreenCanvas(state.naturalWidth, state.naturalHeight)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, state.naturalWidth, state.naturalHeight)
  bitmap.close()
  return ctx.getImageData(0, 0, state.naturalWidth, state.naturalHeight)
}
