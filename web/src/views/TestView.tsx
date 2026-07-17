import { useMemo, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { ConnectionFields, type ConnectionValue } from '../components/ConnectionFields'
import { ErrorPanel, type ErrorEntry } from '../components/ErrorPanel'
import { Field, SelectInput, TextInput } from '../components/Field'
import { GroupedSection } from '../components/GroupedSection'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBanner } from '../components/StatusBanner'
import { DistributionChart } from '../components/charts/DistributionChart'
import { abortAllInFlight, getProbeSample } from '../lib/api'
import { classifyError } from '../lib/errors'
import { buildProbePlan, getSuite, protocolCompatible } from '../lib/probes'
import { runWithConcurrency } from '../lib/run'
import { matchBaselines, sampleQuality, toStoredDistribution } from '../lib/scoring'
import type { Baseline, SuiteId } from '../types'

const defaultConn: ConnectionValue = {
  apiType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  headerPreset: 'default',
}

export function TestView({ baselines }: { baselines: Baseline[] }) {
  const [conn, setConn] = useState<ConnectionValue>(defaultConn)
  const [suiteId, setSuiteId] = useState<SuiteId>('robust')
  const [iterations, setIterations] = useState(200)
  const [concurrency, setConcurrency] = useState(1)
  const [running, setRunning] = useState(false)
  const runningRef = useRef(false)
  const [progress, setProgress] = useState(0)
  const [progressDetail, setProgressDetail] = useState('')
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null)
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [earlyWarning, setEarlyWarning] = useState<string | null>(null)
  const [matches, setMatches] = useState<
    Array<{
      baseline: Baseline
      score: number
      modeMatch: boolean
      similarity: {
        confidence: number
        modeScore: number
        distribScore: number
        cosineSimilarity: number
        jsDivergence: number
        hellinger: number
      }
      testStats: { mode: number | null }
    }>
  >([])
  const [chartSeries, setChartSeries] = useState<
    Array<{ label: string; distribution: number[] }> | null
  >(null)
  const consecutiveRef = useRef(0)
  const suite = useMemo(() => getSuite(suiteId), [suiteId])

  const addError = (error: unknown) => {
    const classified = classifyError(error)
    setErrors((prev) =>
      [
        {
          time: new Date().toLocaleTimeString('zh-Hant'),
          classified,
          raw: error instanceof Error ? error.message : String(error),
        },
        ...prev,
      ].slice(0, 50),
    )
    consecutiveRef.current += 1
    if (consecutiveRef.current >= 5) {
      setEarlyWarning(`${classified.friendly}。${classified.suggestion}`)
    }
  }

  const stop = () => {
    runningRef.current = false
    setRunning(false)
    abortAllInFlight()
  }

  const start = async () => {
    if (!conn.baseUrl.trim() || !conn.apiKey.trim() || !conn.model.trim()) {
      setStatus({ type: 'error', text: '請填寫 Base URL、API Key 與模型名稱' })
      return
    }
    if (iterations < 50 || iterations > 500) {
      setStatus({ type: 'error', text: '測試次數必須在 50–500 之間' })
      return
    }
    const compatible = baselines.filter((b) => protocolCompatible(b, suiteId))
    if (!compatible.length) {
      setStatus({
        type: 'error',
        text: '沒有與目前探針套件相容的基準。請先標定或匯入對應套件的基準。',
      })
      return
    }

    setRunning(true)
    runningRef.current = true
    setProgress(0)
    setStatus({ type: 'info', text: `正在測試（套件 ${suite.name}）…` })
    setErrors([])
    setEarlyWarning(null)
    setMatches([])
    setChartSeries(null)
    consecutiveRef.current = 0

    const plan = buildProbePlan(suite, iterations)
    const primaryProbe = suite.probes[0]
    const primaryResults: number[] = []
    let successCount = 0
    let parseFailCount = 0
    let transportFailCount = 0

    await runWithConcurrency(
      plan.length,
      Math.max(1, Math.min(50, concurrency)),
      () => runningRef.current,
      async (i) => {
        if (!runningRef.current) return false
        const probe = plan[i]
        const sample = await getProbeSample(
          conn.apiType,
          conn.baseUrl.trim(),
          conn.apiKey.trim(),
          conn.model.trim(),
          conn.headerPreset,
          probe,
        )
        if (sample.ok) {
          if (probe.id === primaryProbe.id) primaryResults.push(sample.value)
          successCount++
          consecutiveRef.current = 0
        } else if (sample.kind === 'parse') {
          parseFailCount++
          addError(sample.error)
        } else if (sample.kind === 'transport') {
          transportFailCount++
          addError(sample.error)
        }
        return true
      },
      (completed, total) => {
        setProgress((completed / total) * 100)
        setProgressDetail(`成功 ${successCount} · 解析失敗 ${parseFailCount} · 傳輸失敗 ${transportFailCount}`)
      },
    )

    const wasRunning = runningRef.current
    runningRef.current = false
    setRunning(false)

    if (!wasRunning && primaryResults.length < 20) {
      setStatus({ type: 'error', text: '測試已中止' })
      return
    }
    if (primaryResults.length < 20) {
      setStatus({
        type: 'error',
        text: `有效樣本不足（${primaryResults.length}）。成功 ${successCount}，解析失敗 ${parseFailCount}，傳輸失敗 ${transportFailCount}`,
      })
      return
    }

    const quality = sampleQuality(successCount, parseFailCount, transportFailCount, iterations)
    const distribution = toStoredDistribution(primaryResults)
    const ranked = matchBaselines(baselines, distribution, primaryResults, suiteId, quality, protocolCompatible)
    setMatches(ranked.slice(0, 5))
    if (ranked[0]) {
      setChartSeries([
        { label: `測試: ${conn.model}`, distribution },
        { label: `基準: ${ranked[0].baseline.name}`, distribution: ranked[0].baseline.distribution },
      ])
    }
    setStatus({
      type: 'success',
      text: `測試完成。成功 ${successCount}，解析失敗 ${parseFailCount}，傳輸失敗 ${transportFailCount}；樣本品質 ${(quality * 100).toFixed(0)}%`,
    })
  }

  return (
    <div className="stack">
      <div>
        <h2 className="page-title">測試識別 · Test</h2>
        <p className="page-subtitle">對未知渠道取樣，並與已保存基準比對匹配度。</p>
      </div>

      <GroupedSection title="連線設定">
        <ConnectionFields value={conn} onChange={setConn} modelPlaceholder="unknown-model" />
      </GroupedSection>

      <GroupedSection title="探測設定">
        <Field label="探針套件">
          <SelectInput value={suiteId} onChange={(e) => setSuiteId(e.target.value as SuiteId)}>
            <option value="robust">穩健多探針（推薦）</option>
            <option value="classic">經典單探針（相容舊基準）</option>
          </SelectInput>
        </Field>
        <div className="row">
          <Field label="測試次數（50–500）">
            <TextInput
              type="number"
              min={50}
              max={500}
              value={iterations}
              onChange={(e) => setIterations(parseInt(e.target.value || '0', 10))}
            />
          </Field>
          <Field label="併發數（1–50）">
            <TextInput
              type="number"
              min={1}
              max={50}
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value || '1', 10))}
            />
          </Field>
        </div>
        <div className="btn-row">
          <Button onClick={start} disabled={running}>
            {running ? '測試中…' : '開始測試'}
          </Button>
          {running ? (
            <Button variant="danger" onClick={stop}>
              中止
            </Button>
          ) : null}
        </div>
      </GroupedSection>

      {(running || progress > 0) && (
        <GroupedSection title="進度">
          <ProgressBar value={progress} detail={progressDetail} />
        </GroupedSection>
      )}

      {status ? <StatusBanner type={status.type}>{status.text}</StatusBanner> : null}
      {earlyWarning ? <StatusBanner type="warning">{earlyWarning}</StatusBanner> : null}
      <ErrorPanel summary={`發生 ${errors.length} 個錯誤`} errors={errors} />

      {matches.length > 0 ? (
        <GroupedSection title="識別結果">
          <div className="stack">
            {matches.map((m, index) => (
              <div className="match-item" key={`${m.baseline.name}-${index}`}>
                <div className="model-name">
                  #{index + 1} {m.baseline.name}
                </div>
                <div className="similarity">
                  <strong>綜合匹配度:</strong> {(m.score * 100).toFixed(2)}%（置信{' '}
                  {(m.similarity.confidence * 100).toFixed(0)}%）
                  <br />
                  <strong>眾數匹配:</strong> {(m.similarity.modeScore * 100).toFixed(0)}%（測試=
                  {m.testStats.mode ?? '—'}, 基準={m.baseline.stats.mode ?? '—'}）
                  <br />
                  <strong>分佈分:</strong> {((m.similarity.distribScore || 0) * 100).toFixed(2)}%
                  <br />
                  <strong>餘弦相似度:</strong> {(m.similarity.cosineSimilarity * 100).toFixed(2)}%
                  <br />
                  <strong>JS 散度:</strong> {m.similarity.jsDivergence.toFixed(4)} | Hellinger:{' '}
                  {(m.similarity.hellinger || 0).toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </GroupedSection>
      ) : null}

      {chartSeries ? (
        <GroupedSection title="分佈對比">
          <DistributionChart series={chartSeries} />
        </GroupedSection>
      ) : null}
    </div>
  )
}
