import { useEffect, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import type { TabId } from './components/SegmentedControl'
import { CalibrateView } from './views/CalibrateView'
import { TestView } from './views/TestView'
import { BaselinesView } from './views/BaselinesView'
import { CompareView } from './views/CompareView'
import { loadBaselines, saveBaselines } from './lib/baselinesStore'
import { applyTheme, readThemeMode, writeThemeMode } from './lib/theme'
import type { Baseline, ThemeMode } from './types'

export default function App() {
  const [tab, setTab] = useState<TabId>('calibrate')
  const [baselines, setBaselines] = useState<Baseline[]>(() => loadBaselines())
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode())

  useEffect(() => {
    applyTheme(themeMode)
    writeThemeMode(themeMode)
  }, [themeMode])

  useEffect(() => {
    if (themeMode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themeMode])

  const updateBaselines = (next: Baseline[]) => {
    setBaselines(next)
    saveBaselines(next)
  }

  return (
    <div className="app-shell">
      <Toolbar tab={tab} onTabChange={setTab} themeMode={themeMode} onThemeChange={setThemeMode} />
      <main className="app-content">
        {tab === 'calibrate' ? (
          <CalibrateView baselines={baselines} onBaselinesChange={updateBaselines} />
        ) : null}
        {tab === 'test' ? <TestView baselines={baselines} /> : null}
        {tab === 'baselines' ? (
          <BaselinesView baselines={baselines} onBaselinesChange={updateBaselines} />
        ) : null}
        {tab === 'compare' ? <CompareView baselines={baselines} /> : null}
      </main>
    </div>
  )
}
