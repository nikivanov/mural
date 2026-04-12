import { useState, useEffect } from 'react'
import { getState } from './api'
import { showAlert } from './components/AlertModal'
import type { BackendState, UiPhase } from './types'
import type { SvgState } from './svgControl'
import type { RendererDefinition } from './renderers/index'

import { LoadingScreen } from './screens/LoadingScreen'
import { RetractBeltsScreen } from './screens/RetractBeltsScreen'
import { SetTopDistanceScreen } from './screens/SetTopDistanceScreen'
import { ExtendToHomeScreen } from './screens/ExtendToHomeScreen'
import { PenCalibrationScreen } from './screens/PenCalibrationScreen'
import { SvgUploadScreen } from './screens/SvgUploadScreen'
import { ChooseRendererScreen } from './screens/ChooseRendererScreen'
import { DrawingPreviewScreen } from './screens/DrawingPreviewScreen'
import { UploadProgressScreen } from './screens/UploadProgressScreen'
import { BeginDrawingScreen } from './screens/BeginDrawingScreen'
import { DrawingBeganScreen } from './screens/DrawingBeganScreen'

export default function App() {
  const [backendState, setBackendState] = useState<BackendState | null>(null)
  const [uiPhase, setUiPhase] = useState<UiPhase>('loading')

  // SVG pipeline state
  const [svgState, setSvgState] = useState<SvgState | null>(null)
  const [selectedRenderer, setSelectedRenderer] = useState<RendererDefinition | null>(null)
  const [renderedCommands, setRenderedCommands] = useState<string | null>(null)

  useEffect(() => {
    getState()
      .then((s) => {
        setBackendState(s)
        setUiPhase(s.phase)
      })
      .catch(() => {
        showAlert('Failed to retrieve state')
      })
  }, [])

  function handleStateUpdate(s: BackendState) {
    setBackendState(s)
    setUiPhase(s.phase)
  }

  function handleSvgPreview(state: SvgState) {
    setSvgState(state)
    setUiPhase('ChooseRenderer')
  }

  function handleRendererChosen(renderer: RendererDefinition) {
    setSelectedRenderer(renderer)
    setUiPhase('DrawingPreview')
  }

  function handleBackToSvgSelect() {
    setRenderedCommands(null)
    setUiPhase('SvgSelect')
  }

  function handleCommandsAccepted(commands: string) {
    setRenderedCommands(commands)
    setUiPhase('UploadProgress')
  }

  function handleUploadDone(s: BackendState) {
    setBackendState(s)
    setUiPhase('BeginDrawing')
  }

  async function handleUploadError(message: string) {
    await showAlert(message)
    setUiPhase('DrawingPreview')
  }

  let currentScreen
  switch (uiPhase) {
    case 'loading':
      currentScreen = <LoadingScreen />
      break
    case 'RetractBelts':
      currentScreen = <RetractBeltsScreen onDone={handleStateUpdate} />
      break
    case 'SetTopDistance':
      currentScreen = <SetTopDistanceScreen onDone={handleStateUpdate} />
      break
    case 'ExtendToHome':
      currentScreen = <ExtendToHomeScreen state={backendState!} onDone={handleStateUpdate} />
      break
    case 'PenCalibration':
      currentScreen = <PenCalibrationScreen onDone={handleStateUpdate} />
      break
    case 'SvgSelect':
      currentScreen = <SvgUploadScreen state={backendState!} onPreview={handleSvgPreview} />
      break
    case 'ChooseRenderer':
      currentScreen = (
        <ChooseRendererScreen onChoose={handleRendererChosen} onBack={handleBackToSvgSelect} />
      )
      break
    case 'DrawingPreview':
      currentScreen = (
        <DrawingPreviewScreen
          state={backendState!}
          svgState={svgState!}
          renderer={selectedRenderer!}
          onAccept={handleCommandsAccepted}
          onBack={handleBackToSvgSelect}
        />
      )
      break
    case 'UploadProgress':
      currentScreen = (
        <UploadProgressScreen
          commands={renderedCommands!}
          onDone={handleUploadDone}
          onError={handleUploadError}
        />
      )
      break
    case 'BeginDrawing':
      currentScreen = (
        <BeginDrawingScreen
          onBegin={() => setUiPhase('DrawingBegan')}
          onReset={handleStateUpdate}
        />
      )
      break
    case 'DrawingBegan':
      currentScreen = <DrawingBeganScreen />
      break
    default:
      currentScreen = (
        <div className="text-center text-red-400 text-sm">Unrecognized phase: {uiPhase}</div>
      )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">{currentScreen}</div>
      <a
        href="https://github.com/nikivanov/mural"
        className="mt-6 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        Mural
      </a>
    </div>
  )
}
