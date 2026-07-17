import type { Baseline, ProbeSuite, SuiteId } from '../types'

export const PROTOCOL_VERSION = '2.4.0'

export const PROBE_SUITES: Record<SuiteId, ProbeSuite> = {
  classic: {
    id: 'classic',
    name: '經典單探針（相容舊基準）',
    probes: [
      {
        id: 'rand_1_355_zh',
        weight: 1,
        min: 1,
        max: 355,
        temperature: 1.0,
        max_tokens: 10,
        prompt: '请从1到355之间随机选择一个数字，只输出这个数字，不要有任何其他内容。',
      },
    ],
  },
  robust: {
    id: 'robust',
    name: '穩健多探針（推薦）',
    probes: [
      {
        id: 'rand_1_355_zh',
        weight: 0.4,
        min: 1,
        max: 355,
        temperature: 1.0,
        max_tokens: 10,
        prompt: '请从1到355之间随机选择一个数字，只输出这个数字，不要有任何其他内容。',
      },
      {
        id: 'rand_1_100_zh',
        weight: 0.25,
        min: 1,
        max: 100,
        temperature: 1.0,
        max_tokens: 10,
        prompt: '请从1到100之间随机选择一个整数，只输出这个数字，不要有任何其他内容。',
      },
      {
        id: 'rand_1_355_en',
        weight: 0.2,
        min: 1,
        max: 355,
        temperature: 1.0,
        max_tokens: 10,
        prompt: 'Pick a random integer from 1 to 355. Output only the number with no other text.',
      },
      {
        id: 'rand_1_50_zh',
        weight: 0.15,
        min: 1,
        max: 50,
        temperature: 1.0,
        max_tokens: 10,
        prompt: '请从1到50之间随机选择一个整数，只输出这个数字，不要有任何其他内容。',
      },
    ],
  },
}

export function getSuite(suiteId: string | undefined | null): ProbeSuite {
  if (suiteId === 'robust') return PROBE_SUITES.robust
  return PROBE_SUITES.classic
}

export function protocolMeta(suiteId: string) {
  const suite = getSuite(suiteId)
  return {
    protocolVersion: PROTOCOL_VERSION,
    suiteId: suite.id,
    suiteName: suite.name,
    probes: suite.probes.map((p) => ({
      id: p.id,
      min: p.min,
      max: p.max,
      temperature: p.temperature,
      max_tokens: p.max_tokens,
      weight: p.weight,
      prompt: p.prompt,
    })),
  }
}

export function protocolCompatible(baseline: Baseline | null | undefined, suiteId: string): boolean {
  if (!baseline) return false
  if (!baseline.protocolVersion && !baseline.suiteId) {
    return suiteId === 'classic'
  }
  const okVersions = new Set(['2.4.0', '2.3.0'])
  return baseline.suiteId === suiteId && !!baseline.protocolVersion && okVersions.has(baseline.protocolVersion)
}

/** Allocate iterations across probes by weight (parity with legacy HTML). */
export function buildProbePlan(suite: ProbeSuite, iterations: number) {
  const primary = suite.probes[0]
  const plan = []
  let assigned = 0
  suite.probes.forEach((probe, idx) => {
    let n = Math.floor(iterations * probe.weight)
    if (idx === suite.probes.length - 1) n = Math.max(0, iterations - assigned)
    assigned += n
    for (let i = 0; i < n; i++) plan.push(probe)
  })
  while (plan.length < iterations) plan.push(primary)
  return plan
}
