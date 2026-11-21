import { useState, useEffect, useRef } from 'react'
import { setServo, setPenDistance, raiseBot, lowerBot } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { ActionBar } from '../components/ActionBar'
import { Slider } from '../components/Slider'

interface Props {
  onDone: (state: BackendState) => void
}

// UI slider value (0–70) maps to servo angle as: servo = 70 - sliderValue
// When slider = 0 → servo = 70 (full up / retracted)
// When slider = 70 → servo = 0 (pen touching wall)
const STEP = 5
// Must match PEN_CAL_STEP_MM in src/phases/pencalibrationphase.cpp
const MOVE_STEP_MM = 100

function toServoAngle(sliderVal: number) {
  return Math.max(0, Math.min(70, 70 - sliderVal))
}

export function PenCalibrationScreen({ onDone }: Props) {
  const [sliderVal, setSliderVal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [moving, setMoving] = useState(false)
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCallRef = useRef(0)

  // Park servo at max angle on mount
  useEffect(() => {
    setServo(70)
  }, [])

  function handleSliderChange(val: number) {
    setSliderVal(val)
    // Throttle to ~250ms
    const now = Date.now()
    if (now - lastCallRef.current >= 250) {
      lastCallRef.current = now
      setServo(toServoAngle(val))
    } else {
      if (throttleRef.current) clearTimeout(throttleRef.current)
      throttleRef.current = setTimeout(() => {
        lastCallRef.current = Date.now()
        setServo(toServoAngle(val))
      }, 250)
    }
  }

  async function handleMove(direction: 'raise' | 'lower') {
    setMoving(true)
    try {
      const seconds = await (direction === 'raise' ? raiseBot() : lowerBot())
      await delay(seconds * 1000)
    } catch {
      // ignore
    }
    setMoving(false)
  }

  async function handleConfirm() {
    setBusy(true)
    const state = await setPenDistance(toServoAngle(sliderVal))
    onDone(state)
  }

  return (
    <Card
      title="Pen Calibration"
      subtitle="Insert the pen so it's close to, but not touching the wall and secure it with a bolt. Then, adjust the pen position so the pen is touching the wall."
    >
      <Slider
        label="Pen position"
        min={0}
        max={70}
        value={sliderVal}
        onChange={handleSliderChange}
      />

      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={() => handleSliderChange(Math.max(0, sliderVal - STEP))}
          className="text-xl"
        >
          −
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleSliderChange(Math.min(70, sliderVal + STEP))}
          className="text-xl"
        >
          +
        </Button>
      </div>

      <div className="space-y-2 border-t border-gray-700 pt-4">
        <div className="flex justify-between items-center">
          <label className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">Move Mural on the wall</label>
          {moving && <span className="text-xs sm:text-sm text-cyan-400">moving…</span>}
        </div>
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
          Moves the <span className="text-gray-300">whole device</span> up or down along the belts by {MOVE_STEP_MM / 10} cm,
          e.g. to reach a spot that's comfortable for adjusting the pen. It does not move the pen.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => handleMove('raise')}
            disabled={moving}
          >
            ▲ Up
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleMove('lower')}
            disabled={moving}
          >
            ▼ Down
          </Button>
        </div>
      </div>

      <ActionBar>
        <Button onClick={handleConfirm} disabled={busy}>
          {busy ? 'Saving…' : 'Pen is touching the wall'}
        </Button>
      </ActionBar>
    </Card>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
