import { useState } from 'react'
import { setTopDistance } from '../api'
import type { BackendState } from '../types'
import { showAlert, showErrorAlert } from '../components/AlertModal'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { ActionBar } from '../components/ActionBar'
import { ToolsModal } from '../components/ToolsModal'
import { WallLayoutDiagram, hatchStyle, fmtMm } from '../components/WallLayoutDiagram'
import { computeWallLayout } from '../layoutGeometry'

interface Props {
  state?: BackendState
  onDone: (state: BackendState) => void
}

// Height of A-series paper relative to its width (portrait)
const A_SERIES_RATIO = Math.SQRT2

export function SetTopDistanceScreen({ state, onDone }: Props) {
  const [distance, setDistance] = useState(() =>
    state?.topDistance && state.topDistance > 0 ? String(state.topDistance) : '',
  )
  const [busy, setBusy] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)

  // Live layout preview — pure client-side maths, the ESP is not involved
  const dPins = parseInt(distance)
  const layout = !isNaN(dPins) && dPins > 0
    ? computeWallLayout(dPins, state?.safeXFraction, state?.safeYFraction)
    : null
  // The real height depends on the image; a square placeholder keeps the sketch readable
  const placeholderHeight = layout?.width ?? 0

  async function handleSet() {
    const val = parseInt(distance)
    if (isNaN(val) || val <= 0) {
      await showAlert('Please enter a valid distance in millimeters')
      return
    }
    setBusy(true)
    try {
      const state = await setTopDistance(val)
      onDone(state)
    } catch (err) {
      setBusy(false)
      await showErrorAlert(`Failed to set distance: ${err}`)
    }
  }

  return (
    <>
      <Card
        title="Distance Between Hangers"
        subtitle="Distance between the two nails on which you are hanging Mural, in millimeters"
        action={
          <button
            onClick={() => setToolsOpen(true)}
            className="w-11 h-11 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors text-2xl leading-none"
            aria-label="Open tools"
          >
            ⚙
          </button>
        }
      >
        <input
          type="number"
          inputMode="numeric"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="e.g. 1500"
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-600"
        />
        {layout && (
          <div className="space-y-2">
            <div
              className="relative w-full max-h-56 sm:max-h-72 short:max-h-36 overflow-hidden rounded-lg border border-gray-700 flex items-center justify-center"
              style={{ ...hatchStyle, containerType: 'size', aspectRatio: `${layout.dPins} / ${layout.marginTop + placeholderHeight}` }}
            >
              <WallLayoutDiagram
                dPins={layout.dPins}
                xFraction={state?.safeXFraction}
                yFraction={state?.safeYFraction}
                drawingHeight={placeholderHeight}
                heightLabel="H = ?"
              >
                <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">your image</div>
              </WallLayoutDiagram>
            </div>
            <p className="text-center text-xs text-gray-400">
              Drawing width <span className="text-gray-200 font-medium">{fmtMm(layout.width)}</span>
              {' '}· top margin <span className="text-gray-200 font-medium">{fmtMm(layout.marginTop)}</span>
              {' '}· side margins <span className="text-gray-200 font-medium">{fmtMm(layout.marginX)}</span>
            </p>
            <p className="text-center text-xs text-gray-500">
              Height follows the image, e.g. square {fmtMm(layout.width)}, A-series portrait {fmtMm(layout.width * A_SERIES_RATIO)}.
            </p>
          </div>
        )}
        <ActionBar>
          <Button onClick={handleSet} disabled={busy || !distance}>
            {busy ? 'Setting…' : 'Set distance'}
          </Button>
        </ActionBar>
      </Card>

      <ToolsModal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  )
}
