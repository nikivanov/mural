import { useState, useEffect } from 'react'
import { run, doneWithPhase } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Slider } from '../components/Slider'

interface Props {
  onBegin: () => void
  onReset: (state: BackendState) => void
}

export function BeginDrawingScreen({ onBegin, onReset }: Props) {
  const [busy, setBusy] = useState(false)
  const [speed, setSpeed] = useState<number>(() =>
    parseInt(localStorage.getItem('muralSpeed') ?? '650', 10)
  )

  useEffect(() => {
    localStorage.setItem('muralSpeed', String(speed))
  }, [speed])

  async function handleBegin() {
    setBusy(true)
    await run(speed)
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
      <Slider label="Speed (steps/s)" min={300} max={2000} step={50} value={speed} onChange={setSpeed} />
      <p style={{ color: 'yellow', margin: '4px 0 8px', fontSize: '0.85em' }}>
        ⚠ Speed control is experimental. Use 650 for best results.
      </p>
      <Button onClick={handleBegin} disabled={busy}>
        {busy ? 'Starting…' : 'Begin Drawing'}
      </Button>
      <Button variant="secondary" onClick={handleReset} disabled={busy}>
        Reset
      </Button>
    </Card>
  )
}
