import { useRef, useState, useCallback, useEffect } from 'react'

interface ThumbstickProps {
  onJog: (vx: number, vy: number) => void
  intervalMs?: number
  size?: number
}

export function Thumbstick({ onJog, intervalMs = 100, size = 144 }: ThumbstickProps) {
  const baseRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deflectionRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 })
  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 })

  const thumbRadius = size * 0.18
  const maxDeflect = size * 0.32

  const startPolling = useCallback(() => {
    if (intervalRef.current !== null) return
    intervalRef.current = setInterval(() => {
      const { vx, vy } = deflectionRef.current
      onJog(vx, vy)
    }, intervalMs)
  }, [onJog, intervalMs])

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    deflectionRef.current = { vx: 0, vy: 0 }
    setThumbPos({ x: 0, y: 0 })
    onJog(0, 0)
  }, [onJog])

  const computeDeflection = useCallback((clientX: number, clientY: number) => {
    const base = baseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const dist = Math.sqrt(dx * dx + dy * dy)
    const clamped = Math.min(dist, maxDeflect)
    const angle = Math.atan2(dy, dx)
    const magnitude = clamped / maxDeflect
    deflectionRef.current = {
      vx: +(Math.cos(angle) * magnitude).toFixed(3),
      vy: +(Math.sin(angle) * magnitude).toFixed(3),
    }
    setThumbPos({
      x: Math.cos(angle) * clamped,
      y: Math.sin(angle) * clamped,
    })
  }, [maxDeflect])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    computeDeflection(e.clientX, e.clientY)
    startPolling()
  }, [computeDeflection, startPolling])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return
    computeDeflection(e.clientX, e.clientY)
  }, [computeDeflection])

  const handlePointerUp = useCallback(() => {
    stopPolling()
  }, [stopPolling])

  useEffect(() => () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current)
  }, [])

  const isCenter = thumbPos.x === 0 && thumbPos.y === 0

  return (
    <div
      ref={baseRef}
      className="relative rounded-full bg-gray-800 shadow-lg shadow-black/40 select-none"
      style={{ width: size, height: size, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-full h-px bg-gray-700/60" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-full w-px bg-gray-700/60" />
      </div>
      <div
        className="absolute rounded-full bg-cyan-500 shadow-md pointer-events-none"
        style={{
          width: thumbRadius * 2,
          height: thumbRadius * 2,
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${thumbPos.x}px), calc(-50% + ${thumbPos.y}px))`,
          transition: isCenter ? 'transform 0.15s ease-out' : 'none',
        }}
      />
    </div>
  )
}
