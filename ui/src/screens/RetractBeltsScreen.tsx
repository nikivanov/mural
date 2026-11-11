import { useState } from 'react'
import { leftRetractDown, leftStop, rightRetractDown, rightStop, doneWithPhase } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Toggle } from '../components/Toggle'
import { Button } from '../components/Button'

interface Props {
  onDone: (state: BackendState) => void
}

export function RetractBeltsScreen({ onDone }: Props) {
  const [leftOn, setLeftOn] = useState(false)
  const [rightOn, setRightOn] = useState(false)
  const [busy, setBusy] = useState(false)

  function handleLeft(on: boolean) {
    setLeftOn(on)
    on ? leftRetractDown() : leftStop()
  }

  function handleRight(on: boolean) {
    setRightOn(on)
    on ? rightRetractDown() : rightStop()
  }

  async function handleDone() {
    setBusy(true)
    await leftStop()
    await rightStop()
    const state = await doneWithPhase()
    onDone(state)
  }

  return (
    <Card
      title="Retract Belts"
      subtitle="Place the belt loops on the homing screws and retract the belts until the motors stall. Don't let the motors stall for too long."
    >
      <div className="space-y-4">
        <Toggle label="Left motor" checked={leftOn} onChange={handleLeft} />
        <Toggle label="Right motor" checked={rightOn} onChange={handleRight} />
      </div>
      <Button onClick={handleDone} disabled={busy}>
        {busy ? 'Working…' : 'Belts are retracted'}
      </Button>
    </Card>
  )
}
