export type ApiType = 'openai' | 'openai-responses' | 'anthropic'
export type HeaderPreset = 'default' | 'claude-code' | 'codex'
export type SuiteId = 'classic' | 'robust'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Probe {
  id: string
  weight: number
  min: number
  max: number
  temperature: number
  max_tokens: number
  prompt: string
}

export interface ProbeSuite {
  id: SuiteId
  name: string
  probes: Probe[]
}

export interface BaselineStats {
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  unique: number
  mode: number | null
  modeCount?: number
}

export interface Baseline {
  name: string
  model: string
  apiType?: ApiType | string
  iterations: number
  timestamp?: string
  distribution: number[]
  stats: BaselineStats
  protocolVersion?: string
  suiteId?: string
  suiteName?: string
  probes?: Array<Partial<Probe>>
  results?: number[]
  [key: string]: unknown
}

export interface SimilarityResult {
  cosineSimilarity: number
  jsDivergence: number
  hellinger: number
  modeScore: number
  distribScore: number
  overallScore: number
  confidence: number
}

export interface ClassifiedError {
  type: 'network' | 'auth' | 'ratelimit' | 'server' | 'parse' | 'other'
  badge: string
  friendly: string
  suggestion: string
}

export interface ConnectionConfig {
  apiType: ApiType
  baseUrl: string
  apiKey: string
  model: string
  headerPreset: HeaderPreset
}

export interface ChannelConfig extends ConnectionConfig {
  id: number
  name: string
}

export interface ProbeSampleOk {
  ok: true
  kind: 'ok'
  value: number
  text: string
}

export interface ProbeSampleFail {
  ok: false
  kind: 'parse' | 'transport'
  text?: string
  error: Error
}

export type ProbeSample = ProbeSampleOk | ProbeSampleFail
