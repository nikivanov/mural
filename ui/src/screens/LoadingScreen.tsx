export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-gray-700 border-t-cyan-500 rounded-full animate-spin" />
      <p className="text-sm text-gray-500">Connecting…</p>
    </div>
  )
}
