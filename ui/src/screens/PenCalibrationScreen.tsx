import { useState, useEffect, useRef, useCallback } from 'react'
import { setServo, setPenDistance, sendJog } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Slider } from '../components/Slider'
import { Thumbstick } from '../components/Thumbstick'

interface Props {
  onDone: (state: BackendState) => void
}

// UI slider value (0–90) maps to servo angle as: servo = 90 - sliderValue
// When slider = 0 → servo = 90 (full up / retracted)
// When slider = 90 → servo = 0 (pen touching wall)
const STEP = 5

function toServoAngle(sliderVal: number) {
  return Math.max(0, Math.min(90, 90 - sliderVal))
}

export function PenCalibrationScreen({ onDone }: Props) {
  const [sliderVal, setSliderVal] = useState(0)
  const [busy, setBusy] = useState(false)
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCallRef = useRef(0)

  // Park servo at max angle on mount
  useEffect(() => {
    setServo(90)
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

  const handleJog = useCallback((vx: number, vy: number) => {
    sendJog(vx, vy).catch(() => {})
  }, [])

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
        max={90}
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
          onClick={() => handleSliderChange(Math.min(90, sliderVal + STEP))}
          className="text-xl"
        >
          +
        </Button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Thumbstick onJog={handleJog} />
        <p className="text-xs text-gray-500">Drag to move the robot</p>
      </div>

      <Button onClick={handleConfirm} disabled={busy}>
        {busy ? 'Saving…' : 'Pen is touching the wall'}
      </Button>
    </Card>
  )
}
