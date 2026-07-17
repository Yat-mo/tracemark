import { Field, SelectInput, TextInput } from './Field'
import type { ApiType, HeaderPreset } from '../types'

export interface ConnectionValue {
  apiType: ApiType
  baseUrl: string
  apiKey: string
  model: string
  headerPreset: HeaderPreset
}

export function ConnectionFields({
  value,
  onChange,
  modelPlaceholder = 'gpt-4o',
}: {
  value: ConnectionValue
  onChange: (next: ConnectionValue) => void
  modelPlaceholder?: string
}) {
  const set = <K extends keyof ConnectionValue>(key: K, v: ConnectionValue[K]) => {
    const next = { ...value, [key]: v }
    if (key === 'apiType') {
      next.baseUrl =
        v === 'anthropic' ? 'https://api.anthropic.com' : value.baseUrl || 'https://api.openai.com/v1'
      if (!value.baseUrl || value.baseUrl.includes('openai.com') || value.baseUrl.includes('anthropic.com')) {
        next.baseUrl = v === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'
      }
    }
    onChange(next)
  }

  return (
    <>
      <Field label="API 類型">
        <SelectInput value={value.apiType} onChange={(e) => set('apiType', e.target.value as ApiType)}>
          <option value="openai">OpenAI 相容格式</option>
          <option value="openai-responses">OpenAI Responses API</option>
          <option value="anthropic">Anthropic Claude API</option>
        </SelectInput>
      </Field>
      <div className="row">
        <Field label="Base URL">
          <TextInput
            value={value.baseUrl}
            onChange={(e) => set('baseUrl', e.target.value)}
            placeholder={value.apiType === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'}
          />
        </Field>
        <Field label="API Key">
          <TextInput
            type="password"
            value={value.apiKey}
            onChange={(e) => set('apiKey', e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="row">
        <Field label="模型名稱">
          <TextInput
            value={value.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder={modelPlaceholder}
          />
        </Field>
        <Field label="請求頭偽裝">
          <SelectInput
            value={value.headerPreset}
            onChange={(e) => set('headerPreset', e.target.value as HeaderPreset)}
          >
            <option value="default">預設</option>
            <option value="claude-code">Claude Code</option>
            <option value="codex">Codex CLI</option>
          </SelectInput>
        </Field>
      </div>
    </>
  )
}
