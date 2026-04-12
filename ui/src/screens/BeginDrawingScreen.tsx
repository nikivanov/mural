import { useState } from 'react'
import { run, doneWithPhase } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

interface Props {
  onBegin: () => void
  onReset: (state: BackendState) => void
}

export function BeginDrawingScreen({ onBegin, onReset }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleBegin() {
    setBusy(true)
    await run()
    onBegin()
  }

  async function handleReset() {
    setBusy(true)
    await doneWithPhase()
    location.reload()
  }

  return (
    <Card
      title="Mural is Ready"
      subtitle="The drawing commands have been uploaded and verified."
    >
      <Button onClick={handleBegin} disabled={busy}>
        {busy ? 'Starting…' : 'Begin Drawing'}
      </Button>
      <Button variant="secondary" onClick={handleReset} disabled={busy}>
        Reset
      </Button>
    </Card>
  )
}
