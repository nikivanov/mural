import { useState, useRef } from 'react'
import type { BackendState } from '../types'
import { parseSvg, nudge, zoom, getPreviewDataUrl, transformText, type SvgState, type AffineTransform, DEFAULT_TRANSFORM } from '../svgControl'
import { showAlert } from '../components/AlertModal'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { DPad } from '../components/DPad'

interface Props {
  state: BackendState
  onPreview: (svgState: SvgState) => void
}

export function SvgUploadScreen({ state, onPreview }: Props) {
  const [svgState, setSvgState] = useState<SvgState | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [txText, setTxText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function applyTransform(doc: SvgState['originalDoc'], width: number, baseHeight: number, t: AffineTransform) {
    const newState: SvgState = { originalDoc: doc, width, baseHeight, transform: t }
    const { dataUrl } = getPreviewDataUrl(newState)
    setSvgState(newState)
    setPreviewUrl(dataUrl)
    setTxText(transformText(t))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setSvgState(null)
      setPreviewUrl(null)
      return
    }
    try {
      const svgString = await file.text()
      const parsed = parseSvg(svgString, state.safeWidth ?? 1000)
      const { dataUrl } = getPreviewDataUrl(parsed)
      setSvgState(parsed)
      setPreviewUrl(dataUrl)
      setTxText(transformText(DEFAULT_TRANSFORM))
    } catch (err) {
      await showAlert(`Failed to parse SVG: ${err}`)
    }
  }

  function handleNudge(dir: Parameters<typeof nudge>[0]) {
    if (!svgState) return
    const t = nudge(dir, svgState.transform)
    applyTransform(svgState.originalDoc, svgState.width, svgState.baseHeight, t)
  }

  function handleZoom(dir: Parameters<typeof zoom>[0]) {
    if (!svgState) return
    const t = zoom(dir, svgState.transform)
    applyTransform(svgState.originalDoc, svgState.width, svgState.baseHeight, t)
  }

  return (
    <Card title="Select SVG Image" subtitle="Use black and white line art SVGs for best results">
      {previewUrl && (
        <img
          src={previewUrl}
          alt="SVG preview"
          className="w-full rounded-lg border border-slate-700 object-contain max-h-56 sm:max-h-72 lg:max-h-96"
        />
      )}

      {svgState && (
        <div className="flex justify-center py-1">
          <DPad onNudge={handleNudge} onZoom={handleZoom} transformText={txText} />
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".svg"
        onChange={handleFileChange}
        className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 cursor-pointer"
      />

      <Button
        onClick={() => svgState && onPreview(svgState)}
        disabled={!svgState}
      >
        Preview drawing
      </Button>
    </Card>
  )
}
