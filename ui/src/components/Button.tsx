import { forwardRef, type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', fullWidth = true, className = '', children, ...props },
  ref,
) {
  const base =
    'rounded-xl px-5 py-3 sm:py-4 2xl:py-5 font-medium text-sm sm:text-base 2xl:text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-40 disabled:cursor-not-allowed'

  const variants = {
    primary:
      'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white focus:ring-indigo-500',
    secondary:
      'bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-200 focus:ring-slate-500',
    danger:
      'bg-red-700 hover:bg-red-600 active:bg-red-800 text-white focus:ring-red-500',
  }

  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})
