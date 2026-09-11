/**
 * FILE: server/routes/interview.js
 * PURPOSE: Interview question generation and cross-questioning endpoints.
 * DEPENDENCIES: services/sarvam, services/interviewEngine, config
 * USED BY: server/index.js
 */

import { Router } from 'express'
import { GEMINI_API_KEY, DEFAULT_SARVAM_KEY, SARVAM_MODEL } from '../config.js'
import { callGeminiTextWithRetry } from '../services/gemini.js'
import { callSarvamWithRetry } from '../services/sarvam.js'
import { buildMirrorFallbackCrossQuestion } from '../services/interviewEngine.js'
import { normalizeSarvamError } from '../utils/errors.js'
import { tryParseJsonLoose } from '../utils/helpers.js'

const router = Router()

router.post('/interview/brief', async (req, res) => {
  const roleTitle = String(req.body?.roleTitle || '').trim()
  const seniority = String(req.body?.seniority || '').trim()
  const requiredGaps = Array.isArray(req.body?.requiredGaps) ? req.body.requiredGaps : []
  const niceGaps = Array.isArray(req.body?.niceGaps) ? req.body.niceGaps : []
  const matchedSkills = Array.isArray(req.body?.matchedSkills) ? req.body.matchedSkills : []
  const geminiKey = String(req.body?.key || GEMINI_API_KEY).trim()

  if (!roleTitle) {
    return res.status(400).json({ error: 'roleTitle is required for interview brief.' })
  }

  const prompt = [
    `You are Nexus-Strategist preparing a candidate for a ${seniority} ${roleTitle} interview.`,
    `The candidate's matched skills are: ${matchedSkills.join(', ') || 'various technical skills'}.`,
    `Their required skill gaps (topics they will be grilled on): ${requiredGaps.join(', ') || 'none identified'}.`,
    `Nice-to-have gaps: ${niceGaps.join(', ') || 'none'}.`,
    `Generate a focused pre-interview briefing with EXACTLY this JSON shape:`,
    `{`,
    `  "focus_areas": [{ "category": "technical"|"behavioral"|"system-design", "topic": string, "why": string, "tip": string }],`,
    `  "gap_topics": [{ "skill": string, "likely_question_angle": string, "prep_suggestion": string }],`,
    `  "key_strength_to_lead_with": string,`,
    `  "overall_readiness_note": string`,
    `}`,
    `Rules:`,
    `- focus_areas: exactly 4 entries, mix of technical, behavioral, system-design categories`,
    `- gap_topics: one entry per required gap skill (max 5)`,
    `- Be specific to the actual role title and seniority level — no generic boilerplate`,
    `- For gap_topics, give a concrete prep suggestion (e.g., "Build a toy X in 2 hours to get hands-on experience")`,
  ].join('\n\n')

  try {
    const raw = await callGeminiTextWithRetry({
      apiKey: geminiKey,
      prompt,
      systemInstruction: 'You are Nexus-Strategist. Return strict JSON only, no markdown.',
      attempts: 3,
    })

    let parsed = tryParseJsonLoose(raw)
    if (!parsed || typeof parsed !== 'object') {
      const objMatch = String(raw || '').match(/\{[\s\S]*\}/)
      parsed = objMatch ? JSON.parse(objMatch[0]) : null
    }

    if (!parsed) {
      throw new Error('Gemini returned invalid brief payload')
    }

    res.json({
      focus_areas: Array.isArray(parsed.focus_areas) ? parsed.focus_areas.slice(0, 4) : [],
      gap_topics: Array.isArray(parsed.gap_topics) ? parsed.gap_topics.slice(0, 5) : [],
      key_strength_to_lead_with: String(parsed.key_strength_to_lead_with || ''),
      overall_readiness_note: String(parsed.overall_readiness_note || ''),
    })
  } catch (err) {
    // Minimal graceful fallback
    res.json({
      focus_areas: [
        { category: 'technical', topic: 'Core domain skills', why: 'Foundational for this role', tip: 'Review your most recent project in this domain' },
        { category: 'behavioral', topic: 'Ownership and delivery', why: 'Expected at this seniority level', tip: 'Prepare a STAR story about a high-stakes delivery' },
        { category: 'system-design', topic: 'Scalability trade-offs', why: 'Common at senior+ levels', tip: 'Practice a back-of-envelope scaling exercise' },
        { category: 'technical', topic: 'Gap skill preparation', why: 'You have identified gaps in required skills', tip: `Focus on: ${requiredGaps.slice(0, 2).join(', ') || 'your gap areas'}` },
      ],
      gap_topics: requiredGaps.slice(0, 5).map(skill => ({
        skill,
        likely_question_angle: `Explain how you would use ${skill} in a production environment`,
        prep_suggestion: `Spend 1-2 hours building a minimal project using ${skill} to get hands-on experience`,
      })),
      key_strength_to_lead_with: matchedSkills[0] ? `Your demonstrated expertise in ${matchedSkills[0]}` : 'Your production delivery track record',
      overall_readiness_note: `Review the ${requiredGaps.length} required skill gaps before the interview.`,
      fallback: true,
      warning: err instanceof Error ? err.message : 'Brief generation fallback activated',
    })
  }
})


router.post('/interview/generate', async (req, res) => {
  const resume = String(req.body?.resume || '').trim()
  const jd = String(req.body?.jd || '').trim()
  const key = String(req.body?.key || DEFAULT_SARVAM_KEY).trim()

  if (!resume || !jd) {
    res.status(400).json({ error: 'Resume and JD are required for interview generation.' })
    return
  }

  const prompt = [
    'Generate 8 interview question-answer pairs tailored to the candidate resume and job description.',
    'Output strict JSON array with objects:',
    '{ "question": string, "answer": string, "category": "technical"|"behavioral"|"system-design" }',
    `JOB DESCRIPTION:\n${jd}`,
    `RESUME:\n${resume}`,
  ].join('\n\n')

  try {
    const sarvamRes = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: SARVAM_MODEL,
        messages: [
          { role: 'system', content: 'You are Nexus-Mirror. Return strict JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    })

    const sarvamJson = await sarvamRes.json()
    if (!sarvamRes.ok) {
      throw new Error(sarvamJson?.error?.message || sarvamJson?.message || 'Sarvam request failed')
    }

    const content = String(sarvamJson?.choices?.[0]?.message?.content || '').trim()
    let parsed = []
    try {
      parsed = JSON.parse(content)
    } catch {
      const match = content.match(/\[[\s\S]*\]/)
      parsed = match ? JSON.parse(match[0]) : []
    }

    const items = (Array.isArray(parsed) ? parsed : [])
      .slice(0, 8)
      .map((item, idx) => ({
        id: `nmx_${Date.now()}_${idx}`,
        question: String(item?.question || '').trim(),
        answer: String(item?.answer || '').trim(),
        category: ['technical', 'behavioral', 'system-design'].includes(String(item?.category || '').toLowerCase())
          ? String(item.category).toLowerCase()
          : (idx % 3 === 0 ? 'technical' : idx % 3 === 1 ? 'behavioral' : 'system-design'),
      }))
      .filter((x) => x.question && x.answer)

    if (items.length === 0) {
      throw new Error('Sarvam returned empty interview set')
    }

    res.json({ items })
  } catch (err) {
    const fallback = [
      {
        id: `nmx_${Date.now()}_1`,
        category: 'technical',
        question: 'How would you design a resilient API layer for this target role?',
        answer: 'I would define SLOs first, then build observability, retries, idempotency, and circuit breakers; finally validate through load and failure testing with measurable latency/error improvements.',
      },
      {
        id: `nmx_${Date.now()}_2`,
        category: 'behavioral',
        question: 'Describe a time you handled conflicting stakeholder priorities.',
        answer: 'I aligned stakeholders around shared success metrics, decomposed delivery into milestones, and communicated tradeoffs early, resulting in predictable execution and reduced escalation.',
      },
      {
        id: `nmx_${Date.now()}_3`,
        category: 'system-design',
        question: 'How would you scale a real-time job matching system?',
        answer: 'I would separate ingestion, ranking, and serving paths; use event-driven processing, cache hot recommendations, and instrument end-to-end KPIs to optimize throughput and relevance.',
      },
    ]

    res.json({
      items: fallback,
      fallback: true,
      warning: err instanceof Error ? err.message : 'Sarvam unavailable. Fallback interview set generated.',
    })
  }
})

router.post('/interview/cross-question', async (req, res) => {
  const question = String(req.body?.question || '').trim()
  const userAnswer = String(req.body?.answer || '').trim()
  const category = String(req.body?.category || 'technical').trim().toLowerCase()
  const key = String(req.body?.key || DEFAULT_SARVAM_KEY).trim()

  if (!question || !userAnswer) {
    res.status(400).json({ error: 'Question and answer are required.' })
    return
  }

  const prompt = [
    'You are Nexus-Mirror operating in Recursive Cross-Questioning mode.',
    'Phase A (Scan): analyze the user answer and identify either ONE concrete technical claim or a Logic Gap.',
    'Phase B (Grill): as a skeptical lead engineer, produce ONE challenging follow-up question strictly grounded in the Phase A finding.',
    'Return strict JSON with this shape only:',
    '{',
    '  "phaseA": {',
    '    "detectedType": "technical-claim"|"logic-gap",',
    '    "technicalClaim": string,',
    '    "logicGap": string,',
    '    "thinOrNonTechnical": boolean,',
    '    "reason": string',
    '  },',
    '  "phaseB": { "followUpQuestion": string },',
    '  "pressureDelta": number',
    '}',
    'Rules:',
    '- If answer is vague, generic, or non-technical, set thinOrNonTechnical=true and pressureDelta between 15 and 25.',
    '- If answer is strong technical, set pressureDelta between 5 and 12.',
    '- Ask only one follow-up question.',
    `CATEGORY: ${category}`,
    `QUESTION: ${question}`,
    `ANSWER: ${userAnswer}`,
  ].join('\n\n')

  try {
    const sarvamRaw = await callSarvamWithRetry({
      apiKey: key,
      messages: [
        { role: 'system', content: 'You are Nexus-Mirror. Return strict JSON only.' },
        { role: 'user', content: prompt },
      ],
      attempts: 3,
    })

    const parsed = tryParseJsonLoose(sarvamRaw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON payload from Sarvam cross-questioning')
    }

    const phaseA = parsed.phaseA && typeof parsed.phaseA === 'object' ? parsed.phaseA : {}
    const phaseB = parsed.phaseB && typeof parsed.phaseB === 'object' ? parsed.phaseB : {}
    const delta = Number(parsed.pressureDelta)

    const payload = {
      phaseA: {
        detectedType: String(phaseA.detectedType || '').toLowerCase() === 'technical-claim' ? 'technical-claim' : 'logic-gap',
        technicalClaim: String(phaseA.technicalClaim || '').trim(),
        logicGap: String(phaseA.logicGap || '').trim(),
        thinOrNonTechnical: Boolean(phaseA.thinOrNonTechnical),
        reason: String(phaseA.reason || '').trim(),
      },
      phaseB: {
        followUpQuestion: String(phaseB.followUpQuestion || '').trim(),
      },
      pressureDelta: Number.isFinite(delta) ? Math.max(0, Math.min(30, Math.round(delta))) : 10,
      mode: 'sarvam',
    }

    if (!payload.phaseB.followUpQuestion) {
      throw new Error('Missing follow-up question in cross-questioning response')
    }

    res.json(payload)
  } catch (err) {
    const fallback = buildMirrorFallbackCrossQuestion({ question, userAnswer, category })
    res.json({
      ...fallback,
      fallback: true,
      warning: normalizeSarvamError(err),
    })
  }
})

export default router
