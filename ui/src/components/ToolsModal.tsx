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
} from '../api'
import { Button } from './Button'

interface ToolsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ToolsModal({ isOpen, onClose }: ToolsModalProps) {
  const [leftMotor, setLeftMotor] = useState(0)
  const [rightMotor, setRightMotor] = useState(0)

  // Stop motors when modal closes
  useEffect(() => {
    if (!isOpen) {
      leftStop()
      rightStop()
      setLeftMotor(0)
      setRightMotor(0)
    }
  }, [isOpen])

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

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md lg:max-w-lg p-6 sm:p-8 space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-white">Tools</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs sm:text-sm text-slate-400 uppercase tracking-wide">Left Motor</label>
            <span className="text-xs sm:text-sm text-slate-300 font-mono">{leftMotor}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={1}
            value={leftMotor}
            onChange={(e) => handleLeftMotor(Number(e.target.value))}
            onMouseUp={() => handleLeftMotor(0)}
            onTouchEnd={() => handleLeftMotor(0)}
            className="w-full accent-indigo-500"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs sm:text-sm text-slate-400 uppercase tracking-wide">Right Motor</label>
            <span className="text-xs sm:text-sm text-slate-300 font-mono">{rightMotor}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={1}
            value={rightMotor}
            onChange={(e) => handleRightMotor(Number(e.target.value))}
            onMouseUp={() => handleRightMotor(0)}
            onTouchEnd={() => handleRightMotor(0)}
            className="w-full accent-indigo-500"
          />
        </div>

        <Button onClick={() => setServo(0)} variant="secondary">
          Park Servo
        </Button>

        <Button onClick={() => estepsCalibration()} variant="secondary">
          Extend 1000mm (E-steps calibration)
        </Button>

        <Button onClick={onClose} variant="primary">
          Close
        </Button>
      </div>
    </div>
  )
}
