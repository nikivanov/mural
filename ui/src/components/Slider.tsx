interface SliderProps {
  id?: string
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  className?: string
}

export function Slider({ id, label, min, max, step = 1, value, onChange, className = '' }: SliderProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex justify-between items-center">
        <label htmlFor={id} className="text-xs sm:text-sm text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        <span className="text-xs sm:text-sm text-slate-300 font-mono">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 sm:h-3 rounded-full cursor-pointer accent-indigo-500"
      />
    </div>
  )
}
