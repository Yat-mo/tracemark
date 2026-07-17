import type { ReactNode } from 'react'

export function GroupedSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="grouped">
      <div className="grouped-header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="grouped-body">{children}</div>
    </section>
  )
}
