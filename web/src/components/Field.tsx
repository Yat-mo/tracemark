import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Field({
  label,
  hint,
  children,
  stack = false,
}: {
  label: string
  hint?: string
  children: ReactNode
  /** Stacked label above control — use for long free-text / primary naming fields */
  stack?: boolean
}) {
  return (
    <div className={stack ? 'field field-stack' : 'field'}>
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />
}
