import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from './Button'

interface AlertModalProps {
  message: string
  onDismiss: () => void
}

function AlertModal({ message, onDismiss }: AlertModalProps) {
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    btnRef.current?.focus()
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') onDismiss()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 sm:p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md lg:max-w-lg p-6 sm:p-8 space-y-5 sm:space-y-6">
        <p className="text-gray-200 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">{message}</p>
        <Button ref={btnRef} onClick={onDismiss}>
          OK
        </Button>
      </div>
    </div>
  )
}

/** Drop-in async replacement for window.alert().
 *  Resolves only after the user dismisses the modal. */
export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    function dismiss() {
      root.unmount()
      document.body.removeChild(container)
      resolve()
    }

    root.render(<AlertModal message={message} onDismiss={dismiss} />)
  })
}

/** Show an error alert then reload the page once the user dismisses it. */
export async function showErrorAlert(message: string): Promise<never> {
  await showAlert(message)
  location.reload()
  // unreachable, but satisfies the return type so callers don't need extra casts
  return new Promise(() => {})
}
