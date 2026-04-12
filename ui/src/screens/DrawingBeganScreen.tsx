import { Card } from '../components/Card'

export function DrawingBeganScreen() {
  return (
    <Card title="Drawing Started">
      <p className="text-center text-sm text-slate-400 leading-relaxed">
        Mural will not be accessible via your browser while the drawing is in progress.
        Please refresh the page once the drawing is finished.
      </p>
    </Card>
  )
}
