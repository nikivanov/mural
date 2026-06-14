type NudgeDir = 'up' | 'down' | 'left' | 'right'
type ZoomDir = 'in' | 'out' | 'reset'

interface DPadProps {
  onNudge: (dir: NudgeDir) => void
  onZoom: (dir: ZoomDir) => void
  transformText?: string
}

export function DPad({ onNudge, onZoom, transformText }: DPadProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3 items-center justify-center">

        {/* Circle d-pad */}
        <div className="relative w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 rounded-full overflow-hidden bg-gray-800 shadow-lg shadow-black/40">

          {/* UP */}
          <button
            type="button"
            onClick={() => onNudge('up')}
            style={{ clipPath: 'polygon(50% 50%, 0% 0%, 100% 0%)' }}
            className="absolute inset-0 bg-gray-700 hover:bg-gray-600 active:bg-gray-900 transition-colors select-none"
          >
            <span
              className="absolute text-gray-300 text-xs sm:text-sm leading-none pointer-events-none"
              style={{ left: '50%', top: '13.4%', transform: 'translate(-50%, -50%)' }}
            >▲</span>
          </button>

          {/* RIGHT */}
          <button
            type="button"
            onClick={() => onNudge('right')}
            style={{ clipPath: 'polygon(50% 50%, 100% 0%, 100% 100%)' }}
            className="absolute inset-0 bg-gray-700 hover:bg-gray-600 active:bg-gray-900 transition-colors select-none"
          >
            <span
              className="absolute text-gray-300 text-xs sm:text-sm leading-none pointer-events-none"
              style={{ left: '86.6%', top: '50%', transform: 'translate(-50%, -50%)' }}
            >▶︎</span>
          </button>

          {/* DOWN */}
          <button
            type="button"
            onClick={() => onNudge('down')}
            style={{ clipPath: 'polygon(50% 50%, 100% 100%, 0% 100%)' }}
            className="absolute inset-0 bg-gray-700 hover:bg-gray-600 active:bg-gray-900 transition-colors select-none"
          >
            <span
              className="absolute text-gray-300 text-xs sm:text-sm leading-none pointer-events-none"
              style={{ left: '50%', top: '86.6%', transform: 'translate(-50%, -50%)' }}
            >▼</span>
          </button>

          {/* LEFT */}
          <button
            type="button"
            onClick={() => onNudge('left')}
            style={{ clipPath: 'polygon(50% 50%, 0% 100%, 0% 0%)' }}
            className="absolute inset-0 bg-gray-700 hover:bg-gray-600 active:bg-gray-900 transition-colors select-none"
          >
            <span
              className="absolute text-gray-300 text-xs sm:text-sm leading-none pointer-events-none"
              style={{ left: '13.4%', top: '50%', transform: 'translate(-50%, -50%)' }}
            >◀︎</span>
          </button>

          {/* Divider lines (diagonal, matching sector boundaries) */}
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none z-10 bg-gray-600/60 h-px"
            style={{ width: '141.4%', transform: 'translate(-50%, -50%) rotate(45deg)' }}
          />
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none z-10 bg-gray-600/60 h-px"
            style={{ width: '141.4%', transform: 'translate(-50%, -50%) rotate(-45deg)' }}
          />

          {/* Center decorative circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 lg:w-9 lg:h-9 rounded-full bg-gray-900 border border-gray-700 pointer-events-none z-20" />
        </div>

        {/* Zoom pill */}
        <div className="flex flex-col w-10 sm:w-12 lg:w-14 rounded-2xl overflow-hidden bg-gray-800 shadow-lg shadow-black/40">
          <button
            type="button"
            onClick={() => onZoom('in')}
            className="flex-1 aspect-square flex items-center justify-center text-lg text-gray-300 hover:bg-gray-600 active:bg-gray-900 transition-colors select-none"
          >+</button>
          <div className="h-px bg-gray-700 shrink-0" />
          <button
            type="button"
            onClick={() => onZoom('out')}
            className="flex-1 aspect-square flex items-center justify-center text-lg text-gray-300 hover:bg-gray-600 active:bg-gray-900 transition-colors select-none"
          >−</button>
          <div className="h-px bg-gray-700 shrink-0" />
          <button
            type="button"
            onClick={() => onZoom('reset')}
            className="flex-1 aspect-square flex items-center justify-center text-xs text-gray-400 hover:bg-gray-600 active:bg-gray-900 transition-colors select-none"
          >↺</button>
        </div>

      </div>

      {transformText && (
        <p className="text-center text-xs sm:text-sm text-gray-500 font-mono">{transformText}</p>
      )}
    </div>
  )
}
