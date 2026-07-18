import type { CSSProperties } from 'react'

export type TabId = 'calibrate' | 'test' | 'baselines' | 'compare'

const TABS: { id: TabId; label: string }[] = [
  { id: 'calibrate', label: '標定基準' },
  { id: 'test', label: '測試識別' },
  { id: 'baselines', label: '基準管理' },
  { id: 'compare', label: '渠道橫評' },
]

export function SegmentedControl({
  value,
  onChange,
}: {
  value: TabId
  onChange: (id: TabId) => void
}) {
  const index = Math.max(0, TABS.findIndex((t) => t.id === value))
  const style = {
    '--seg-count': TABS.length,
    '--seg-index': index,
  } as CSSProperties

  return (
    <div className="segmented" role="tablist" aria-label="主要功能" style={style}>
      <div className="segmented-thumb" aria-hidden="true" />
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          data-active={value === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
