import { listenForRendererResult, type ExecuteOpts, type RendererDefinition } from './index'

export const TEST_PATTERN_HEIGHT_MM = 1500
export const TEST_PATTERN_SQUARE_SIZE_MM = 100

async function execute({ backendState, onStatus, worker }: ExecuteOpts) {
  onStatus('Preparing test pattern')
  const resultPromise = listenForRendererResult(worker, onStatus)

  worker.postMessage({
    type: 'renderTestPattern',
    homeX: backendState.homeX ?? 0,
    homeY: backendState.homeY ?? 0,
    maxX: backendState.safeWidth ?? 1000,
    rectHeight: TEST_PATTERN_HEIGHT_MM,
    squareSize: TEST_PATTERN_SQUARE_SIZE_MM,
  })

  return resultPromise
}

export const testPatternRenderer: RendererDefinition = {
  id: 'testPattern',
  label: 'Test Pattern',
  description: 'Draws a calibration square, stress-tests the motors with repeated up/down moves at the center, left, and right of the drawing area, then redraws the square to check for missed steps',
  inputType: 'testPattern',
  params: [],
  execute,
}
