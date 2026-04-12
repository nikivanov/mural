type NudgeDir = 'up' | 'down' | 'left' | 'right'
type ZoomDir = 'in' | 'out' | 'reset'

interface DPadProps {
  onNudge: (dir: NudgeDir) => void
  onZoom: (dir: ZoomDir) => void
  transformText?: string
}

function DPadButton({
  onClick,
  children,
  className = '',
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-200 transition-colors select-none ${className}`}
    >
      {children}
    </button>
  )
}

export function DPad({ onNudge, onZoom, transformText }: DPadProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3 items-start justify-center">
        {/* D-pad grid */}
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-28 h-28">
          {/* Row 1 */}
          <div />
          <DPadButton onClick={() => onNudge('up')} className="w-full h-full">
            ▲
          </DPadButton>
          <div />
          {/* Row 2 */}
          <DPadButton onClick={() => onNudge('left')} className="w-full h-full">
            ◀
          </DPadButton>
          <div className="rounded-lg bg-slate-800" />
          <DPadButton onClick={() => onNudge('right')} className="w-full h-full">
            ▶
          </DPadButton>
          {/* Row 3 */}
          <div />
          <DPadButton onClick={() => onNudge('down')} className="w-full h-full">
            ▼
          </DPadButton>
          <div />
        </div>

        {/* Zoom controls */}
        <div className="flex flex-col gap-1 w-10">
          <DPadButton onClick={() => onZoom('in')} className="w-full aspect-square text-lg">
            +
          </DPadButton>
          <DPadButton onClick={() => onZoom('out')} className="w-full aspect-square text-lg">
            −
          </DPadButton>
          <DPadButton onClick={() => onZoom('reset')} className="w-full aspect-square text-xs">
            ↺
          </DPadButton>
        </div>
      </div>

      {transformText && (
        <p className="text-center text-xs text-slate-500 font-mono">{transformText}</p>
      )}
    </div>
  )
}
