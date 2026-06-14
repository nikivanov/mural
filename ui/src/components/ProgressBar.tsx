interface ProgressBarProps {
  label?: string
  value: number
  animated?: boolean
  color?: 'indigo' | 'emerald'
}

export function ProgressBar({ label, value, animated = false, color = 'indigo' }: ProgressBarProps) {
  const colors = {
    indigo: 'bg-cyan-500',
    emerald: 'bg-emerald-500',
  }

  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-gray-400">{label}</p>}
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colors[color]} ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}
