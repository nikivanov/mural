import type { BackendState } from './types'

// ---------------------------------------------------------------------------
// Mock mode — activated automatically in dev when no backend is reachable
// ---------------------------------------------------------------------------
let _mockMode = false
let _mockState: BackendState = { phase: 'SvgSelect', safeWidth: 1000, homeX: 500, homeY: 0 }
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

export const extendToHome = (): Promise<number> => post<number>('/extendToHome')

export const setServo = (angle: number): Promise<void> =>
  post<void>('/setServo', { angle: String(angle) })

export const setPenDistance = (angle: number): Promise<BackendState> =>
  post('/setPenDistance', { angle: String(angle) })

export const estepsCalibration = (): Promise<void> =>
  post<void>('/estepsCalibration')

export const postMotorCommand = (command: string): Promise<void> =>
  post<void>('/command', { command })

export const run = (): Promise<void> => post<void>('/run')

export function uploadCommands(
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
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('commands', blob)

    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        onUploadProgress(Math.round((evt.loaded / evt.total) * 100))
      }
    })

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
    xhr.open('POST', '/uploadCommands')
    xhr.send(formData)
  })
}

export function downloadCommands(
  onProgress: (pct: number) => void,
): Promise<Blob> {
  if (_mockMode) {
    return new Promise((resolve) => {
      let pct = 0
      const iv = setInterval(() => {
        pct = Math.min(100, pct + 20)
        onProgress(pct)
        if (pct === 100) { clearInterval(iv); resolve(_mockUploadedBlob ?? new Blob()) }
      }, 80)
    })
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.responseType = 'blob'

    xhr.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        onProgress(Math.round((evt.loaded / evt.total) * 100))
      }
    })

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Blob)
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
export const leftRetractDown = () => postMotorCommand('l-ret')
export const leftExtendDown = () => postMotorCommand('l-ext')
export const leftStop = () => postMotorCommand('l-0')
export const rightRetractDown = () => postMotorCommand('r-ret')
export const rightExtendDown = () => postMotorCommand('r-ext')
export const rightStop = () => postMotorCommand('r-0')
