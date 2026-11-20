import { useEffect, useRef, useState } from 'react'
import {
  leftRetractDown,
  leftExtendDown,
  leftStop,
  rightRetractDown,
  rightExtendDown,
  rightStop,
  setServo,
  estepsCalibration,
  setPulleyDiameter,
  getState,
} from '../api'
import { showAlert } from './AlertModal'
import { Button } from './Button'

type MotorDir = -1 | 0 | 1

// Servo angles as used by the firmware (src/pen.cpp): 90 = pen up (slowUp target), 0 = towards the wall
const SERVO_UP = 90
const SERVO_DOWN = 0

function MotorControl({ label, dir, onChange }: { label: string; dir: MotorDir; onChange: (d: MotorDir) => void }) {
  const btn = (d: MotorDir, text: string, activeClass: string) => (
    <button
      onClick={() => onChange(d)}
      className={`flex-1 rounded-xl px-3 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 ${
        dir === d ? activeClass : 'bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-gray-200'
      }`}
    >
      {text}
    </button>
  )
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">{label}</label>
        <span className="text-xs sm:text-sm text-gray-300">{dir === -1 ? 'retracting' : dir === 1 ? 'extending' : 'stopped'}</span>
      </div>
      <div className="flex gap-2">
        {btn(-1, '◀ Retract', 'bg-cyan-600 text-white')}
        {btn(0, '■ Stop', 'bg-gray-600 text-white ring-1 ring-gray-400')}
        {btn(1, 'Extend ▶', 'bg-cyan-600 text-white')}
      </div>
    </div>
  )
}

interface ToolsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ToolsModal({ isOpen, onClose }: ToolsModalProps) {
  const [leftMotor, setLeftMotor] = useState<MotorDir>(0)
  const [rightMotor, setRightMotor] = useState<MotorDir>(0)
  const [servoAngle, setServoAngle] = useState(70) // firmware boots the servo at 70° (src/pen.cpp)
  const servoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [extendDistance, setExtendDistance] = useState(1000)
  const [pulleyDiameter, setPulleyDiameterInput] = useState('')

  // Stop motors when modal closes
  useEffect(() => {
    if (!isOpen) {
      leftStop()
      rightStop()
      setLeftMotor(0)
      setRightMotor(0)
    }
  }, [isOpen])

  // Load the current pulley diameter whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      getState().then((s) => {
        if (s.pulleyDiameter !== undefined) setPulleyDiameterInput(String(s.pulleyDiameter))
      })
    }
  }, [isOpen])

  async function handlePulleyDiameterChange(value: string) {
    setPulleyDiameterInput(value)
    const parsed = Number(value)
    if (value.trim() === '' || isNaN(parsed) || parsed <= 0) return
    setPulleyDiameter(parsed)
  }

  function handleLeftMotor(d: MotorDir) {
    setLeftMotor(d)
    if (d === -1) leftRetractDown()
    else if (d === 1) leftExtendDown()
    else leftStop()
  }

  function handleRightMotor(d: MotorDir) {
    setRightMotor(d)
    if (d === -1) rightRetractDown()
    else if (d === 1) rightExtendDown()
    else rightStop()
  }

  // Also cancels a running e-steps extend — both use the same steppers
  function handleStopAll() {
    handleLeftMotor(0)
    handleRightMotor(0)
  }

  // Slider drags are debounced so the ESP isn't flooded with servo requests
  function handleServo(angle: number, immediate = false) {
    setServoAngle(angle)
    if (servoTimerRef.current) clearTimeout(servoTimerRef.current)
    if (immediate) setServo(angle)
    else servoTimerRef.current = setTimeout(() => setServo(angle), 150)
  }

  async function handleEstepsCalibration() {
    if (isNaN(extendDistance) || extendDistance <= 0) {
      await showAlert('Please enter a valid distance in millimeters')
      return
    }
    estepsCalibration(extendDistance)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md lg:max-w-lg max-h-full overflow-y-auto p-6 sm:p-8 space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-white">Tools</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <MotorControl label="Left Motor" dir={leftMotor} onChange={handleLeftMotor} />
        <MotorControl label="Right Motor" dir={rightMotor} onChange={handleRightMotor} />

        <Button onClick={handleStopAll} variant="danger">
          ■ Stop all motors
        </Button>

        <div className="space-y-2 border-t border-gray-700 pt-4">
          <div className="flex justify-between items-center">
            <label className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">Pen servo</label>
            <span className="text-xs sm:text-sm text-gray-300 font-mono">{servoAngle}°</span>
          </div>
          <input
            type="range"
            min={SERVO_DOWN}
            max={SERVO_UP}
            step={1}
            value={servoAngle}
            onChange={(e) => handleServo(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex gap-2">
            <Button onClick={() => handleServo(SERVO_UP, true)} variant="secondary">
              Pen up ({SERVO_UP}°)
            </Button>
            <Button onClick={() => handleServo(SERVO_DOWN, true)} variant="secondary">
              Pen down / park ({SERVO_DOWN}°)
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <div>
            <label className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">
              Pulley diameter
            </label>
            <p className="text-xs text-gray-500">for e-steps calibration</p>
          </div>
          <input
            type="number"
            step="any"
            value={pulleyDiameter}
            onChange={(e) => handlePulleyDiameterChange(e.target.value)}
            placeholder="e.g. 10.14926"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-600"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">
            E-steps calibration distance (mm)
          </label>
          <input
            type="number"
            value={extendDistance}
            onChange={(e) => setExtendDistance(Number(e.target.value))}
            placeholder="e.g. 1000"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-600"
          />
        </div>

        <Button onClick={handleEstepsCalibration} variant="secondary">
          Extend
        </Button>
        <p className="text-xs text-gray-500 -mt-3">Use “Stop all motors” to cancel.</p>

        <Button onClick={onClose} variant="primary">
          Close
        </Button>
      </div>
    </div>
  )
}
