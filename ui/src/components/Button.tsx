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
    'rounded-xl px-5 py-3 sm:py-4 2xl:py-5 font-medium text-sm sm:text-base 2xl:text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-40 disabled:cursor-not-allowed'

  const variants = {
    primary:
      'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white focus:ring-cyan-500',
    secondary:
      'bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-gray-200 focus:ring-gray-500',
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
