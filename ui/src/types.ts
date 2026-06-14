export type Phase =
  | 'RetractBelts'
  | 'SetTopDistance'
  | 'ExtendToHome'
  | 'PenCalibration'
  | 'SvgSelect'
  | 'BeginDrawing'

export interface BackendState {
  phase: Phase
  topDistance?: number
  safeWidth?: number
  safeXFraction: number
  safeYFraction: number
  homeX?: number
  homeY?: number
  moving?: boolean
  startedHoming?: boolean
  freeKb?: number
}

/** Internal UI phase — extends backend phases with SVG pipeline sub-states */
export type UiPhase =
  | 'loading'
  | Phase
  | 'InputSelect'
  | 'RasterSelect'
  | 'ChooseRenderer'
  | 'DrawingPreview'
  | 'UploadProgress'
  | 'DrawingBegan'

export type InfillDensity = 0 | 1 | 2 | 3 | 4

export interface RenderResult {
  commands: string[]
  svgJson: string
  distance: number
  drawDistance: number
}

export interface WorkerMessage {
  type: 'status' | 'log' | 'vectorizer' | 'renderer'
  payload: unknown
}
