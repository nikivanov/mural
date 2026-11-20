interface ToggleProps {
  id?: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ id, label, checked, onChange }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full min-h-11 flex items-center justify-between select-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
    >
      <span className="text-gray-200">{label}</span>
      <span
        className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-cyan-600' : 'bg-gray-600'}`}
      >
        <span
          className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
