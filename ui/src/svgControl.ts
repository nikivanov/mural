import paper from 'paper'

export const RENDER_SCALE = 2

const TRANSFORM_GROUP_ID = 'muralTransformGroup'
const NUDGE_FACTOR = 0.025
const ZOOM_FACTOR = 0.05

export type AffineTransform = [number, number, number, number, number, number]
export const DEFAULT_TRANSFORM: AffineTransform = [1, 0, 0, 1, 0, 0]

export interface SvgState {
  /** Parsed + normalized SVG document. Has width/height attrs set and muralTransformGroup added. */
  originalDoc: Document
  /** Target drawing width in mm (= safeWidth from backend) */
  width: number
  /** Computed height from aspect ratio */
  baseHeight: number
  /** Current affine transform */
  transform: AffineTransform
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseSvg(svgString: string, safeWidth: number): SvgState {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const svgEl = doc.documentElement
  let w: number | undefined, h: number | undefined

  if (svgEl.hasAttribute('width') && svgEl.hasAttribute('height')) {
    w = convertUnitsToPx(svgEl.getAttribute('width')!)
    h = convertUnitsToPx(svgEl.getAttribute('height')!)
  }

  if (svgEl.hasAttribute('viewBox')) {
    if (!w || !h) {
      const vb = svgEl.getAttribute('viewBox')!.split(/[\s,]+/).filter(Boolean)
      w = parseFloat(vb[2])
      h = parseFloat(vb[3])
    }
  } else if (w && h) {
    svgEl.setAttribute('viewBox', `0, 0, ${w}, ${h}`)
  }

  if (!w || !h) throw new Error('Invalid SVG: could not determine dimensions')

  const baseHeight = (safeWidth / w) * h
  svgEl.setAttribute('width', String(safeWidth))
  svgEl.setAttribute('height', String(baseHeight))

  // Wrap all content in a transform group
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  group.id = TRANSFORM_GROUP_ID
  while (svgEl.firstChild) group.appendChild(svgEl.firstChild)
  svgEl.appendChild(group)

  return { originalDoc: doc, width: safeWidth, baseHeight, transform: DEFAULT_TRANSFORM }
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export function nudge(
  dir: 'up' | 'down' | 'left' | 'right',
  t: AffineTransform,
): AffineTransform {
  const n = [...t] as AffineTransform
  switch (dir) {
    case 'up':    n[5] -= NUDGE_FACTOR; break
    case 'down':  n[5] += NUDGE_FACTOR; break
    case 'left':  n[4] -= NUDGE_FACTOR; break
    case 'right': n[4] += NUDGE_FACTOR; break
  }
  return n
}

export function zoom(
  dir: 'in' | 'out' | 'reset',
  t: AffineTransform,
): AffineTransform {
  const n = [...t] as AffineTransform
  switch (dir) {
    case 'in':
      n[0] += ZOOM_FACTOR; n[3] += ZOOM_FACTOR; break
    case 'out':
      n[0] -= ZOOM_FACTOR; n[3] -= ZOOM_FACTOR; break
    case 'reset':
      return [...DEFAULT_TRANSFORM] as AffineTransform
  }
  return n
}

export function transformText(t: AffineTransform): string {
  const fix = (n: number) => +(n.toFixed(2))
  return `(${fix(t[4] * 100)}, ${fix(t[5] * 100)}) ${fix(t[0])}x`
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function makeTransformedDoc(state: SvgState): { doc: Document; renderedHeight: number } {
  const clone = state.originalDoc.cloneNode(true) as Document
  const svgEl = clone.documentElement
  const vb = svgEl.getAttribute('viewBox')!.split(/[\s,]+/).filter(Boolean)
  const vbW = parseFloat(vb[2])
  const vbH = parseFloat(vb[3])

  const scaled = [...state.transform] as AffineTransform
  scaled[4] = scaled[4] * vbW

  let renderedHeight = parseFloat(svgEl.getAttribute('height')!)

  if (scaled[5] > 0) {
    const heightOffset = scaled[5] * renderedHeight
    renderedHeight = renderedHeight + heightOffset
    svgEl.setAttribute('height', String(renderedHeight))
    scaled[5] = scaled[5] * vbH
    const newVbH = vbH + scaled[5]
    svgEl.setAttribute('viewBox', `${vb[0]}, ${vb[1]}, ${vb[2]}, ${newVbH}`)
  } else {
    scaled[5] = scaled[5] * vbH
  }

  const group = clone.getElementById(TRANSFORM_GROUP_ID)!
  group.setAttribute('transform', `matrix(${scaled.join(', ')})`)

  return { doc: clone, renderedHeight }
}

/** Returns a data URL for SVG preview and the current rendered height */
export function getPreviewDataUrl(state: SvgState): { dataUrl: string; renderedHeight: number } {
  const { doc, renderedHeight } = makeTransformedDoc(state)
  const svgEl = doc.documentElement
  const bg = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', 'white')
  svgEl.insertBefore(bg, svgEl.firstChild)
  const svgStr = new XMLSerializer().serializeToString(doc)
  const dataUrl = `data:image/svg+xml;base64,${btoa(svgStr)}`
  return { dataUrl, renderedHeight }
}

/** Returns the transformed SVG serialized as a string (for path-tracing renderer) */
export function getTransformedSvgString(state: SvgState): string {
  const { doc } = makeTransformedDoc(state)
  return new XMLSerializer().serializeToString(doc)
}

/** Rasterizes the SVG to ImageData at 2× scale (for vector-raster-vector renderer) */
export async function rasterizeSvg(state: SvgState): Promise<ImageData> {
  const scaledW = state.width * RENDER_SCALE
  const { doc } = makeTransformedDoc(state)
  const svgStr = new XMLSerializer().serializeToString(doc)
  const { renderedHeight } = makeTransformedDoc(state)
  const scaledH = renderedHeight * RENDER_SCALE

  const dataUrl = `data:image/svg+xml;base64,${btoa(svgStr)}`
  const canvas = new OffscreenCanvas(scaledW, scaledH)
  const ctx = canvas.getContext('2d')!

  const img = await loadImage(dataUrl)
  const bitmap = await createImageBitmap(img, { resizeWidth: scaledW, resizeHeight: scaledH })
  ctx.drawImage(bitmap, 0, 0, scaledW, scaledH)

  return ctx.getImageData(0, 0, scaledW, scaledH)
}

// ---------------------------------------------------------------------------
// Paper.js helpers
// ---------------------------------------------------------------------------

/** Converts an SVG string to Paper.js JSON using an isolated scope */
export function svgStringToJson(svgString: string): string {
  const scope = new paper.PaperScope()
  scope.setup({ width: 10000, height: 10000 } as paper.Size)
  const svg = scope.project.importSVG(svgString, {
    expandShapes: true,
    applyMatrix: true,
  })
  const json = svg.exportJSON()
  scope.project.clear()
  return json
}

/** Converts Paper.js JSON back to a canvas data URL for preview.
 *  penWidthMm: physical pen stroke width — used to set correct stroke thickness and
 *  upscale the canvas so thin strokes remain visible. Defaults to 1mm. */
export function jsonToPreviewDataUrl(json: string, width: number, height: number, penWidthMm = 1): string {
  // Scale canvas up so that penWidthMm renders as at least 1.5px
  const scale = Math.min(3, Math.max(1, 1.5 / penWidthMm))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(width  * scale)
  canvas.height = Math.round(height * scale)
  canvas.style.display = 'none'
  document.body.appendChild(canvas)

  const scope = new paper.PaperScope()
  scope.setup(canvas)
  // Scale the view so the drawing fills the upscaled canvas
  scope.view.zoom = scale
  scope.view.center = new paper.Point(width / 2, height / 2)
  scope.project.importJSON(json)
  // Override stroke width to match actual pen so ink coverage per area is correct
  scope.project.getItems({ match: (item: any) => item.strokeColor != null })
    .forEach((item: any) => { item.strokeWidth = penWidthMm })
  ;(scope.view as unknown as { draw(): void }).draw()
  const dataUrl = canvas.toDataURL()

  scope.project.clear()
  document.body.removeChild(canvas)
  return dataUrl
}

// ---------------------------------------------------------------------------
// Internal utils
// ---------------------------------------------------------------------------

function convertUnitsToPx(dimension: string): number {
  const factors: Record<string, number> = {
    pt: 1.3333, pc: 16, in: 96, cm: 37.795, mm: 3.7795, px: 1,
  }
  const match = dimension.match(/([\d.]+)([a-z%]*)/i)
  if (!match) throw new Error(`Invalid dimension: "${dimension}"`)
  const value = parseFloat(match[1])
  const unit = match[2] || 'px'
  return value * (factors[unit] ?? 1)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
