import type { Baseline } from '../types'

const KEY = 'modelBaselines'

export function loadBaselines(): Baseline[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Baseline[]) : []
  } catch {
    return []
  }
}

export function saveBaselines(baselines: Baseline[]) {
  localStorage.setItem(KEY, JSON.stringify(baselines))
}
