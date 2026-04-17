import { Card } from '../components/Card'

interface Props {
  onSelectSvg: () => void
  onSelectRaster: () => void
}

export function InputSelectScreen({ onSelectSvg, onSelectRaster }: Props) {
  return (
    <Card title="What are you drawing?">
      <div className="space-y-3">
        <button
          onClick={onSelectSvg}
          className="w-full rounded-xl px-5 py-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 transition-all text-center"
        >
          <p className="text-base font-semibold text-white">SVG File</p>
          <p className="text-sm text-slate-400 mt-1">Line art, vector drawings</p>
        </button>
        <button
          onClick={onSelectRaster}
          className="w-full rounded-xl px-5 py-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 transition-all text-center"
        >
          <p className="text-base font-semibold text-white">Raster Image</p>
          <p className="text-sm text-slate-400 mt-1">Photos, grayscale images (PNG / JPG)</p>
        </button>
      </div>
    </Card>
  )
}
