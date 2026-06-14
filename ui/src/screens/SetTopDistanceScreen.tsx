import { useState } from 'react'
import { setTopDistance } from '../api'
import type { BackendState } from '../types'
import { showAlert, showErrorAlert } from '../components/AlertModal'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { ToolsModal } from '../components/ToolsModal'

interface Props {
  onDone: (state: BackendState) => void
}

export function SetTopDistanceScreen({ onDone }: Props) {
  const [distance, setDistance] = useState('')
  const [busy, setBusy] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)

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
      {/* Gear icon trigger */}
      <button
        onClick={() => setToolsOpen(true)}
        className="fixed top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors text-2xl leading-none z-10"
        aria-label="Open tools"
      >
        ⚙
      </button>

      <Card
        title="Distance Between Hangers"
        subtitle="Distance between the two nails on which you are hanging Mural, in millimeters"
      >
        <input
          type="number"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="e.g. 1500"
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-600"
        />
        <Button onClick={handleSet} disabled={busy || !distance}>
          {busy ? 'Setting…' : 'Set distance'}
        </Button>
      </Card>

      <ToolsModal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  )
}
