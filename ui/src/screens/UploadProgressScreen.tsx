import { useEffect, useState } from 'react'
import { uploadCommands, downloadCommands } from '../api'
import type { BackendState } from '../types'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'

interface Props {
  commands: string
  onDone: (state: BackendState) => void
  onError: (message: string) => void
}

async function compressCommands(input: string): Promise<Blob> {
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  writer.write(new TextEncoder().encode(input)).then(() => writer.close())
  return new Response(cs.readable).blob()
}

async function decompressBlob(blob: Blob): Promise<string> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  writer.write(await blob.arrayBuffer()).then(() => writer.close())
  return new Response(ds.readable).text()
}

export function UploadProgressScreen({ commands, onDone, onError }: Props) {
  const [uploadPct, setUploadPct] = useState(0)
  const [verifyPct, setVerifyPct] = useState(0)
  const [phase, setPhase] = useState<'uploading' | 'verifying' | 'done'>('uploading')

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run() {
    // Upload
    let state: BackendState
    try {
      const blob = await compressCommands(commands)
      state = await uploadCommands(blob, setUploadPct)
      setUploadPct(100)
    } catch (err) {
      onError(`Upload to Mural failed: ${err}`)
      return
    }

    // Verify
    setPhase('verifying')
    try {
      const receivedBlob = await downloadCommands(setVerifyPct)
      setVerifyPct(100)
      const received = await decompressBlob(receivedBlob)

      const receivedLines = received.split('\n')
      const sentLines = commands.split('\n')

      if (receivedLines.length !== sentLines.length) {
        onError('Data verification failed: length mismatch')
        return
      }
      for (let i = 0; i < receivedLines.length; i++) {
        if (receivedLines[i] !== sentLines[i]) {
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
