/**
 * FILE: server/services/gemini.js
 * PURPOSE: Gemini API client with model failover and retry logic.
 * DEPENDENCIES: server/config.js
 * USED BY: routes/resume.js, routes/chat.js, routes/jobs.js
 */

import { GEMINI_MODELS } from '../config.js'

/** Returns true for network-level errors that are always safe to retry. */
function isRetriableNetworkError(err) {
  if (!(err instanceof Error)) return false
  const msg = err.message || ''
  return (
    msg.includes('wsarecv') ||
    msg.includes('stream reading error') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNABORTED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('socket hang up') ||
    msg.includes('network error') ||
    msg.includes('fetch failed')
  )
}

/** Exponential backoff with ±20 % jitter. */
function backoffMs(attempt) {
  const base = 800 * Math.pow(2, attempt)
  const jitter = base * 0.2 * (Math.random() - 0.5)
  return Math.round(base + jitter)
}

/** Read the response body safely — a dropped TCP stream throws here instead of crashing. */
async function safeReadJson(response) {
  let raw
  try {
    raw = await response.text()
  } catch (streamErr) {
    const err = new Error(`stream reading error: ${streamErr?.message || streamErr}`)
    err.retriable = true
    throw err
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Malformed JSON from Gemini (${raw.slice(0, 120)})`)
  }
}

export async function callGeminiText({ apiKey, prompt, systemInstruction, modelCandidates = GEMINI_MODELS }) {
  let lastError = null

  for (const model of modelCandidates) {
    try {
      let response
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
          }),
        })
      } catch (fetchErr) {
        const err = new Error(`[${model}] Gemini fetch failed: ${fetchErr?.message || fetchErr}`)
        err.retriable = true
        throw err
      }

      const json = await safeReadJson(response)
      if (!response.ok) {
        const msg = json?.error?.message || `Gemini request failed (${response.status})`
        lastError = new Error(`[${model}] ${msg}`)
        continue
      }

      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join(' ').trim() || ''
      if (text) return text

      lastError = new Error(`[${model}] Empty completion from Gemini.`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError || new Error('Gemini request failed for all configured models.')
}

export async function callGeminiTextWithRetry({ apiKey, prompt, systemInstruction, attempts = 3 }) {
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    try {
      return await callGeminiText({ apiKey, prompt, systemInstruction })
    } catch (err) {
      lastError = err
      const shouldRetry = err?.retriable || isRetriableNetworkError(err)
      console.warn(`[gemini] attempt ${i + 1}/${attempts} failed${shouldRetry ? ' (retriable)' : ''}:`, err.message)
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs(i)))
      }
    }
  }
  throw lastError || new Error('Gemini request failed after retries')
}
