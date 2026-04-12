import { useState, useEffect } from 'react'
import { extendToHome, getState } from '../api'
import { showAlert } from '../components/AlertModal'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

interface Props {
  state: BackendState
  onDone: (state: BackendState) => void
}

export function ExtendToHomeScreen({ state, onDone }: Props) {
  const [extending, setExtending] = useState(state.moving === true || state.startedHoming === true)

  useEffect(() => {
    if (extending) {
      startPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startPolling(estimatedMs?: number) {
    if (estimatedMs) {
      await delay(estimatedMs)
    }
    const waitPeriod = 2000
    while (true) {
      try {
        const s = await getState()
        if (s.phase !== 'ExtendToHome') {
          onDone(s)
          return
        }
      } catch {
        await showAlert('Failed to get current phase')
        location.reload()
        return
      }
      await delay(waitPeriod)
    }
  }

  async function handleExtend() {
    setExtending(true)
    try {
      const seconds = await extendToHome()
      startPolling(seconds * 1000)
    } catch {
      startPolling()
    }
  }

  return (
    <Card
      title="Extend Belts"
      subtitle="The belts will extend to their home position. Make sure the belts are unobstructed and the motors do not skip, or the drawing accuracy may be affected."
    >
      {extending ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-10 h-10 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Extending to home position…</p>
        </div>
      ) : (
        <Button onClick={handleExtend}>Extend to home position</Button>
      )}
    </Card>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
