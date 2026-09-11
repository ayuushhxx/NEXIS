/**
 * FILE: server/routes/programs.js
 * PURPOSE: Recommends real courses/programs for skill gaps.
 * DEPENDENCIES: services/gemini, services/serper, config
 * USED BY: server/index.js
 */

import { Router } from 'express'
import { GEMINI_API_KEY, SERPER_API_KEY } from '../config.js'
import { callGeminiTextWithRetry } from '../services/gemini.js'
import { serperSearchJobs } from '../services/serper.js'
import { tryParseJsonLoose } from '../utils/helpers.js'

const router = Router()

router.post('/programs/recommend', async (req, res) => {
  const gaps = req.body?.gaps
  const geminiKey = String(req.body?.key || GEMINI_API_KEY).trim()
  const serperKey = String(req.body?.serperKey || SERPER_API_KEY || '').trim()

  if (!Array.isArray(gaps) || gaps.length === 0) {
    return res.status(400).json({ error: 'Gaps array is required.' })
  }

  const targetGaps = gaps.slice(0, 5).map(g => String(g).trim()).filter(Boolean)

  if (!targetGaps.length) {
    return res.status(400).json({ error: 'No valid gaps provided.' })
  }

  const resultsBySkill = {}

  try {
    await Promise.all(targetGaps.map(async (skill) => {
      try {
        const query = `learn "${skill}" course (site:coursera.org OR site:udemy.com OR site:edx.org OR site:freecodecamp.org)`
        const rawResults = await serperSearchJobs({ query, apiKey: serperKey }).catch(() => [])

        if (!rawResults || rawResults.length === 0 || !geminiKey) {
          resultsBySkill[skill] = [
            {
              title: `${skill} Professional Certification & Mastery`,
              provider: 'Coursera',
              isFree: false,
              url: `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`,
            },
            {
              title: `${skill} Interactive Full Curriculum`,
              provider: 'freeCodeCamp',
              isFree: true,
              url: `https://www.freecodecamp.org/news/search/?query=${encodeURIComponent(skill)}`,
            },
            {
              title: `Complete ${skill} Bootcamp & Projects`,
              provider: 'Udemy',
              isFree: false,
              url: `https://www.udemy.com/courses/search/?q=${encodeURIComponent(skill)}`,
            },
          ]
          return
        }

        const prompt = [
          `You are an expert career counselor. I have performed a web search for courses to learn the skill: "${skill}".`,
          `Review the raw search results and extract the 3 best distinct courses/programs.`,
          `Only extract real courses mentioned in the results. DO NOT hallucinate or fabricate links.`,
          `Return a strict JSON array of objects with the following fields:`,
          `{`,
          `  "title": string (Course title),`,
          `  "provider": string (e.g. "Coursera", "Udemy", "freeCodeCamp"),`,
          `  "isFree": boolean,`,
          `  "url": string (The exact link from the search results)`,
          `}`,
          `RAW SEARCH RESULTS:\n${JSON.stringify(rawResults.slice(0, 10), null, 2)}`
        ].join('\n\n')

        const llmRaw = await callGeminiTextWithRetry({
          apiKey: geminiKey,
          prompt,
          systemInstruction: 'You are a precise JSON extractor. Return valid JSON array only. Never hallucinate.',
          attempts: 2,
        })

        let parsed = tryParseJsonLoose(llmRaw)
        if (!Array.isArray(parsed)) {
          const arrMatch = String(llmRaw || '').match(/\[[\s\S]*\]/)
          parsed = arrMatch ? JSON.parse(arrMatch[0]) : []
        }

        resultsBySkill[skill] = Array.isArray(parsed) && parsed.length > 0 ? parsed.slice(0, 3) : [
          {
            title: `${skill} Fundamentals & Applied Projects`,
            provider: 'Coursera',
            isFree: false,
            url: `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`,
          },
          {
            title: `${skill} Open Curriculum`,
            provider: 'freeCodeCamp',
            isFree: true,
            url: `https://www.freecodecamp.org/news/search/?query=${encodeURIComponent(skill)}`,
          },
        ]
      } catch (err) {
        console.error(`Error processing skill ${skill}:`, err)
        resultsBySkill[skill] = [
          {
            title: `${skill} Core Track`,
            provider: 'Coursera',
            isFree: false,
            url: `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`,
          }
        ]
      }
    }))

    res.json({ programs: resultsBySkill })
  } catch (err) {
    console.error('Programs recommend error:', err)
    res.status(500).json({ error: 'Failed to fetch recommended programs.' })
  }
})

export default router
