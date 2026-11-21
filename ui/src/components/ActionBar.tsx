import type { ReactNode } from 'react'

/**
 * Wraps a screen's primary button. On phones it sticks to the bottom of the viewport so the
 * primary action stays reachable while scrolling; from `sm` up (and on short landscape
 * screens) it is a plain block. Secondary buttons like "Back" go after it, outside the bar.
 * Must be a direct child of a Card (the negative margins match the Card's mobile padding).
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-6 px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-3 bg-gray-900/95 backdrop-blur border-t border-gray-800 sm:static sm:m-0 sm:p-0 sm:space-y-6 sm:bg-transparent sm:border-0 sm:backdrop-blur-none short:static short:m-0 short:p-0 short:space-y-3 short:bg-transparent short:border-0 short:backdrop-blur-none">
      {children}
    </div>
  )
}
