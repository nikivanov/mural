import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  subtitle?: string
  children: ReactNode
  className?: string
}

export function Card({ title, subtitle, children, className = '' }: CardProps) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-10 2xl:p-14 space-y-5 sm:space-y-6 2xl:space-y-8 ${className}`}>
      {(title || subtitle) && (
        <div className="space-y-1 text-center">
          {title && <h1 className="text-xl sm:text-2xl lg:text-3xl 2xl:text-4xl font-semibold text-white">{title}</h1>}
          {subtitle && <p className="text-sm sm:text-base 2xl:text-lg text-slate-400 leading-relaxed">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
