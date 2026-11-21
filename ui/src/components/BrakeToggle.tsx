import { useEffect, useState } from 'react'
import { getState, isMockMode, setBrake } from '../api'
import { showErrorAlert } from './AlertModal'
import type { BackendState } from '../types'

/** While released, re-check now and then: any motor command engages the brake by itself */
const POLL_MS = 4000

/**
 * Motor brake (= stepper drivers enabled). On from boot, can be released while the bot is
 * still on the table (e.g. to pull the belts out by hand for calibration). The firmware
 * engages it on its own from "Extend to home" on and doesn't let it go after that.
 */
export function BrakeToggle({ state }: { state: BackendState | null }) {
  const [brake, setBrakeState] = useState(state?.brake ?? true)
  const [locked, setLocked] = useState(state?.brakeLocked ?? false)
  const [busy, setBusy] = useState(false)

  function apply(s: BackendState) {
    if (s.brake !== undefined) setBrakeState(s.brake)
    if (s.brakeLocked !== undefined) setLocked(s.brakeLocked)
  }

  useEffect(() => {
    if (state) apply(state)
  }, [state])

  useEffect(() => {
    if (brake || isMockMode()) return
    const iv = window.setInterval(() => {
      getState().then(apply).catch(() => {})
    }, POLL_MS)
    return () => window.clearInterval(iv)
  }, [brake])

  // Old firmware without brake support doesn't report it — don't show a dead button
  if (!state || state.brake === undefined) return null

  async function toggle() {
    setBusy(true)
    try {
      apply(await setBrake(!brake))
    } catch (err) {
      await showErrorAlert(`Failed to ${brake ? 'release' : 'engage'} the brake: ${err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`mt-4 sm:mt-6 short:mt-2 flex items-center gap-3 rounded-2xl border px-4 py-2 short:py-1.5 ${
        brake ? 'border-gray-800 bg-gray-900' : 'border-amber-600/60 bg-amber-950/40'
      }`}
    >
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${brake ? 'bg-cyan-400' : 'bg-amber-400 animate-pulse'}`}
      />
      <div className="min-w-0 flex-1 text-xs sm:text-sm leading-snug">
        <p className={`font-medium ${brake ? 'text-gray-200' : 'text-amber-300'}`}>
          {brake ? 'Brake on' : 'Brake off'}
        </p>
        <p className="text-gray-500">
          {locked
            ? 'Stays on while Mural hangs on its belts'
            : brake
              ? 'Motors hold the belts'
              : 'Belts can be pulled freely · engages before hanging'}
        </p>
      </div>
      {!locked && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={brake}
          className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium transition-colors select-none touch-manipulation focus:outline-none focus-visible:ring-2 disabled:opacity-40 ${
            brake
              ? 'bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-gray-200 focus-visible:ring-gray-500'
              : 'bg-red-700 hover:bg-red-600 active:bg-red-800 text-white focus-visible:ring-red-500'
          }`}
        >
          {brake ? 'Release' : '■ Stop / Brake'}
        </button>
      )}
    </div>
  )
}
