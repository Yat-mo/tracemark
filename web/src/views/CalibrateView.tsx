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
import { buildProbePlan, getSuite, protocolMeta } from '../lib/probes'
import { runWithConcurrency } from '../lib/run'
import { calculateStats, sampleQuality, toStoredDistribution } from '../lib/scoring'
import type { Baseline, SuiteId } from '../types'

const defaultConn: ConnectionValue = {
  apiType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  headerPreset: 'default',
}

export function CalibrateView({
  baselines,
  onBaselinesChange,
}: {
  baselines: Baseline[]
  onBaselinesChange: (next: Baseline[]) => void
}) {
  const [conn, setConn] = useState<ConnectionValue>(defaultConn)
  const [suiteId, setSuiteId] = useState<SuiteId>('robust')
  const [iterations, setIterations] = useState(200)
  const [concurrency, setConcurrency] = useState(1)
  const [baselineName, setBaselineName] = useState('')
  const [running, setRunning] = useState(false)
  const runningRef = useRef(false)
  const [progress, setProgress] = useState(0)
  const [progressDetail, setProgressDetail] = useState('')
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null)
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [earlyWarning, setEarlyWarning] = useState<string | null>(null)
  const [chartDist, setChartDist] = useState<number[] | null>(null)
  const consecutiveRef = useRef(0)

  const suite = useMemo(() => getSuite(suiteId), [suiteId])

  const addError = (error: unknown) => {
    const classified = classifyError(error)
    const entry: ErrorEntry = {
      time: new Date().toLocaleTimeString('zh-Hant'),
      classified,
      raw: error instanceof Error ? error.message : String(error),
    }
    setErrors((prev) => [entry, ...prev].slice(0, 50))
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
    if (!conn.baseUrl.trim() || !conn.apiKey.trim() || !conn.model.trim() || !baselineName.trim()) {
      setStatus({ type: 'error', text: '請填寫所有必填欄位' })
      return
    }
    if (iterations < 50 || iterations > 500) {
      setStatus({ type: 'error', text: '測試次數必須在 50–500 之間' })
      return
    }

    setRunning(true)
    runningRef.current = true
    setProgress(0)
    setProgressDetail('')
    setStatus({ type: 'info', text: `正在標定（套件 ${suite.name}）…` })
    setErrors([])
    setEarlyWarning(null)
    setChartDist(null)
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
      setStatus({ type: 'error', text: '標定已中止' })
      return
    }

    if (primaryResults.length < 20) {
      setStatus({
        type: 'error',
        text: `有效主探針樣本不足（${primaryResults.length}）。成功 ${successCount}，解析失敗 ${parseFailCount}，傳輸失敗 ${transportFailCount}`,
      })
      return
    }

    const quality = sampleQuality(successCount, parseFailCount, transportFailCount, iterations)
    const distribution = toStoredDistribution(primaryResults)
    const stats = calculateStats(primaryResults)
    const meta = protocolMeta(suiteId)
    const baseline: Baseline = {
      name: baselineName.trim(),
      model: conn.model.trim(),
      apiType: conn.apiType,
      iterations: primaryResults.length,
      timestamp: new Date().toISOString(),
      distribution,
      stats,
      protocolVersion: meta.protocolVersion,
      suiteId: meta.suiteId,
      suiteName: meta.suiteName,
      probes: meta.probes,
      results: primaryResults,
      sampleQuality: quality,
    }

    onBaselinesChange([...baselines, baseline])
    setChartDist(distribution)
    setStatus({
      type: 'success',
      text: `標定完成並已保存「${baseline.name}」。主探針樣本 ${primaryResults.length}，品質 ${(quality * 100).toFixed(0)}%`,
    })
  }

  return (
    <div className="stack">
      <div>
        <h2 className="page-title">標定基準 · Calibrate</h2>
        <p className="page-subtitle">對官方 API 建立行為指紋，供後續測試與橫評比對。</p>
      </div>

      <GroupedSection title="連線設定" description="API 類型、端點與金鑰">
        <ConnectionFields value={conn} onChange={setConn} />
      </GroupedSection>

      <GroupedSection title="探測設定" description="同一套件的基準與測試才可比較">
        <Field label="探針套件" hint="舊版基準僅相容「經典單探針」。">
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
        <Field label="基準名稱">
          <TextInput
            value={baselineName}
            onChange={(e) => setBaselineName(e.target.value)}
            placeholder="例如：GPT-4o-官方-2026"
          />
        </Field>
        <div className="btn-row">
          <Button onClick={start} disabled={running}>
            {running ? '標定中…' : '開始標定'}
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

      {chartDist ? (
        <GroupedSection title="分佈圖表">
          <DistributionChart series={[{ label: baselineName || '基準', distribution: chartDist }]} />
        </GroupedSection>
      ) : null}
    </div>
  )
}
