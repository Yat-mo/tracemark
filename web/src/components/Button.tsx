import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'sm'
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: Props) {
  const classes = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-small' : '', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
