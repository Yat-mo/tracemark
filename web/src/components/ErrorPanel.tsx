import { useState } from 'react'
import type { ClassifiedError } from '../types'

export interface ErrorEntry {
  time: string
  classified: ClassifiedError
  raw: string
}

export function ErrorPanel({
  summary,
  errors,
}: {
  summary: string
  errors: ErrorEntry[]
}) {
  const [open, setOpen] = useState(false)
  if (!errors.length) return null
  return (
    <div className="error-panel">
      <button type="button" className="error-panel-header" onClick={() => setOpen((v) => !v)}>
        <span>⚠️</span>
        <strong>{summary || `發生 ${errors.length} 個錯誤`}</strong>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="error-panel-body">
          <ul>
            {errors.map((e, i) => (
              <li key={`${e.time}-${i}`}>
                <span className={`badge ${e.classified.type}`}>{e.classified.badge}</span>
                <span>{e.classified.friendly}</span>
                <span style={{ color: 'var(--label-tertiary)' }}>{e.time}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
