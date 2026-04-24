import { useEffect, useState } from 'react'
import {
  leftRetractDown,
  leftExtendDown,
  leftStop,
  rightRetractDown,
  rightExtendDown,
  rightStop,
  setServo,
  savePenAngles,
  estepsCalibration,
  getState,
} from '../api'
import type { BackendState } from '../types'
import { Button } from './Button'

interface ToolsModalProps {
  isOpen: boolean
  onClose: () => void
  backendState?: BackendState
}

export function ToolsModal({ isOpen, onClose, backendState }: ToolsModalProps) {
  const [leftMotor, setLeftMotor] = useState(0)
  const [rightMotor, setRightMotor] = useState(0)
  const [upAngle, setUpAngle] = useState(90)
  const [downAngle, setDownAngle] = useState(45)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      leftStop()
      rightStop()
      setLeftMotor(0)
      setRightMotor(0)
      return
    }
    const applyState = (s: BackendState) => {
      if (s.penUpAngle != null) setUpAngle(s.penUpAngle)
      if (s.penDownAngle != null && s.penDownAngle !== -1) setDownAngle(s.penDownAngle)
    }
    if (backendState) applyState(backendState)
    getState().then(applyState)
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

  function previewAngle(angle: number) {
    setServo(angle)
  }

  async function handleSave() {
    setSaving(true)
    await savePenAngles(upAngle, downAngle)
    setSaving(false)
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
            type="range" min={-1} max={1} step={1} value={leftMotor}
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
            type="range" min={-1} max={1} step={1} value={rightMotor}
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

        {/* Pen angle calibration */}
        <div className="border-t border-slate-700 pt-4 space-y-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Pen Angles</p>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs sm:text-sm text-slate-400">Up angle (retracted)</label>
              <span className="text-xs sm:text-sm text-slate-300 font-mono">{upAngle}°</span>
            </div>
            <input
              type="range" min={0} max={180} step={1} value={upAngle}
              onChange={(e) => { const v = Number(e.target.value); setUpAngle(v); previewAngle(v) }}
              className="w-full accent-indigo-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { const v = Math.max(0, upAngle - 1); setUpAngle(v); previewAngle(v) }}
                className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
              >−1</button>
              <button
                onClick={() => { const v = Math.min(180, upAngle + 1); setUpAngle(v); previewAngle(v) }}
                className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
              >+1</button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs sm:text-sm text-slate-400">Down angle (drawing)</label>
              <span className="text-xs sm:text-sm text-slate-300 font-mono">{downAngle}°</span>
            </div>
            <input
              type="range" min={0} max={180} step={1} value={downAngle}
              onChange={(e) => { const v = Number(e.target.value); setDownAngle(v); previewAngle(v) }}
              className="w-full accent-indigo-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { const v = Math.max(0, downAngle - 1); setDownAngle(v); previewAngle(v) }}
                className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
              >−1</button>
              <button
                onClick={() => { const v = Math.min(180, downAngle + 1); setDownAngle(v); previewAngle(v) }}
                className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
              >+1</button>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} variant="secondary">
            {saving ? 'Saving…' : 'Save pen angles'}
          </Button>
        </div>

        <Button onClick={onClose} variant="primary">
          Close
        </Button>
      </div>
    </div>
  )
}
