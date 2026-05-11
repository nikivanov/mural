interface SliderProps {
  id?: string
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  className?: string
  disabled?: boolean
}

export function Slider({ id, label, min, max, step = 1, value, onChange, className = '', disabled = false }: SliderProps) {
  return (
    <div className={`space-y-1 ${className} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-center">
        <label htmlFor={id} className="text-xs sm:text-sm 2xl:text-base text-gray-400 uppercase tracking-wide">
          {label}
        </label>
        <span className="text-xs sm:text-sm 2xl:text-base text-gray-300 font-mono">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step="any"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const raw = Number(e.target.value)
          const decimals = (step.toString().split('.')[1] ?? '').length
          const snapped = parseFloat((Math.round(raw / step) * step).toFixed(decimals))
          onChange(Math.max(min, Math.min(max, snapped)))
        }}
        className="w-full h-2 sm:h-3 2xl:h-4 rounded-full cursor-pointer accent-cyan-500"
      />
    </div>
  )
}
