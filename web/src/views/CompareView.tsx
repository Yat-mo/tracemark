import { useMemo, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Field, SelectInput, TextInput } from '../components/Field'
import { GroupedSection } from '../components/GroupedSection'
import { StatusBanner } from '../components/StatusBanner'
import { DistributionChart } from '../components/charts/DistributionChart'
import { abortAllInFlight, getProbeSample } from '../lib/api'
import { buildProbePlan, getSuite, protocolCompatible } from '../lib/probes'
import { runWithConcurrency } from '../lib/run'
import { calculateSimilarity, calculateStats, sampleQuality, toStoredDistribution } from '../lib/scoring'
import type { ApiType, Baseline, ChannelConfig, HeaderPreset, SuiteId } from '../types'

interface RankedChannel {
  channel: ChannelConfig
  distribution: number[]
  stats: ReturnType<typeof calculateStats>
  similarity: ReturnType<typeof calculateSimilarity>
  score: number
  totalResults: number
}

function emptyChannel(id: number): ChannelConfig {
  return {
    id,
    name: `渠道 ${id}`,
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: '',
    headerPreset: 'default',
  }
}

export function CompareView({ baselines }: { baselines: Baseline[] }) {
  const [baselineIndex, setBaselineIndex] = useState(0)
  const [suiteId, setSuiteId] = useState<SuiteId>('robust')
  const [iterations, setIterations] = useState(200)
  const [concurrency, setConcurrency] = useState(5)
  const [channels, setChannels] = useState<ChannelConfig[]>([emptyChannel(1)])
  const nextId = useRef(2)
  const [running, setRunning] = useState(false)
  const runningRef = useRef(false)
  const [channelProgress, setChannelProgress] = useState<Record<number, { pct: number; text: string }>>({})
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null)
  const [ranked, setRanked] = useState<RankedChannel[]>([])
  const [chartSeries, setChartSeries] = useState<
    Array<{ label: string; distribution: number[]; type?: 'bar' | 'line' }> | null
  >(null)

  const suite = useMemo(() => getSuite(suiteId), [suiteId])
  const selectedBaseline = baselines[baselineIndex]

  const updateChannel = (id: number, patch: Partial<ChannelConfig>) => {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const addChannel = () => {
    const id = nextId.current++
    setChannels((prev) => [...prev, emptyChannel(id)])
  }

  const removeChannel = (id: number) => {
    setChannels((prev) => prev.filter((c) => c.id !== id))
  }

  const stop = () => {
    runningRef.current = false
    setRunning(false)
    abortAllInFlight()
  }

  const runChannelTest = async (channel: ChannelConfig) => {
    const results: number[] = []
    let successCount = 0
    let parseFailCount = 0
    let transportFailCount = 0
    const primaryProbe = suite.probes[0]
    const plan = buildProbePlan(suite, iterations)

    await runWithConcurrency(
      plan.length,
      Math.max(1, Math.min(50, concurrency)),
      () => runningRef.current,
      async (i) => {
        if (!runningRef.current) return false
        const probe = plan[i]
        try {
          const sample = await getProbeSample(
            channel.apiType,
            channel.baseUrl.trim(),
            channel.apiKey.trim(),
            channel.model.trim(),
            channel.headerPreset,
            probe,
          )
          if (sample.ok) {
            if (probe.id === primaryProbe.id) results.push(sample.value)
            successCount++
          } else if (sample.kind === 'parse') {
            parseFailCount++
          } else {
            transportFailCount++
          }
        } catch {
          transportFailCount++
        }
        return true
      },
      (completed, total) => {
        const pct = (completed / total) * 100
        setChannelProgress((prev) => ({
          ...prev,
          [channel.id]: {
            pct,
            text: `${successCount} 成功 / 解析${parseFailCount} / 傳輸${transportFailCount} / ${total}`,
          },
        }))
      },
    )

    const quality = sampleQuality(successCount, parseFailCount, transportFailCount, iterations)
    const errorCount = parseFailCount + transportFailCount
    setChannelProgress((prev) => ({
      ...prev,
      [channel.id]: {
        pct: 100,
        text:
          results.length >= 40
            ? `完成 — 主探針 ${results.length}，品質 ${(quality * 100).toFixed(0)}%`
            : `資料不足 (${results.length}/40) — 失敗 ${errorCount}`,
      },
    }))

    return { channel, results, successCount, errorCount, parseFailCount, transportFailCount, quality }
  }

  const start = async () => {
    if (!baselines.length || !selectedBaseline) {
      setStatus({ type: 'error', text: '請先在「標定基準」中建立或匯入基準' })
      return
    }
    if (selectedBaseline.stats.mode == null) {
      setStatus({ type: 'error', text: `基準「${selectedBaseline.name}」是舊版資料，缺少眾數，請刪除後重新標定` })
      return
    }
    if (!channels.length) {
      setStatus({ type: 'error', text: '請至少添加一個渠道' })
      return
    }
    if (!protocolCompatible(selectedBaseline, suiteId)) {
      setStatus({
        type: 'error',
        text: `所選基準與探針套件不相容。基準套件=${selectedBaseline.suiteId || 'classic(legacy)'}，目前=${suiteId}`,
      })
      return
    }
    for (const ch of channels) {
      if (!ch.baseUrl.trim() || !ch.apiKey.trim() || !ch.model.trim() || !ch.name.trim()) {
        setStatus({ type: 'error', text: `渠道「${ch.name || ch.id}」資訊不完整` })
        return
      }
    }

    setRunning(true)
    runningRef.current = true
    setRanked([])
    setChartSeries(null)
    setChannelProgress({})
    setStatus({ type: 'info', text: `正在平行測試 ${channels.length} 個渠道…` })

    const channelResults = await Promise.all(channels.map((ch) => runChannelTest(ch)))

    runningRef.current = false
    setRunning(false)

    const validResults = channelResults.filter((r) => r.results.length >= 40)
    if (!validResults.length) {
      setStatus({ type: 'error', text: '所有渠道均未獲得足夠資料（至少 40 個），無法排名' })
      return
    }

    const rankedList: RankedChannel[] = validResults
      .map((r) => {
        const stored = toStoredDistribution(r.results)
        const stats = calculateStats(r.results)
        const similarity = calculateSimilarity(
          stored,
          selectedBaseline.distribution,
          stats,
          selectedBaseline.stats,
          r.quality || 1,
        )
        return {
          channel: r.channel,
          distribution: stored,
          stats,
          similarity,
          score: similarity.overallScore,
          totalResults: r.results.length,
        }
      })
      .sort((a, b) => b.score - a.score)

    setRanked(rankedList)
    setChartSeries([
      { label: `基準: ${selectedBaseline.name}`, distribution: selectedBaseline.distribution, type: 'line' },
      ...rankedList.map((r) => ({ label: r.channel.name, distribution: r.distribution, type: 'bar' as const })),
    ])

    const failed = channelResults.length - validResults.length
    setStatus({
      type: 'success',
      text:
        failed > 0
          ? `橫評完成！${validResults.length} 個渠道成功排名，${failed} 個資料不足未參與`
          : `橫評完成！${validResults.length} 個渠道成功排名`,
    })
  }

  return (
    <div className="stack">
      <div>
        <h2 className="page-title">渠道橫評 · Compare</h2>
        <p className="page-subtitle">同時測試多個中轉渠道，與官方基準比對匹配度排名。</p>
      </div>

      <GroupedSection title="基準與探測">
        <Field label="選擇官方基準">
          <SelectInput
            value={baselines.length ? String(baselineIndex) : ''}
            onChange={(e) => setBaselineIndex(parseInt(e.target.value || '0', 10))}
          >
            {!baselines.length ? (
              <option value="">-- 請先建立或匯入基準 --</option>
            ) : (
              baselines.map((b, i) => (
                <option key={`${b.name}-${i}`} value={i}>
                  {b.name}（{b.model}，{b.iterations} 樣本）
                </option>
              ))
            )}
          </SelectInput>
        </Field>
        <Field label="探針套件">
          <SelectInput value={suiteId} onChange={(e) => setSuiteId(e.target.value as SuiteId)}>
            <option value="robust">穩健多探針（推薦）</option>
            <option value="classic">經典單探針（相容舊基準）</option>
          </SelectInput>
        </Field>
        <div className="row">
          <Field label="每渠道測試次數（50–500）">
            <TextInput
              type="number"
              min={50}
              max={500}
              value={iterations}
              onChange={(e) => setIterations(Math.max(50, Math.min(500, parseInt(e.target.value || '200', 10))))}
            />
          </Field>
          <Field label="每渠道併發數（1–50）">
            <TextInput
              type="number"
              min={1}
              max={50}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, Math.min(50, parseInt(e.target.value || '5', 10))))}
            />
          </Field>
        </div>
      </GroupedSection>

      <GroupedSection title="渠道配置">
        <div className="stack">
          {channels.map((ch, idx) => (
            <div className="channel-card" key={ch.id}>
              <div className="channel-card-header">
                <div className="channel-title">#{idx + 1} 渠道配置</div>
                <Button size="sm" variant="danger" onClick={() => removeChannel(ch.id)} disabled={running}>
                  刪除
                </Button>
              </div>
              <Field label="渠道名稱">
                <TextInput value={ch.name} onChange={(e) => updateChannel(ch.id, { name: e.target.value })} />
              </Field>
              <div className="row">
                <Field label="API 類型">
                  <SelectInput
                    value={ch.apiType}
                    onChange={(e) => updateChannel(ch.id, { apiType: e.target.value as ApiType })}
                  >
                    <option value="openai">OpenAI 相容格式</option>
                    <option value="openai-responses">OpenAI Responses API</option>
                    <option value="anthropic">Anthropic Claude API</option>
                  </SelectInput>
                </Field>
                <Field label="請求頭偽裝">
                  <SelectInput
                    value={ch.headerPreset}
                    onChange={(e) => updateChannel(ch.id, { headerPreset: e.target.value as HeaderPreset })}
                  >
                    <option value="default">預設</option>
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">Codex CLI</option>
                  </SelectInput>
                </Field>
              </div>
              <div className="row">
                <Field label="Base URL">
                  <TextInput
                    value={ch.baseUrl}
                    onChange={(e) => updateChannel(ch.id, { baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </Field>
                <Field label="API Key">
                  <TextInput
                    type="password"
                    value={ch.apiKey}
                    onChange={(e) => updateChannel(ch.id, { apiKey: e.target.value })}
                    placeholder="sk-..."
                    autoComplete="off"
                  />
                </Field>
              </div>
              <Field label="模型名稱">
                <TextInput value={ch.model} onChange={(e) => updateChannel(ch.id, { model: e.target.value })} />
              </Field>
              {channelProgress[ch.id] ? (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="progress">
                    <span style={{ width: `${channelProgress[ch.id].pct}%` }} />
                  </div>
                  <div style={{ color: 'var(--label-secondary)', fontSize: '0.86rem' }}>
                    {channelProgress[ch.id].text}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="btn-row">
          <Button variant="secondary" onClick={addChannel} disabled={running}>
            + 添加渠道
          </Button>
          <Button onClick={start} disabled={running}>
            {running ? '橫評中…' : '開始橫評'}
          </Button>
          {running ? (
            <Button variant="danger" onClick={stop}>
              中止
            </Button>
          ) : null}
        </div>
      </GroupedSection>

      {status ? <StatusBanner type={status.type}>{status.text}</StatusBanner> : null}

      {ranked.length > 0 && selectedBaseline ? (
        <GroupedSection title="橫評排行榜">
          <p style={{ color: 'var(--label-secondary)', marginBottom: 8 }}>
            基準：<strong>{selectedBaseline.name}</strong>（{selectedBaseline.model}）
          </p>
          <div className="table-wrap">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>渠道名稱</th>
                  <th>綜合匹配度</th>
                  <th>眾數匹配</th>
                  <th>餘弦相似度</th>
                  <th>JS 散度</th>
                  <th>置信</th>
                  <th>資料量</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => {
                  const rankClass = i < 3 ? `rank-${i + 1}` : 'rank-other'
                  const scorePct = (r.score * 100).toFixed(2)
                  const barWidth = Math.max(5, r.score * 120)
                  const modeMatch = r.stats.mode === selectedBaseline.stats.mode ? '是' : '否'
                  return (
                    <tr key={r.channel.id}>
                      <td>
                        <span className={`rank-badge ${rankClass}`}>{i + 1}</span>
                      </td>
                      <td>
                        <strong>{r.channel.name}</strong>
                      </td>
                      <td>
                        {scorePct}%
                        <span className="score-bar" style={{ width: barWidth }} />
                      </td>
                      <td>
                        {modeMatch} {r.stats.mode}（基準 {selectedBaseline.stats.mode}）
                      </td>
                      <td>{(r.similarity.cosineSimilarity * 100).toFixed(2)}%</td>
                      <td>{r.similarity.jsDivergence.toFixed(4)}</td>
                      <td>{((r.similarity.confidence || 0) * 100).toFixed(0)}%</td>
                      <td>{r.totalResults}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </GroupedSection>
      ) : null}

      {chartSeries ? (
        <GroupedSection title="分佈對比（所有渠道 vs 基準）">
          <DistributionChart series={chartSeries} />
        </GroupedSection>
      ) : null}
    </div>
  )
}
