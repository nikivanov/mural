import { Card } from '../components/Card'

interface Props {
  onSelectSvg: () => void
  onSelectRaster: () => void
  onSelectTestPattern: () => void
}

export function InputSelectScreen({ onSelectSvg, onSelectRaster, onSelectTestPattern }: Props) {
  return (
    <Card title="What are you drawing?">
      <div className="space-y-3">
        <button
          onClick={onSelectSvg}
          className="w-full rounded-xl px-5 py-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-cyan-500 transition-all text-center"
        >
          <p className="text-base font-semibold text-white">SVG File</p>
          <p className="text-sm text-gray-400 mt-1">Line art, vector drawings</p>
        </button>
        <button
          onClick={onSelectRaster}
          className="w-full rounded-xl px-5 py-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-cyan-500 transition-all text-center"
        >
          <p className="text-base font-semibold text-white">Raster Image</p>
          <p className="text-sm text-gray-400 mt-1">Photos, grayscale images (PNG / JPG)</p>
        </button>
        <button
          onClick={onSelectTestPattern}
          className="w-full rounded-xl px-5 py-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-cyan-500 transition-all text-center"
        >
          <p className="text-base font-semibold text-white">Test Pattern</p>
          <p className="text-sm text-gray-400 mt-1">Belt calibration &amp; motor stress test</p>
        </button>
      </div>
    </Card>
  )
}
