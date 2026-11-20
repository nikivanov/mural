import { useEffect, useRef, useState } from 'react'
import { leftRetractDown, leftStop, rightRetractDown, rightStop, doneWithPhase } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { ActionBar } from '../components/ActionBar'

interface Props {
  onDone: (state: BackendState) => void
}

/** Length of a "Nudge" pulse [ms] */
const NUDGE_MS = 300
/** Safety net: a continuously running motor stops by itself after this time [ms] */
const AUTO_STOP_MS = 15000

type MotorMode = 'idle' | 'running' | 'nudge'

function MotorJog({ label, retract, stop }: {
  label: string
  retract: () => Promise<void>
  stop: () => Promise<void>
}) {
  const [mode, setMode] = useState<MotorMode>('idle')
  const [elapsed, setElapsed] = useState(0)
  const timer = useRef<number>()
  const ticker = useRef<number>()
  // The browser may send parallel requests over several connections, so a quick
  // run → stop could arrive at the ESP in the wrong order. Chain them instead.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const send = (cmd: () => Promise<void>) => {
    const p = queue.current.then(cmd).catch(() => {})
    queue.current = p
    return p
  }

  // Bumped on every action so a late nudge timer can't stop a newer run
  const gen = useRef(0)

  const clearTimers = () => {
    gen.current++
    window.clearTimeout(timer.current)
    window.clearInterval(ticker.current)
  }

  const halt = () => {
    clearTimers()
    setMode('idle')
    send(stop)
  }

  const toggleRun = () => {
    if (mode === 'running') return halt()
    clearTimers()
    setMode('running')
    setElapsed(0)
    const start = Date.now()
    ticker.current = window.setInterval(() => setElapsed(Date.now() - start), 100)
    timer.current = window.setTimeout(halt, AUTO_STOP_MS)
    send(retract)
  }

  const nudge = () => {
    clearTimers()
    setMode('nudge')
    const g = gen.current
    // Start the pulse timer only once the run command has reached the ESP
    send(retract).then(() => {
      if (g === gen.current) timer.current = window.setTimeout(halt, NUDGE_MS)
    })
  }

  // Never leave a motor running when the screen goes away
  useEffect(() => () => {
    clearTimers()
    stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const running = mode === 'running'
  const status = running ? `retracting… ${(elapsed / 1000).toFixed(1)} s` : mode === 'nudge' ? 'nudge' : 'stopped'

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-gray-200 font-medium">{label}</span>
        <span className={`text-xs tabular-nums ${mode === 'idle' ? 'text-gray-500' : 'text-cyan-400'}`}>{status}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleRun}
          aria-pressed={running}
          className={`flex-1 min-h-14 rounded-xl font-medium select-none touch-manipulation transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
            running
              ? 'bg-red-700 active:bg-red-800 text-white'
              : 'bg-cyan-600 active:bg-cyan-700 text-white'
          }`}
        >
          {running ? '■ Stop' : '▶ Retract'}
        </button>
        <button
          type="button"
          onClick={nudge}
          disabled={running}
          className="w-28 min-h-14 rounded-xl font-medium select-none touch-manipulation bg-gray-700 active:bg-gray-800 text-gray-200 disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
        >
          Nudge
        </button>
      </div>
    </div>
  )
}

export function RetractBeltsScreen({ onDone }: Props) {
  const [busy, setBusy] = useState(false)

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
      <div className="space-y-5">
        <MotorJog label="Left motor" retract={leftRetractDown} stop={leftStop} />
        <MotorJog label="Right motor" retract={rightRetractDown} stop={rightStop} />
      </div>
      <p className="text-xs text-gray-500">
        Tap <span className="text-gray-300">Retract</span> to run continuously and again to stop (stops by itself
        after {AUTO_STOP_MS / 1000} s). <span className="text-gray-300">Nudge</span> runs the motor for a moment —
        tap repeatedly to tighten the last bit.
      </p>
      <ActionBar>
        <Button onClick={handleDone} disabled={busy}>
          {busy ? 'Working…' : 'Belts are retracted'}
        </Button>
      </ActionBar>
    </Card>
  )
}
