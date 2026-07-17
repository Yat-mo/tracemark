import type { Baseline, BaselineStats, SimilarityResult } from '../types'

export function calculateDistribution(numbers: number[], maxValue = 355): number[] {
  const counts = new Array(maxValue).fill(0)
  numbers.forEach((num) => {
    if (num >= 1 && num <= maxValue) counts[num - 1]++
  })
  const total = numbers.length || 1
  return counts.map((c) => c / total)
}

export function calculateStats(numbers: number[]): BaselineStats {
  if (!numbers.length) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, unique: 0, mode: null, modeCount: 0 }
  }
  const sorted = [...numbers].sort((a, b) => a - b)
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length
  const variance = numbers.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / numbers.length
  const freq: Record<number, number> = {}
  numbers.forEach((n) => {
    freq[n] = (freq[n] || 0) + 1
  })
  let modeVal = numbers[0]
  let modeCount = 0
  for (const [k, v] of Object.entries(freq)) {
    if (v > modeCount) {
      modeCount = v
      modeVal = parseInt(k, 10)
    }
  }
  return {
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    stdDev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    unique: new Set(numbers).size,
    mode: modeVal,
    modeCount,
  }
}

export function hellingerDistance(dist1: number[], dist2: number[]): number {
  let s = 0
  const n = Math.min(dist1.length, dist2.length)
  for (let i = 0; i < n; i++) {
    const a = Math.sqrt(Math.max(0, dist1[i]))
    const b = Math.sqrt(Math.max(0, dist2[i]))
    s += (a - b) * (a - b)
  }
  return Math.sqrt(s / 2)
}

export function calculateSimilarity(
  dist1: number[],
  dist2: number[],
  stats1: BaselineStats | null | undefined,
  stats2: BaselineStats | null | undefined,
  sampleQualityValue = 1,
): SimilarityResult {
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  const n = Math.min(dist1.length, dist2.length)
  for (let i = 0; i < n; i++) {
    dotProduct += dist1[i] * dist2[i]
    norm1 += dist1[i] * dist1[i]
    norm2 += dist2[i] * dist2[i]
  }
  const denom = Math.sqrt(norm1) * Math.sqrt(norm2)
  const cosineSim = denom > 0 ? dotProduct / denom : 0

  let jsDiv = 0
  const epsilon = 1e-10
  for (let i = 0; i < n; i++) {
    const p = dist1[i] + epsilon
    const q = dist2[i] + epsilon
    const m = (p + q) / 2
    jsDiv += (p * Math.log(p / m) + q * Math.log(q / m)) / 2
  }

  const hellinger = hellingerDistance(dist1, dist2)
  const distribScore = Math.max(0, Math.min(1, cosineSim * Math.exp(-jsDiv) * (1 - hellinger)))

  let modeScore = 0
  if (stats1 && stats2 && stats1.mode != null && stats2.mode != null) {
    const mode1 = stats1.mode
    const mode2 = stats2.mode
    if (mode1 === mode2) {
      modeScore = 1.0
    } else {
      const range = Math.max(1, Math.max(stats1.max || 355, stats2.max || 355) - Math.min(stats1.min || 1, stats2.min || 1))
      const diff = Math.abs(mode1 - mode2)
      modeScore = Math.max(0, 1 - diff / Math.max(20, range * 0.15))
    }
  }

  const quality = Math.max(0.2, Math.min(1, sampleQualityValue))
  const overallScore = (modeScore * 0.25 + distribScore * 0.75) * quality
  const confidence = Math.max(0, Math.min(1, (1 - Math.abs(modeScore - distribScore)) * quality))

  return {
    cosineSimilarity: cosineSim,
    jsDivergence: jsDiv,
    hellinger,
    modeScore,
    distribScore,
    overallScore,
    confidence,
  }
}

export function sampleQuality(
  successCount: number,
  parseFailCount: number,
  transportFailCount: number,
  targetIterations: number,
): number {
  const total = successCount + parseFailCount + transportFailCount
  if (total === 0) return 0
  const successRate = successCount / Math.max(targetIterations, total)
  const parseRate = parseFailCount / total
  return Math.max(0, Math.min(1, successRate * (1 - 0.7 * parseRate)))
}

export function toStoredDistribution(numbers: number[], maxValue = 355): number[] {
  const distribution = calculateDistribution(numbers, maxValue)
  if (distribution.length === 355) return distribution
  const arr = new Array(355).fill(0)
  for (let i = 0; i < Math.min(355, distribution.length); i++) arr[i] = distribution[i]
  const s = arr.reduce((a: number, b: number) => a + b, 0) || 1
  return arr.map((x: number) => x / s)
}

export function matchBaselines(
  baselines: Baseline[],
  testDistribution: number[],
  testResults: number[],
  suiteId: string,
  quality = 1,
  protocolCompatibleFn: (b: Baseline, suiteId: string) => boolean,
) {
  const testStats = calculateStats(testResults)
  return baselines
    .filter((b) => protocolCompatibleFn(b, suiteId))
    .map((baseline) => {
      const similarity = calculateSimilarity(
        testDistribution,
        baseline.distribution,
        testStats,
        baseline.stats,
        quality,
      )
      const modeMatch = testStats.mode === baseline.stats.mode
      return { baseline, similarity, testStats, score: similarity.overallScore, modeMatch }
    })
    .sort((a, b) => b.score - a.score)
}

export function bucketDistribution(distribution: number[], bucketSize = 10, maxValue = 355): { labels: string[]; values: number[] } {
  const buckets = Math.ceil(maxValue / bucketSize)
  const values = new Array(buckets).fill(0)
  distribution.forEach((val, idx) => {
    values[Math.floor(idx / bucketSize)] += val
  })
  const labels: string[] = []
  for (let i = 0; i < buckets; i++) {
    labels.push(`${i * bucketSize + 1}-${Math.min((i + 1) * bucketSize, maxValue)}`)
  }
  return { labels, values }
}
