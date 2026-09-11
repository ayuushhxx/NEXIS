/**
 * FILE: server/routes/jobs.js
 * PURPOSE: Nexus-Hunter job discovery endpoint.
 * DEPENDENCIES: services/gemini, services/serper, services/fallbacks, config
 * USED BY: server/index.js
 */

import { Router } from 'express'
import { GEMINI_API_KEY, SERPER_API_KEY } from '../config.js'
import { callGeminiTextWithRetry } from '../services/gemini.js'
import { serperSearchJobs } from '../services/serper.js'
import { fallbackPrimeTargets } from '../services/fallbacks.js'
import { tryParseJsonLoose, inferJobMetaFromLink } from '../utils/helpers.js'

const router = Router()

router.post('/jobs/discover', async (req, res) => {
  const resume = String(req.body?.resume || '').trim()
  const targetRole = String(req.body?.targetRole || 'AI Engineer').trim()
  const geminiKey = String(req.body?.key || GEMINI_API_KEY).trim()
  const serperKey = String(req.body?.serperKey || SERPER_API_KEY || '').trim()
  const mode = req.body?.mode === 'reachable' ? 'reachable' : 'current'
  const skillProfile = req.body?.skillProfile || null

  if (!resume) {
    res.status(400).json({ error: 'Resume content is required for Nexus-Hunter discovery.' })
    return
  }

  let queryTerms = targetRole
  let extraPromptContext = ''

  if (skillProfile) {
    if (mode === 'reachable') {
      const candidateNames = new Set((skillProfile.candidate_skills || []).map((s) => s.skill.toLowerCase()))
      const gaps = (skillProfile.jd_required_skills || []).filter((s) => !candidateNames.has(s.toLowerCase()))
      if (gaps.length > 0) {
        queryTerms += ` ${gaps.slice(0, 2).join(' ')}`
      }
      extraPromptContext = `MODE: REACHABLE AFTER UPSKILLING\nThe candidate is currently upskilling and closing their skill gaps: ${gaps.join(', ')}. Evaluate alignment ASSUMING the candidate has already acquired these skills.`
    } else {
      const topSkills = (skillProfile.candidate_skills || []).filter((s) => s.demonstrated).map((s) => s.skill)
      if (topSkills.length > 0) {
        queryTerms += ` ${topSkills.slice(0, 2).join(' ')}`
      }
      extraPromptContext = `MODE: CURRENT FIT\nEvaluate alignment based strictly on the candidate's existing demonstrated skills.`
    }
  }

  const huntQueries = [
    `site:workatastartup.com ${queryTerms} remote`,
    `site:boards.greenhouse.io ${queryTerms}`,
    `site:jobs.lever.co ${queryTerms}`,
  ]

  try {
    const batches = await Promise.all(huntQueries.map((q) => serperSearchJobs({ query: q, apiKey: serperKey }).catch(() => [])))
    const rawResults = batches.flat().slice(0, 18)

    const prompt = [
      'You are Nexus-Hunter autonomous discovery engine (CrewAI style).',
      'Task: choose top 3 Prime Targets from discovered jobs using deep reasoning.',
      'Apply alignment filtering against the resume, including hidden fits from niche projects.',
      'Compute Blue Ocean preference: direct career pages should score higher than crowded LinkedIn easy-apply posts.',
      extraPromptContext,
      'Return strict JSON array with exactly 3 objects and fields:',
      '{',
      '  "job_title": string,',
      '  "company_name": string,',
      '  "application_link": string,',
      '  "nexus_match_reason": string,',
      '  "alignment_score": number(0-100),',
      '  "blue_ocean_score": number(0-100)',
      '}',
      `TARGET ROLE: ${targetRole}`,
      `RESUME:\n${resume}`,
      `DISCOVERED JOB CANDIDATES:\n${JSON.stringify(rawResults, null, 2)}`,
    ].filter(Boolean).join('\n\n')

    const llmRaw = await callGeminiTextWithRetry({
      apiKey: geminiKey,
      prompt,
      systemInstruction: 'You are Nexus-Hunter. Return strict JSON only.',
      attempts: 3,
    })

    let parsed = tryParseJsonLoose(llmRaw)
    if (!Array.isArray(parsed)) {
      const arrMatch = String(llmRaw || '').match(/\[[\s\S]*\]/)
      parsed = arrMatch ? JSON.parse(arrMatch[0]) : null
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Gemini returned invalid prime target payload')
    }

    const items = parsed
      .slice(0, 3)
      .map((it, idx) => {
        const link = String(it?.application_link || rawResults[idx]?.link || '').trim()
        const meta = inferJobMetaFromLink(link)
        const alignment = Math.max(0, Math.min(100, Math.round(Number(it?.alignment_score || 80))))
        const blueOceanBase = Math.max(0, Math.min(100, Math.round(Number(it?.blue_ocean_score || 75))))
        const blueOcean = Math.max(0, Math.min(100, blueOceanBase + meta.blueOceanBoost))
        return {
          job_title: String(it?.job_title || rawResults[idx]?.title || 'Role').trim(),
          company_name: String(it?.company_name || rawResults[idx]?.source || 'Company').trim(),
          application_link: link,
          nexus_match_reason: String(it?.nexus_match_reason || 'Strong match based on your production AI delivery profile.').trim(),
          alignment_score: alignment,
          blue_ocean_score: blueOcean,
          source: meta.source,
          competition_level: meta.competitionLevel,
        }
      })
      .filter((x) => x.job_title && x.company_name && x.application_link)

    if (!items.length) {
      throw new Error('No valid prime targets after normalization')
    }

    res.json({ items: items.slice(0, 3), mode: 'gemini-serper' })
  } catch (err) {
    res.json({
      items: fallbackPrimeTargets(),
      fallback: true,
      warning: err instanceof Error ? err.message : 'Nexus-Hunter discovery fallback activated.',
      mode: 'fallback',
    })
  }
})

export default router
