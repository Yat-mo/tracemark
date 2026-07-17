import { describe, expect, it } from 'vitest'
import { extractNumber } from './parse'
import {
  calculateDistribution,
  calculateSimilarity,
  calculateStats,
  sampleQuality,
  toStoredDistribution,
} from './scoring'
import { getSuite, protocolCompatible, buildProbePlan } from './probes'
import { isValidBaseline, normalizeImportedBaselines } from './packs'
import { classifyError } from './errors'
import type { Baseline } from '../types'

describe('extractNumber', () => {
  it('accepts pure integers in range', () => {
    expect(extractNumber('42')).toBe(42)
    expect(extractNumber('1')).toBe(1)
    expect(extractNumber('355')).toBe(355)
  })

  it('accepts optional quotes and trailing punctuation', () => {
    expect(extractNumber('"17"')).toBe(17)
    expect(extractNumber('17。')).toBe(17)
    expect(extractNumber('`9`')).toBe(9)
  })

  it('rejects free text or out of range', () => {
    expect(extractNumber('The number is 17')).toBeNull()
    expect(extractNumber('0')).toBeNull()
    expect(extractNumber('356')).toBeNull()
    expect(extractNumber('')).toBeNull()
    expect(extractNumber(null)).toBeNull()
  })
})

describe('scoring', () => {
  it('calculates distribution over 1..max', () => {
    const dist = calculateDistribution([1, 1, 2], 2)
    expect(dist).toEqual([2 / 3, 1 / 3])
  })

  it('calculates stats with mode', () => {
    const stats = calculateStats([10, 20, 20, 30])
    expect(stats.mode).toBe(20)
    expect(stats.modeCount).toBe(2)
    expect(stats.mean).toBe(20)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(30)
    expect(stats.unique).toBe(3)
  })

  it('scores identical distributions highly', () => {
    const numbers = Array.from({ length: 100 }, (_, i) => (i % 10) + 1)
    const dist = toStoredDistribution(numbers)
    const stats = calculateStats(numbers)
    const sim = calculateSimilarity(dist, dist, stats, stats, 1)
    expect(sim.overallScore).toBeGreaterThan(0.9)
    expect(sim.modeScore).toBe(1)
    expect(sim.confidence).toBeGreaterThan(0.8)
  })

  it('sampleQuality penalizes parse failures', () => {
    const good = sampleQuality(100, 0, 0, 100)
    const bad = sampleQuality(50, 50, 0, 100)
    expect(good).toBeGreaterThan(bad)
  })
})

describe('protocol', () => {
  it('treats legacy baselines as classic-only', () => {
    const legacy = {
      name: 'old',
      model: 'x',
      iterations: 10,
      distribution: new Array(355).fill(0),
      stats: { mean: 1, median: 1, stdDev: 0, min: 1, max: 1, unique: 1, mode: 1 },
    } as Baseline
    expect(protocolCompatible(legacy, 'classic')).toBe(true)
    expect(protocolCompatible(legacy, 'robust')).toBe(false)
  })

  it('builds probe plan with weight allocation', () => {
    const suite = getSuite('robust')
    const plan = buildProbePlan(suite, 100)
    expect(plan).toHaveLength(100)
    expect(plan.filter((p) => p.id === 'rand_1_355_zh')).toHaveLength(40)
  })
})

describe('packs', () => {
  const valid: Baseline = {
    name: 'demo',
    model: 'm',
    iterations: 50,
    distribution: new Array(355).fill(1 / 355),
    stats: { mean: 10, median: 10, stdDev: 1, min: 1, max: 20, unique: 5, mode: 10 },
  }

  it('normalizes array / pack / single', () => {
    expect(normalizeImportedBaselines([valid])?.length).toBe(1)
    expect(normalizeImportedBaselines({ baselines: [valid] })?.length).toBe(1)
    expect(normalizeImportedBaselines(valid)?.length).toBe(1)
    expect(normalizeImportedBaselines({ foo: 1 })).toBeNull()
  })

  it('validates baseline shape', () => {
    expect(isValidBaseline(valid)).toBe(true)
    expect(isValidBaseline({ ...valid, distribution: [1, 2] })).toBe(false)
  })
})

describe('classifyError', () => {
  it('classifies HTTP and network errors', () => {
    expect(classifyError(new Error('API错误: 401 - no')).type).toBe('auth')
    expect(classifyError(new Error('API错误: 429 - slow')).type).toBe('ratelimit')
    expect(classifyError(new Error('Failed to fetch')).type).toBe('network')
  })
})
