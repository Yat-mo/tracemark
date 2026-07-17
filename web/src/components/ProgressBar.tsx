export function ProgressBar({
  value,
  label,
  detail,
}: {
  value: number
  label?: string
  detail?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="progress-meta">
        <span>{label || '進度'}</span>
        <span>
          {Math.round(pct)}%{detail ? ` · ${detail}` : ''}
        </span>
      </div>
      <div className="progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
