import type { UiPhase } from '../types'

// User-facing wizard steps, in the order the firmware walks through its phases
// (SetTopDistance → SvgSelect → upload → RetractBelts → ExtendToHome → PenCalibration →
// BeginDrawing). Several screens can belong to one step (e.g. choosing the input type and
// uploading the file are both "Image").
const STEPS: { label: string; phases: UiPhase[] }[] = [
  { label: 'Hanger distance', phases: ['SetTopDistance'] },
  { label: 'Image', phases: ['InputSelect', 'SvgSelect', 'RasterSelect'] },
  { label: 'Preview', phases: ['ChooseRenderer', 'DrawingPreview'] },
  { label: 'Upload', phases: ['UploadProgress'] },
  { label: 'Retract belts', phases: ['RetractBelts'] },
  { label: 'Extend to home', phases: ['ExtendToHome'] },
  { label: 'Pen calibration', phases: ['PenCalibration'] },
  { label: 'Draw', phases: ['BeginDrawing', 'DrawingBegan'] },
]

export function StepIndicator({ phase }: { phase: UiPhase }) {
  const current = STEPS.findIndex((s) => s.phases.includes(phase))
  if (current === -1) return null

  return (
    <nav aria-label="Setup progress" className="mb-4 sm:mb-6 short:mb-2 space-y-2 short:space-y-1">
      <ol className="flex gap-1.5">
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            title={step.label}
            aria-current={i === current ? 'step' : undefined}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < current ? 'bg-cyan-700' : i === current ? 'bg-cyan-400' : 'bg-gray-800'
            }`}
          >
            <span className="sr-only">{step.label}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-xs sm:text-sm text-gray-500">
        Step {current + 1} of {STEPS.length} · <span className="text-gray-300">{STEPS[current].label}</span>
      </p>
    </nav>
  )
}
