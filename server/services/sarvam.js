/**
 * FILE: server/services/sarvam.js
 * PURPOSE: Sarvam API client with retry logic and Gemini failover.
 * DEPENDENCIES: server/services/gemini.js
 * USED BY: routes/resume.js, routes/interview.js
 */

import { callGeminiTextWithRetry } from './gemini.js'
import { SARVAM_MODEL } from '../config.js'

/** Returns true for network-level errors that are always safe to retry. */
function isRetriableNetworkError(err) {
  if (!(err instanceof Error)) return false
  const msg = err.message || ''
  // WSAECONNABORTED / stream reading error / connection reset / ECONNRESET / ETIMEDOUT
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
  const base = 800 * Math.pow(2, attempt) // 800 ms, 1600 ms, 3200 ms …
  const jitter = base * 0.2 * (Math.random() - 0.5)
  return Math.round(base + jitter)
}

/** Read the response body safely — a dropped TCP stream throws here instead of crashing. */
async function safeReadJson(response) {
  let raw
  try {
    raw = await response.text()
  } catch (streamErr) {
    // Promote stream-abort to a retriable error
    const err = new Error(`stream reading error: ${streamErr?.message || streamErr}`)
    err.retriable = true
    throw err
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Malformed JSON from Sarvam (${raw.slice(0, 120)})`)
  }
}

export function callSarvamWithRetry({ apiKey, messages, attempts = 4 }) {
  const run = async () => {
    let response
    try {
      response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: SARVAM_MODEL,
          messages,
          temperature: 0.3,
        }),
      })
    } catch (fetchErr) {
      // fetch() itself threw (before we even got headers) — always retriable
      const err = new Error(`Sarvam fetch failed: ${fetchErr?.message || fetchErr}`)
      err.retriable = true
      throw err
    }

    const json = await safeReadJson(response)
    if (!response.ok) {
      throw new Error(json?.error?.message || json?.message || `Sarvam request failed (${response.status})`)
    }
    return String(json?.choices?.[0]?.message?.content || '').trim()
  }

  return (async () => {
    let lastError = null
    for (let i = 0; i < attempts; i++) {
      try {
        return await run()
      } catch (err) {
        lastError = err
        const shouldRetry = err?.retriable || isRetriableNetworkError(err)
        console.warn(`[sarvam] attempt ${i + 1}/${attempts} failed${shouldRetry ? ' (retriable)' : ''}:`, err.message)
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs(i)))
        }
      }
    }
    throw lastError || new Error('Sarvam failed after retries')
  })()
}

export async function callSarvamOrGemini({ sarvamKey, geminiKey, messages, systemInstruction = 'You are a helpful assistant.' }) {
  try {
    const text = await callSarvamWithRetry({
      apiKey: sarvamKey,
      messages,
      attempts: 4,
    })
    return { text, provider: SARVAM_MODEL }
  } catch (sarvamErr) {
    console.warn('[sarvam→gemini] Sarvam exhausted, falling over to Gemini:', sarvamErr.message)
    const prompt = messages
      .map((m) => `${String(m?.role || 'user').toUpperCase()}: ${String(m?.content || '')}`)
      .join('\n\n')

    const text = await callGeminiTextWithRetry({
      apiKey: geminiKey,
      prompt,
      systemInstruction,
      attempts: 3,
    })

    return { text, provider: 'gemini-failover' }
  }
}
