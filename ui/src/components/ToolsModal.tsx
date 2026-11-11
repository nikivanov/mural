import { useEffect, useState } from 'react'
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

interface ToolsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ToolsModal({ isOpen, onClose }: ToolsModalProps) {
  const [leftMotor, setLeftMotor] = useState(0)
  const [rightMotor, setRightMotor] = useState(0)
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

  function handleLeftMotor(v: number) {
    setLeftMotor(v)
    if (v <= -1) leftRetractDown()
    else if (v >= 1) leftExtendDown()
    else leftStop()
  }

  function handleRightMotor(v: number) {
    setRightMotor(v)
    if (v <= -1) rightRetractDown()
    else if (v >= 1) rightExtendDown()
    else rightStop()
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
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md lg:max-w-lg p-6 sm:p-8 space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-white">Tools</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">Left Motor</label>
            <span className="text-xs sm:text-sm text-gray-300 font-mono">{leftMotor}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={1}
            value={leftMotor}
            onChange={(e) => handleLeftMotor(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs sm:text-sm text-gray-400 uppercase tracking-wide">Right Motor</label>
            <span className="text-xs sm:text-sm text-gray-300 font-mono">{rightMotor}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={1}
            value={rightMotor}
            onChange={(e) => handleRightMotor(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>

        <Button onClick={() => setServo(0)} variant="secondary">
          Park Servo
        </Button>

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

        <Button onClick={onClose} variant="primary">
          Close
        </Button>
      </div>
    </div>
  )
}
