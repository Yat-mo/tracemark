/**
 * Strict parse: only accept pure integer response in [min, max].
 * Rejects free text that merely contains a number.
 * Parity with legacy hlwy-ai-checker.html extractNumber.
 */
export function extractNumber(text: unknown, min = 1, max = 355): number | null {
  if (text == null) return null
  const s = String(text).trim()
  // allow optional surrounding quotes/backticks and trailing punctuation
  const m = s.match(/^[`"'\u201c\u201d\u2018\u2019]?(\d{1,3})[`"'\u201c\u201d\u2018\u2019]?(?:[.。!！?？])?$/)
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (Number.isNaN(num) || num < min || num > max) return null
  return num
}
