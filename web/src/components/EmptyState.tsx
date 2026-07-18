import type { ReactNode } from 'react'
import { Button } from './Button'

export function EmptyState({
  title,
  text,
  icon = '∅',
  actions,
}: {
  title: string
  text: string
  icon?: string
  actions?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-text">{text}</div>
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </div>
  )
}

export function EmptyStateActionButton({
  children,
  onClick,
  primary = false,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <Button size="sm" variant={primary ? 'primary' : 'secondary'} onClick={onClick}>
      {children}
    </Button>
  )
}
