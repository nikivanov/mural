import type { BackendState } from './types'

// ---------------------------------------------------------------------------
// Mock mode — activated automatically in dev when no backend is reachable
// ---------------------------------------------------------------------------
let _mockMode = false
let _mockState: BackendState = { phase: 'SvgSelect', safeWidth: 1000, homeX: 500, homeY: 0, safeXFraction: 0.2, safeYFraction: 0.25, pulleyDiameter: 10.14926 }
let _mockUploadedBlob: Blob | null = null

export function enableMockMode(state: BackendState) {
  _mockMode = true
  _mockState = state
}

export function isMockMode() { return _mockMode }

// ---------------------------------------------------------------------------

async function post<T = BackendState>(url: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body as Record<string, string>).toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${url} failed: ${res.status}`)
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

async function get<T = BackendState>(url: string): Promise<T> {
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${url} failed: ${res.status}`)
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

export const getState = (): Promise<BackendState> => get('/getState')

export const doneWithPhase = (): Promise<BackendState> => post('/doneWithPhase')

export const setTopDistance = (distance: number): Promise<BackendState> =>
  post('/setTopDistance', { distance: String(distance) })

export const setPulleyDiameter = (diameter: number): Promise<void> =>
  post<void>('/setPulleyDiameter', { diameter: String(diameter) })

export const extendToHome = (): Promise<number> => post<number>('/extendToHome')

export const setServo = (angle: number): Promise<void> =>
  post<void>('/setServo', { angle: String(angle) })

export const setPenDistance = (angle: number): Promise<BackendState> =>
  post('/setPenDistance', { angle: String(angle) })

export const estepsCalibration = (distanceMm: number): Promise<void> =>
  post<void>('/estepsCalibration', { distance: String(distanceMm) })

export const postMotorCommand = (command: string): Promise<void> =>
  post<void>('/command', { command })

export const run = (speed: number): Promise<void> => post<void>('/run', { speed: String(speed) })

const UPLOAD_CHUNK_SIZE = 32 * 1024
const UPLOAD_MAX_RETRIES = 3
const UPLOAD_RETRY_DELAY_MS = 500

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Uploads one chunk as its own request, identified by its byte offset in
// the overall file so the server can apply a retry idempotently (see
// SvgSelectPhase::handleUpload).
function sendChunk(chunk: Blob, offset: number, totalBytes: number, final: boolean): Promise<BackendState> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('commands', chunk)

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BackendState)
        } catch {
          reject(new Error('Invalid upload response'))
        }
      } else {
        reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Upload network error'))
    const params = new URLSearchParams({
      offset: String(offset),
      totalBytes: String(totalBytes),
      final: String(final),
    })
    xhr.open('POST', `/uploadCommands?${params.toString()}`)
    xhr.send(formData)
  })
}

async function sendChunkWithRetry(
  chunk: Blob,
  offset: number,
  totalBytes: number,
  final: boolean,
): Promise<BackendState> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await sendChunk(chunk, offset, totalBytes, final)
    } catch (err) {
      if (attempt >= UPLOAD_MAX_RETRIES) throw err
      await delay(UPLOAD_RETRY_DELAY_MS * (attempt + 1))
    }
  }
}

export async function uploadCommands(
  blob: Blob,
  onUploadProgress: (pct: number) => void,
): Promise<BackendState> {
  if (_mockMode) {
    _mockUploadedBlob = blob
    return new Promise((resolve) => {
      let pct = 0
      const iv = setInterval(() => {
        pct = Math.min(100, pct + 20)
        onUploadProgress(pct)
        if (pct === 100) { clearInterval(iv); resolve(_mockState) }
      }, 80)
    })
  }

  const totalBytes = blob.size
  let offset = 0
  let state: BackendState

  do {
    const end = Math.min(offset + UPLOAD_CHUNK_SIZE, totalBytes)
    const chunk = blob.slice(offset, end)
    const final = end === totalBytes
    state = await sendChunkWithRetry(chunk, offset, totalBytes, final)
    offset = end
    onUploadProgress(totalBytes === 0 ? 100 : Math.round((offset / totalBytes) * 100))
  } while (offset < totalBytes)

  return state
}

export function downloadCommands(
  onProgress: (pct: number) => void,
): Promise<string> {
  if (_mockMode) {
    return new Promise((resolve) => {
      let pct = 0
      const iv = setInterval(async () => {
        pct = Math.min(100, pct + 20)
        onProgress(pct)
        if (pct === 100) {
          clearInterval(iv)
          resolve(_mockUploadedBlob ? await _mockUploadedBlob.text() : '')
        }
      }, 80)
    })
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        onProgress(Math.round((evt.loaded / evt.total) * 100))
      }
    })

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText)
      } else {
        reject(new Error(`Download failed: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Download network error'))
    xhr.open('GET', '/downloadCommands')
    xhr.send()
  })
}

// Motor helpers
export const raiseBot = (): Promise<number> => post<number>('/command', { command: 'raise' })
export const lowerBot = (): Promise<number> => post<number>('/command', { command: 'lower' })

export const leftRetractDown = () => postMotorCommand('l-ret')
export const leftExtendDown = () => postMotorCommand('l-ext')
export const leftStop = () => postMotorCommand('l-0')
export const rightRetractDown = () => postMotorCommand('r-ret')
export const rightExtendDown = () => postMotorCommand('r-ext')
export const rightStop = () => postMotorCommand('r-0')
