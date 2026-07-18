import { useRef, useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState, EmptyStateActionButton } from '../components/EmptyState'
import { GroupedSection } from '../components/GroupedSection'
import { StatusBanner } from '../components/StatusBanner'
import { buildExportPack, downloadJson, isValidBaseline, normalizeImportedBaselines } from '../lib/packs'
import type { Baseline } from '../types'

export function BaselinesView({
  baselines,
  onBaselinesChange,
}: {
  baselines: Baseline[]
  onBaselinesChange: (next: Baseline[]) => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [detail, setDetail] = useState<Baseline | null>(null)
  const [renameIndex, setRenameIndex] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const exportAll = () => {
    if (!baselines.length) {
      setMessage({ type: 'error', text: '沒有可匯出的基準資料' })
      return
    }
    downloadJson(`model-baselines-pack-${Date.now()}.json`, buildExportPack(baselines))
    setMessage({ type: 'success', text: `已匯出 ${baselines.length} 個基準` })
  }

  const exportOne = (index: number) => {
    const b = baselines[index]
    downloadJson(`baseline-${b.name}-${Date.now()}.json`, [b])
  }

  const remove = (index: number) => {
    const name = baselines[index].name
    if (!window.confirm(`確定刪除「${name}」？`)) return
    const next = baselines.slice()
    next.splice(index, 1)
    onBaselinesChange(next)
    setMessage({ type: 'success', text: `已刪除「${name}」` })
  }

  const commitRename = () => {
    if (renameIndex == null) return
    const name = renameValue.trim()
    if (!name) return
    const next = baselines.slice()
    next[renameIndex] = { ...next[renameIndex], name }
    onBaselinesChange(next)
    setRenameIndex(null)
    setRenameValue('')
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const imported = JSON.parse(text)
      const list = normalizeImportedBaselines(imported)
      if (!list) {
        setMessage({ type: 'error', text: '無效的基準資料格式' })
        return
      }
      const valid = list.filter(isValidBaseline)
      if (!valid.length) {
        setMessage({ type: 'error', text: '匯入的資料中沒有有效的基準記錄' })
        return
      }
      onBaselinesChange([...baselines, ...valid])
      if (valid.length < list.length) {
        setMessage({
          type: 'success',
          text: `成功匯入 ${valid.length} 個基準（${list.length - valid.length} 個因格式不完整被跳過）`,
        })
      } else {
        setMessage({ type: 'success', text: `成功匯入 ${valid.length} 個基準` })
      }
    } catch (error) {
      setMessage({ type: 'error', text: `匯入失敗: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  const loadOfficial = async () => {
    try {
      const idxResp = await fetch('/baselines/official/index.json')
      if (!idxResp.ok) throw new Error(`無法讀取預置包索引 (${idxResp.status})`)
      const idx = await idxResp.json()
      const packs = idx.packs || []
      if (!packs.length) {
        setMessage({ type: 'error', text: '未找到預置基準包。可先執行: python3 hlwy_check.py gen-demo-packs' })
        return
      }
      let importedCount = 0
      const names: string[] = []
      let next = [...baselines]
      for (const packMeta of packs) {
        if (!packMeta.url) continue
        const resp = await fetch(packMeta.url)
        if (!resp.ok) continue
        const data = await resp.json()
        const list = normalizeImportedBaselines(data) || []
        const valid = list.filter(isValidBaseline)
        if (!valid.length) continue
        const existing = new Set(next.map((b) => b.name))
        const fresh = valid.filter((b) => !existing.has(b.name))
        next = [...next, ...fresh]
        importedCount += fresh.length
        names.push(`${packMeta.name || packMeta.file} (+${fresh.length})`)
      }
      onBaselinesChange(next)
      setMessage({
        type: importedCount > 0 ? 'success' : 'info',
        text:
          importedCount > 0
            ? `已載入預置基準 ${importedCount} 個：${names.join('；')}。注意：demo 包是 synthetic，不是真實官方指紋。`
            : '沒有新的預置基準可匯入（可能已全部存在）。',
      })
    } catch (error) {
      setMessage({ type: 'error', text: `載入預置基準失敗: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  return (
    <div className="stack">
      <div>
        <h2 className="page-title">基準管理 · Baselines</h2>
        <p className="page-subtitle">檢視、匯入、匯出與管理本地行為指紋。</p>
      </div>

      <GroupedSection
        title="操作"
        footer="支援匯入基準陣列、單基準，或 hlwy-baseline-pack/v1 包。預置包來自本機 baselines/official/。"
      >
        <div className="btn-row">
          <Button variant="secondary" onClick={exportAll}>
            匯出全部
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            匯入基準
          </Button>
          <Button variant="secondary" onClick={loadOfficial}>
            載入預置基準包
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImportFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </GroupedSection>

      {message ? <StatusBanner type={message.type}>{message.text}</StatusBanner> : null}

      <GroupedSection title="已保存基準">
        {!baselines.length ? (
          <EmptyState
            icon="◇"
            title="尚無基準"
            text="先標定官方指紋，或匯入 / 載入預置基準包，之後才能做測試識別與渠道橫評。"
            actions={
              <>
                <EmptyStateActionButton primary onClick={() => fileRef.current?.click()}>
                  匯入基準
                </EmptyStateActionButton>
                <EmptyStateActionButton onClick={() => void loadOfficial()}>載入預置包</EmptyStateActionButton>
              </>
            }
          />
        ) : (
          <div className="baseline-list">
            {baselines.map((b, index) => (
              <div className="baseline-item" key={`${b.name}-${index}`}>
                <div className="baseline-item-top">
                  <div>
                    <div className="name">{b.name}</div>
                    <div className="stats">
                      模型: {b.model} · 樣本: {b.iterations} · 套件: {b.suiteName || b.suiteId || '經典(舊)'}
                      <br />
                      建立: {b.timestamp ? new Date(b.timestamp).toLocaleString('zh-Hant') : '—'} · 均值:{' '}
                      {b.stats.mean.toFixed(2)} · 標準差: {b.stats.stdDev.toFixed(2)} · 唯一值: {b.stats.unique}
                    </div>
                  </div>
                  <div className="btn-row" style={{ padding: 0 }}>
                    <Button size="sm" variant="ghost" onClick={() => setDetail(b)}>
                      檢視
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRenameIndex(index)
                        setRenameValue(b.name)
                      }}
                    >
                      重新命名
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => exportOne(index)}>
                      匯出
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(index)}>
                      刪除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GroupedSection>

      {detail ? (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{detail.name}</h3>
            <pre>{`模型: ${detail.model}
API: ${detail.apiType || '—'}
樣本: ${detail.iterations}
協議: ${detail.protocolVersion || 'legacy'}
套件: ${detail.suiteName || detail.suiteId || 'classic(legacy)'}
時間: ${detail.timestamp ? new Date(detail.timestamp).toLocaleString('zh-Hant') : '—'}

眾數: ${detail.stats.mode ?? '(無)'}
均值: ${detail.stats.mean.toFixed(2)}
中位數: ${detail.stats.median}
標準差: ${detail.stats.stdDev.toFixed(2)}
範圍: ${detail.stats.min}-${detail.stats.max}
唯一值: ${detail.stats.unique}`}</pre>
            <div className="btn-row">
              <Button variant="secondary" onClick={() => setDetail(null)}>
                關閉
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {renameIndex != null ? (
        <div className="modal-backdrop" onClick={() => setRenameIndex(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>重新命名基準</h3>
            <div className="field">
              <label htmlFor="baseline-rename-input">基準名稱</label>
              <input
                id="baseline-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="btn-row">
              <Button onClick={commitRename}>儲存</Button>
              <Button variant="secondary" onClick={() => setRenameIndex(null)}>
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
