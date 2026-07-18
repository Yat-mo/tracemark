import type { ReactNode } from 'react'

export function GroupedSection({
  title,
  description,
  footer,
  children,
}: {
  title?: string
  description?: string
  footer?: string
  children: ReactNode
}) {
  return (
    <section className="grouped">
      {(title || description) && (
        <div className="grouped-header">
          {title ? <h3>{title}</h3> : null}
          {description ? <p>{description}</p> : null}
        </div>
      )}
      <div className="grouped-body">{children}</div>
      {footer ? <div className="grouped-footer">{footer}</div> : null}
    </section>
  )
}
