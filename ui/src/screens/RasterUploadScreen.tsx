import { useState, useEffect, useRef } from 'react'
import type { BackendState } from '../types'
import { parseRasterImage, getRasterPreviewDataUrl, type RasterImageState } from '../rasterControl'
import { nudge, zoom, transformText, type AffineTransform } from '../svgControl'
import { showAlert } from '../components/AlertModal'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { DPad } from '../components/DPad'

interface Props {
  state: BackendState
  initialState?: RasterImageState
  onPreview: (imageState: RasterImageState) => void
  onBack: () => void
}

export function RasterUploadScreen({ state, initialState, onPreview, onBack }: Props) {
  const [imageState, setImageState] = useState<RasterImageState | null>(initialState ?? null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [txText, setTxText] = useState(initialState ? transformText(initialState.transform) : '')
  const fileRef = useRef<HTMLInputElement>(null)

  // Revoke raw file object URL when imageState changes or component unmounts
  useEffect(() => {
    return () => {
      if (imageState) URL.revokeObjectURL(imageState.previewUrl)
    }
  }, [imageState])

  // Regenerate transformed preview whenever imageState changes
  useEffect(() => {
    if (!imageState) {
      setPreviewDataUrl(null)
      return
    }

    let cancelled = false
    let blobUrl: string | null = null

    getRasterPreviewDataUrl(imageState).then((url) => {
      if (cancelled) {
        URL.revokeObjectURL(url)
      } else {
        setPreviewDataUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
        blobUrl = url
      }
    })

    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [imageState])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setImageState(null)
      setTxText('')
      return
    }
    try {
      const parsed = await parseRasterImage(file, state.safeWidth ?? 1000)
      setImageState(parsed)
      setTxText(transformText(parsed.transform))
    } catch (err) {
      await showAlert(`Failed to load image: ${err}`)
    }
  }

  function applyTransform(t: AffineTransform) {
    if (!imageState) return
    setImageState({ ...imageState, transform: t })
    setTxText(transformText(t))
  }

  function handleNudge(dir: Parameters<typeof nudge>[0]) {
    if (!imageState) return
    applyTransform(nudge(dir, imageState.transform))
  }

  function handleZoom(dir: Parameters<typeof zoom>[0]) {
    if (!imageState) return
    applyTransform(zoom(dir, imageState.transform))
  }

  return (
    <Card title="Select Raster Image" subtitle="Use high-contrast images for best results">
      {previewDataUrl && (
        <img
          src={previewDataUrl}
          alt="Image preview"
          className="w-full rounded-lg border border-slate-700 object-contain max-h-56 sm:max-h-72 lg:max-h-96 2xl:max-h-[60vh]"
        />
      )}

      {imageState && (
        <>
          <div className="flex justify-center py-1">
            <DPad onNudge={handleNudge} onZoom={handleZoom} transformText={txText} />
          </div>
          <p className="text-center text-xs text-slate-400">
            {imageState.naturalWidth} × {imageState.naturalHeight}px →{' '}
            <span className="text-slate-200">
              {imageState.width.toFixed(0)} × {imageState.height.toFixed(0)} mm
            </span>
          </p>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg"
        onChange={handleFileChange}
        className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 cursor-pointer"
      />

      <Button onClick={() => imageState && onPreview(imageState)} disabled={!imageState}>
        Preview drawing
      </Button>
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Card>
  )
}
