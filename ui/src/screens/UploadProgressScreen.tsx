import { useEffect, useState } from 'react'
import { uploadCommands, downloadCommands } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'

interface Props {
  blob: Blob
  onDone: (state: BackendState) => void
  onError: (message: string) => void
}

export function UploadProgressScreen({ blob, onDone, onError }: Props) {
  const [uploadPct, setUploadPct] = useState(0)
  const [verifyPct, setVerifyPct] = useState(0)
  const [phase, setPhase] = useState<'uploading' | 'verifying' | 'done'>('uploading')

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run() {
    // Upload pre-compressed blob directly
    let state: BackendState
    try {
      state = await uploadCommands(blob, setUploadPct)
      setUploadPct(100)
    } catch (err) {
      onError(`Upload to Mural failed: ${err}`)
      return
    }

    // Verify by comparing received bytes against sent bytes
    setPhase('verifying')
    try {
      const receivedBlob = await downloadCommands(setVerifyPct)
      setVerifyPct(100)
      const sentBytes = new Uint8Array(await blob.arrayBuffer())
      const receivedBytes = new Uint8Array(await receivedBlob.arrayBuffer())
      if (sentBytes.length !== receivedBytes.length) {
        onError('Data verification failed: length mismatch')
        return
      }
      for (let i = 0; i < sentBytes.length; i++) {
        if (sentBytes[i] !== receivedBytes[i]) {
          onError('Data verification failed: content mismatch')
          return
        }
      }
    } catch (err) {
      onError(`Failed to download commands from Mural: ${err}`)
      return
    }

    setPhase('done')
    setTimeout(() => onDone(state), 800)
  }

  return (
    <Card title="Uploading…">
      <div className="space-y-4 py-2">
        <ProgressBar
          label="Upload"
          value={uploadPct}
          animated={phase === 'uploading'}
          color="indigo"
        />
        <ProgressBar
          label="Verification"
          value={verifyPct}
          animated={phase === 'verifying'}
          color="emerald"
        />
      </div>
      {phase === 'done' && (
        <p className="text-center text-sm text-emerald-400">Upload complete</p>
      )}
    </Card>
  )
}
