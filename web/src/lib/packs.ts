import type { Baseline } from '../types'
import { PROTOCOL_VERSION } from './probes'

export function normalizeImportedBaselines(imported: unknown): Baseline[] | null {
  if (Array.isArray(imported)) return imported as Baseline[]
  if (imported && typeof imported === 'object') {
    const obj = imported as Record<string, unknown>
    if (Array.isArray(obj.baselines)) return obj.baselines as Baseline[]
    if (obj.distribution && obj.name) return [imported as Baseline]
  }
  return null
}

export function isValidBaseline(b: unknown): b is Baseline {
  if (!b || typeof b !== 'object') return false
  const x = b as Baseline
  return (
    typeof x.name === 'string' &&
    typeof x.model === 'string' &&
    Array.isArray(x.distribution) &&
    x.distribution.length === 355 &&
    !!x.stats &&
    typeof x.stats.mean === 'number' &&
    typeof x.stats.stdDev === 'number' &&
    typeof x.stats.median === 'number'
  )
}

export function buildExportPack(baselines: Baseline[], name = 'local-export') {
  return {
    format: 'hlwy-baseline-pack/v1',
    name,
    version: PROTOCOL_VERSION,
    createdAt: new Date().toISOString(),
    protocolVersion: PROTOCOL_VERSION,
    source: 'local-export',
    baselines,
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
