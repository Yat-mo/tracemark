import type { ApiType, HeaderPreset, Probe, ProbeSample } from '../types'
import { extractNumber } from './parse'

const activeAbortControllers = new Set<AbortController>()

export function abortAllInFlight() {
  for (const c of activeAbortControllers) {
    try {
      c.abort()
    } catch {
      /* ignore */
    }
  }
  activeAbortControllers.clear()
}

export async function proxyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  activeAbortControllers.add(controller)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    activeAbortControllers.delete(controller)
  }
}

async function callOpenAI(baseUrl: string, apiKey: string, model: string, headerPreset: HeaderPreset, probe: Probe) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Target-Base-URL': baseUrl,
    'X-Header-Preset': headerPreset || 'default',
  }
  const response = await proxyFetch('/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: probe.prompt }],
      temperature: probe.temperature,
      max_tokens: probe.max_tokens,
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API错误: ${response.status} - ${errorText}`)
  }
  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (text == null) throw new Error('OpenAI 返回缺少 choices[0].message.content')
  return String(text).trim()
}

async function callAnthropic(baseUrl: string, apiKey: string, model: string, headerPreset: HeaderPreset, probe: Probe) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'X-Target-Base-URL': baseUrl,
    'X-Header-Preset': headerPreset || 'default',
  }
  const response = await proxyFetch('/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: probe.max_tokens,
      messages: [{ role: 'user', content: probe.prompt }],
      temperature: probe.temperature,
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API错误: ${response.status} - ${errorText}`)
  }
  const data = await response.json()
  const text = data?.content?.[0]?.text
  if (text == null) throw new Error('Anthropic 返回缺少 content[0].text')
  return String(text).trim()
}

async function callOpenAIResponses(baseUrl: string, apiKey: string, model: string, headerPreset: HeaderPreset, probe: Probe) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Target-Base-URL': baseUrl,
    'X-Header-Preset': headerPreset || 'default',
  }
  const response = await proxyFetch('/responses', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: [{ role: 'user', content: probe.prompt }],
      temperature: probe.temperature,
      max_output_tokens: probe.max_tokens,
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API错误: ${response.status} - ${errorText}`)
  }
  const data = await response.json()
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }
  const outputMsg = Array.isArray(data.output) ? data.output.find((o: { type?: string }) => o.type === 'message') : null
  if (outputMsg && outputMsg.content && outputMsg.content.length > 0) {
    const textBlock = outputMsg.content.find((c: { type?: string }) => c.type === 'output_text' || c.type === 'text')
    if (textBlock && (textBlock.text || textBlock.content)) {
      return String(textBlock.text || textBlock.content).trim()
    }
  }
  throw new Error('Responses API 返回数据中未找到文本内容')
}

export async function callModelText(
  apiType: ApiType,
  baseUrl: string,
  apiKey: string,
  model: string,
  headerPreset: HeaderPreset,
  probe: Probe,
): Promise<string> {
  if (apiType === 'openai') return callOpenAI(baseUrl, apiKey, model, headerPreset, probe)
  if (apiType === 'openai-responses') return callOpenAIResponses(baseUrl, apiKey, model, headerPreset, probe)
  return callAnthropic(baseUrl, apiKey, model, headerPreset, probe)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getProbeSample(
  apiType: ApiType,
  baseUrl: string,
  apiKey: string,
  model: string,
  headerPreset: HeaderPreset,
  probe: Probe,
  opts: { maxAttempts?: number } = {},
): Promise<ProbeSample> {
  const maxAttempts = opts.maxAttempts || 3
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const responseText = await callModelText(apiType, baseUrl, apiKey, model, headerPreset, probe)
      const num = extractNumber(responseText, probe.min, probe.max)
      if (num === null) {
        return {
          ok: false,
          kind: 'parse',
          text: responseText,
          error: new Error(
            `返回内容无法严格解析为 ${probe.min}-${probe.max} 的纯数字: ${JSON.stringify(responseText).slice(0, 120)}`,
          ),
        }
      }
      return { ok: true, kind: 'ok', value: num, text: responseText }
    } catch (error) {
      lastErr = error instanceof Error ? error : new Error(String(error))
      const msg = lastErr.message
      const retriable = /API错误:\s*(429|5\d\d)/.test(msg) || /timeout|Timeout|AbortError|网络/.test(msg)
      if (!retriable || attempt === maxAttempts) {
        return { ok: false, kind: 'transport', error: lastErr }
      }
      await sleep(300 * attempt * attempt)
    }
  }
  return { ok: false, kind: 'transport', error: lastErr || new Error('unknown') }
}
