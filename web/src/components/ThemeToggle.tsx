import type { ThemeMode } from '../types'

const ORDER: ThemeMode[] = ['system', 'light', 'dark']

const LABELS: Record<ThemeMode, string> = {
  system: '系統',
  light: '淺色',
  dark: '深色',
}

export function ThemeToggle({
  mode,
  onChange,
}: {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
}) {
  const next = () => {
    const i = ORDER.indexOf(mode)
    onChange(ORDER[(i + 1) % ORDER.length])
  }
  return (
    <button type="button" className="btn btn-secondary btn-small" onClick={next} title="切換主題">
      {LABELS[mode]}
    </button>
  )
}
