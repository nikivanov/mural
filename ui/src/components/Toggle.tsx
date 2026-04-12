interface ToggleProps {
  id?: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ id, label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer select-none">
      <span className="text-slate-200">{label}</span>
      <div
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-indigo-600' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </div>
    </label>
  )
}
