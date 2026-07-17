import type { ClassifiedError } from '../types'

export function classifyError(error: unknown): ClassifiedError {
  const msg = error instanceof Error ? error.message : String(error)

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::')) {
    return {
      type: 'network',
      badge: '網路',
      friendly: '無法連接到 API 伺服器',
      suggestion: '請檢查 Base URL 是否正確、網路是否通暢。若是跨域問題 (CORS)，需透過本機代理存取。',
    }
  }

  // Match both simplified (错误) from legacy API helpers and traditional (錯誤).
  const statusMatch =
    msg.match(/API(?:错误|錯誤)[:：]\s*(\d{3})/) ||
    msg.match(/API error:\s*(\d{3})/i)
  if (statusMatch) {
    const code = parseInt(statusMatch[1], 10)
    if (code === 401) {
      return {
        type: 'auth',
        badge: '認證',
        friendly: 'API Key 無效或已過期 (401)',
        suggestion: '請檢查 API Key 是否正確、是否已過期或被撤銷。',
      }
    }
    if (code === 403) {
      return {
        type: 'auth',
        badge: '權限',
        friendly: '沒有權限存取該模型 (403)',
        suggestion: '您的 API Key 可能沒有該模型的存取權限，或該模型尚未對您開放。',
      }
    }
    if (code === 404) {
      return {
        type: 'other',
        badge: '404',
        friendly: 'API 端點或模型不存在 (404)',
        suggestion: '請檢查 Base URL 與模型名稱是否正確。常見問題：URL 末尾多了 "/" 或缺少路徑前綴。',
      }
    }
    if (code === 429) {
      return {
        type: 'ratelimit',
        badge: '限頻',
        friendly: '請求過於頻繁，觸發速率限制 (429)',
        suggestion: '請稍後重試，或降低測試次數／併發數。',
      }
    }
    if (code === 400) {
      if (msg.includes('model')) {
        return {
          type: 'other',
          badge: '參數',
          friendly: '請求參數錯誤 — 模型名稱可能不正確 (400)',
          suggestion: '請確認模型名稱拼寫正確（區分大小寫），例如 "gpt-4o" 而非 "GPT4o"。',
        }
      }
      return {
        type: 'other',
        badge: '參數',
        friendly: '請求參數錯誤 (400)',
        suggestion: '請檢查 API 類型是否與 Base URL 匹配（OpenAI 格式 vs Anthropic 格式）。',
      }
    }
    if (code >= 500) {
      return {
        type: 'server',
        badge: '服務端',
        friendly: `API 返回錯誤 (${code})`,
        suggestion: '請檢查 API Key、Base URL、模型名稱。若配置無誤，可能是服務端暫時不可用。',
      }
    }
    return {
      type: 'other',
      badge: code.toString(),
      friendly: `API 返回錯誤 (${code})`,
      suggestion: '請查看錯誤詳情取得更多資訊。',
    }
  }

  if (msg.includes('JSON') || msg.includes('Unexpected token')) {
    return {
      type: 'parse',
      badge: '解析',
      friendly: '返回資料格式異常',
      suggestion: 'API 返回的不是預期的 JSON。Base URL 可能指向了錯誤地址。',
    }
  }

  if (/timeout|Timeout|AbortError/i.test(msg)) {
    return {
      type: 'network',
      badge: '逾時',
      friendly: '請求逾時或已中止',
      suggestion: '可降低併發、檢查網路，或確認目標 API 是否回應過慢。',
    }
  }

  if (msg.includes('严格解析') || msg.includes('嚴格解析') || msg.includes('无法严格解析') || msg.includes('無法嚴格解析')) {
    return {
      type: 'parse',
      badge: '解析',
      friendly: '回傳內容無法嚴格解析為純數字',
      suggestion: '模型可能輸出了解釋文字。可檢查模型行為或改用其他探針套件後重試。',
    }
  }

  return {
    type: 'other',
    badge: '其他',
    friendly: msg.slice(0, 160) || '未知錯誤',
    suggestion: '請檢查配置與錯誤詳情。',
  }
}
