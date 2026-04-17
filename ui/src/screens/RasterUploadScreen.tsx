import { useState, useEffect, useRef } from 'react'
import type { BackendState } from '../types'
import { parseRasterImage, type RasterImageState } from '../rasterControl'
import { showAlert } from '../components/AlertModal'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

interface Props {
  state: BackendState
  onPreview: (imageState: RasterImageState) => void
  onBack: () => void
}

export function RasterUploadScreen({ state, onPreview, onBack }: Props) {
  const [imageState, setImageState] = useState<RasterImageState | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Revoke previous object URL when imageState changes or component unmounts
  useEffect(() => {
    return () => {
      if (imageState) URL.revokeObjectURL(imageState.previewUrl)
    }
  }, [imageState])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setImageState(null)
      return
    }
    try {
      const parsed = await parseRasterImage(file, state.safeWidth ?? 1000)
      setImageState(parsed)
    } catch (err) {
      await showAlert(`Failed to load image: ${err}`)
    }
  }

  return (
    <Card title="Select Raster Image" subtitle="Use high-contrast images for best results">
      {imageState && (
        <img
          src={imageState.previewUrl}
          alt="Image preview"
          className="w-full rounded-lg border border-slate-700 object-contain max-h-56 sm:max-h-72 lg:max-h-96 2xl:max-h-[60vh]"
        />
      )}

      {imageState && (
        <p className="text-center text-xs text-slate-400">
          {imageState.naturalWidth} × {imageState.naturalHeight}px →{' '}
          <span className="text-slate-200">
            {imageState.width.toFixed(0)} × {imageState.height.toFixed(0)} mm
          </span>
        </p>
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
