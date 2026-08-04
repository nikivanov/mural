import { useState, useEffect } from 'react'
import { getState, enableMockMode } from './api'
import { showErrorAlert } from './components/AlertModal'
import type { BackendState, UiPhase } from './types'
import type { SvgState } from './svgControl'
import type { RasterImageState } from './rasterControl'
import type { RendererDefinition } from './renderers/index'
import { getRenderersByInputType } from './renderers/index'

import { LoadingScreen } from './screens/LoadingScreen'
import { RetractBeltsScreen } from './screens/RetractBeltsScreen'
import { SetTopDistanceScreen } from './screens/SetTopDistanceScreen'
import { ExtendToHomeScreen } from './screens/ExtendToHomeScreen'
import { PenCalibrationScreen } from './screens/PenCalibrationScreen'
import { InputSelectScreen } from './screens/InputSelectScreen'
import { SvgUploadScreen } from './screens/SvgUploadScreen'
import { RasterUploadScreen } from './screens/RasterUploadScreen'
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
  const [rasterState, setRasterState] = useState<RasterImageState | null>(null)
  const [inputType, setInputType] = useState<'svg' | 'raster' | 'testPattern' | null>(null)
  const [selectedRenderer, setSelectedRenderer] = useState<RendererDefinition | null>(null)
  const [renderedCommands, setRenderedCommands] = useState<string | null>(null)

  // The backend uses 'SvgSelect' as its "ready to draw" phase, but we intercept
  // it to show our own InputSelect screen instead.
  function backendPhaseToUiPhase(phase: string): UiPhase {
    if (phase === 'SvgSelect') return 'InputSelect'
    return phase as UiPhase
  }

  useEffect(() => {
    getState()
      .then((s) => {
        if (!s?.phase) throw new Error('No backend')
        setBackendState(s)
        setUiPhase(backendPhaseToUiPhase(s.phase))
      })
      .catch(() => {
        if (import.meta.env.DEV) {
          const mock = { phase: 'SvgSelect' as const, safeWidth: 1000, homeX: 500, homeY: 0, safeXFraction: 0.2, safeYFraction: 0.25 }
          enableMockMode(mock)
          setBackendState(mock)
          setUiPhase('InputSelect')
        } else {
          showErrorAlert('Failed to retrieve state')
        }
      })
  }, [])

  function handleStateUpdate(s: BackendState) {
    setBackendState(s)
    setUiPhase(backendPhaseToUiPhase(s.phase))
  }

  function handleSelectSvg() {
    setInputType('svg')
    setUiPhase('SvgSelect')
  }

  function handleSelectRaster() {
    setInputType('raster')
    setUiPhase('RasterSelect')
  }

  function handleSelectTestPattern() {
    setInputType('testPattern')
    setSelectedRenderer(getRenderersByInputType('testPattern')[0])
    setUiPhase('DrawingPreview')
  }

  function handleBackToInputSelect() {
    setSvgState(null)
    setRasterState(null)
    setSelectedRenderer(null)
    setInputType(null)
    setUiPhase('InputSelect')
  }

  function handleSvgPreview(state: SvgState) {
    setSvgState(state)
    setUiPhase('ChooseRenderer')
  }

  function handleRasterPreview(state: RasterImageState) {
    setRasterState(state)
    const rasterRenderers = getRenderersByInputType('raster')
    if (rasterRenderers.length === 1) {
      setSelectedRenderer(rasterRenderers[0])
      setUiPhase('DrawingPreview')
    } else {
      setUiPhase('ChooseRenderer')
    }
  }

  function handleRendererChosen(renderer: RendererDefinition) {
    setSelectedRenderer(renderer)
    setUiPhase('DrawingPreview')
  }

  function handleBackFromChooseRenderer() {
    setUiPhase(inputType === 'raster' ? 'RasterSelect' : 'SvgSelect')
  }

  function handleBackFromDrawingPreview() {
    if (inputType === 'testPattern') {
      handleBackToInputSelect()
    } else if (inputType === 'raster' && getRenderersByInputType('raster').length === 1) {
      setUiPhase('RasterSelect')
    } else {
      setUiPhase('ChooseRenderer')
    }
  }

  function handleCommandsAccepted(commands: string) {
    setRenderedCommands(commands)
    setUiPhase('UploadProgress')
  }

  function handleUploadDone(s: BackendState) {
    setBackendState(s)
    setUiPhase(s.phase)
  }

  async function handleUploadError(message: string) {
    await showErrorAlert(message)
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
    case 'InputSelect':
      currentScreen = (
        <InputSelectScreen
          onSelectSvg={handleSelectSvg}
          onSelectRaster={handleSelectRaster}
          onSelectTestPattern={handleSelectTestPattern}
        />
      )
      break
    case 'SvgSelect':
      currentScreen = (
        <SvgUploadScreen
          state={backendState!}
          initialState={svgState ?? undefined}
          onPreview={handleSvgPreview}
          onBack={handleBackToInputSelect}
        />
      )
      break
    case 'RasterSelect':
      currentScreen = (
        <RasterUploadScreen
          state={backendState!}
          initialState={rasterState ?? undefined}
          onPreview={handleRasterPreview}
          onBack={handleBackToInputSelect}
        />
      )
      break
    case 'ChooseRenderer':
      currentScreen = (
        <ChooseRendererScreen
          renderers={getRenderersByInputType(inputType!)}
          onChoose={handleRendererChosen}
          onBack={handleBackFromChooseRenderer}
        />
      )
      break
    case 'DrawingPreview':
      currentScreen = (
        <DrawingPreviewScreen
          state={backendState!}
          svgState={svgState ?? undefined}
          imageState={rasterState ?? undefined}
          renderer={selectedRenderer!}
          onAccept={handleCommandsAccepted}
          onBack={handleBackFromDrawingPreview}
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
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-xl 2xl:max-w-4xl">{currentScreen}</div>
      <a
        href="https://github.com/nikivanov/mural"
        className="mt-6 text-xs sm:text-sm text-gray-600 hover:text-gray-400 transition-colors"
      >
        Mural
      </a>
    </div>
  )
}
