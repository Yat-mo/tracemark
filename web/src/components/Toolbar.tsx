import { SegmentedControl, type TabId } from './SegmentedControl'
import { ThemeToggle } from './ThemeToggle'
import type { ThemeMode } from '../types'

export const APP_VERSION = '2.5.0'

export function Toolbar({
  tab,
  onTabChange,
  themeMode,
  onThemeChange,
}: {
  tab: TabId
  onTabChange: (id: TabId) => void
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
}) {
  return (
    <header className="toolbar">
      <div className="toolbar-inner">
        <div className="brand">
          <div className="brand-title">TraceMark</div>
          <div className="brand-sub">模型行為指紋探測 · Behavioral Model Fingerprinting</div>
        </div>
        <SegmentedControl value={tab} onChange={onTabChange} />
        <div className="toolbar-actions">
          <span className="chip">v{APP_VERSION}</span>
          <ThemeToggle mode={themeMode} onChange={onThemeChange} />
        </div>
      </div>
    </header>
  )
}
