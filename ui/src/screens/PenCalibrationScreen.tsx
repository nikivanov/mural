import { useState, useEffect, useRef } from 'react'
import { setServo, setPenDistance, raiseBot, lowerBot } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Slider } from '../components/Slider'

interface Props {
  onDone: (state: BackendState) => void
}

// UI slider value (0–70) maps to servo angle as: servo = 70 - sliderValue
// When slider = 0 → servo = 70 (full up / retracted)
// When slider = 70 → servo = 0 (pen touching wall)
const STEP = 5

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

      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={() => handleMove('raise')}
          disabled={moving}
        >
          Raise
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleMove('lower')}
          disabled={moving}
        >
          Lower
        </Button>
      </div>

      <Button onClick={handleConfirm} disabled={busy}>
        {busy ? 'Saving…' : 'Pen is touching the wall'}
      </Button>
    </Card>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
