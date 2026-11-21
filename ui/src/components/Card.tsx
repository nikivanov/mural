import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  subtitle?: string
  /** Small control in the top-right corner (e.g. a settings button) */
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function Card({ title, subtitle, action, children, className = '' }: CardProps) {
  return (
    <div className={`relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-10 2xl:p-14 short:p-4 space-y-5 sm:space-y-6 2xl:space-y-8 short:space-y-3 ${className}`}>
      {action && <div className="absolute top-2 right-2">{action}</div>}
      {(title || subtitle) && (
        <div className={`space-y-1 text-center ${action ? 'pt-6 sm:pt-0 sm:px-10 short:pt-0 short:px-10' : ''}`}>
          {title && <h1 className="text-xl sm:text-2xl lg:text-3xl 2xl:text-4xl short:text-lg font-semibold text-white">{title}</h1>}
          {subtitle && <p className="text-sm sm:text-base 2xl:text-lg short:text-sm text-gray-400 leading-relaxed">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
