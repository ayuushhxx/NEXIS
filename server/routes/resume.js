/**
 * FILE: server/routes/resume.js
 * PURPOSE: Resume extraction, tailoring, bullet generation, and PDF rendering endpoints.
 * DEPENDENCIES: services/gemini, services/sarvam, services/resumeBuilder, services/pdfGenerator, config
 * USED BY: server/index.js
 */

import { Router } from 'express'
import { PDFParse } from 'pdf-parse'
import prisma from '../lib/prisma.js'
import { upload } from '../middleware/upload.js'
import { GEMINI_API_KEY, DEFAULT_SARVAM_KEY, DEFAULT_RESUME_STRUCTURER_KEY } from '../config.js'
import { callGeminiTextWithRetry } from '../services/gemini.js'
import { callSarvamWithRetry } from '../services/sarvam.js'
import {
  buildFallbackStrategist,
  buildFallbackTailoredResume,
  buildAnalysis,
  normalizeAnalysisShape,
  normalizeStructuredResume,
  structuredToResumeText,
  ensureStructuredResume,
  normalizeSkillProfile,
  buildFallbackSkillProfile,
} from '../services/resumeBuilder.js'
import { buildResumePdfFromStructured } from '../services/pdfGenerator.js'
import { normalizeSarvamError, requireEnv } from '../utils/errors.js'
import { tryParseJsonLoose } from '../utils/helpers.js'

const router = Router()

router.post('/resume/extract', upload.single('resumePdf'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Missing resume PDF file' })
    return
  }

  try {
    const parser = new PDFParse({ data: req.file.buffer })
    const textResult = await parser.getText()
    await parser.destroy()
    const text = (textResult.text || '').trim()
    if (!text) {
      res.status(422).json({ error: 'Unable to extract text from PDF' })
      return
    }

    res.json({
      fileName: req.file.originalname,
      pages: textResult.pages?.length || 1,
      text,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to parse PDF' })
  }
})

router.post('/resume/bullet', async (req, res) => {
  const userGeminiKey = req.body?.keys?.gemini
  const runtimeGeminiKey = userGeminiKey || GEMINI_API_KEY
  if (!requireEnv('GEMINI_API_KEY', runtimeGeminiKey, res)) return
  const repoData = req.body?.repoData
  if (!repoData) {
    res.status(400).json({ error: 'Missing repoData payload' })
    return
  }

  const prompt = `Based on these code commits ${JSON.stringify(repoData, null, 2)}, write one high-impact, quantified resume bullet point using Action Verbs.`

  try {
    const bullet = await callGeminiTextWithRetry({
      apiKey: runtimeGeminiKey,
      prompt,
      systemInstruction: 'You are Nexus-Writer. Output exactly one resume bullet as plain text with measurable impact.',
    })
    res.json({ bullet: bullet || 'Improved system reliability and delivery velocity across key repositories with measurable impact.' })
  } catch (err) {
    const fallbackBullet = `Engineered ${repoData?.repository || 'core services'} with ${repoData?.commits || 0}+ commit contributions, improving delivery velocity and production stability across high-impact features.`
    res.json({
      bullet: fallbackBullet,
      fallback: true,
      warning: '',
    })
  }
})

async function persistSkillGapSnapshotIfTrainee({ traineeId, jd, skillProfile, analysis }) {
  if (!traineeId || typeof traineeId !== 'string' || !traineeId.trim()) {
    return
  }

  try {
    const cleanTraineeId = traineeId.trim()
    const trainee = await prisma.trainee.findUnique({
      where: { id: cleanTraineeId },
      select: { id: true },
    })

    if (!trainee) {
      console.warn(`[resume/tailor] Trainee with ID "${cleanTraineeId}" not found; skipping snapshot persistence.`)
      return
    }

    const jdTitle = (
      skillProfile?.jd_role_title ||
      jd.split('\n').map((x) => x.trim()).filter(Boolean)[0] ||
      'Target Role'
    ).slice(0, 255)

    let missingSkills = []
    if (skillProfile && Array.isArray(skillProfile.jd_required_skills)) {
      const candidateSkillNames = new Set(
        (skillProfile.candidate_skills || []).map((s) => String(s?.skill || '').trim().toLowerCase())
      )
      const reqGaps = (skillProfile.jd_required_skills || []).filter(
        (s) => !candidateSkillNames.has(String(s).trim().toLowerCase())
      )
      const niceGaps = (skillProfile.jd_nice_to_have_skills || []).filter(
        (s) => !candidateSkillNames.has(String(s).trim().toLowerCase())
      )
      missingSkills = [...reqGaps, ...niceGaps]
    }
    if (missingSkills.length === 0 && Array.isArray(analysis?.skillGaps)) {
      missingSkills = analysis.skillGaps
        .filter((g) => g.status === 'gap' || g.status === 'needs-proof')
        .map((g) => g.skill)
    }

    const seen = new Set()
    const uniqueMissingSkills = []
    for (const s of missingSkills) {
      const trimmed = String(s || '').trim()
      if (trimmed && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase())
        uniqueMissingSkills.push(trimmed)
      }
    }

    const atsScore = typeof analysis?.atsCompatibility === 'number' ? analysis.atsCompatibility : null

    await prisma.skillGapSnapshot.create({
      data: {
        traineeId: trainee.id,
        jdTitle,
        missingSkills: JSON.stringify(uniqueMissingSkills),
        atsScore,
      },
    })
  } catch (err) {
    console.warn('[resume/tailor] Failed to persist SkillGapSnapshot:', err)
  }
}

router.post('/resume/tailor', async (req, res) => {
  const resume = String(req.body?.resume || '').trim()
  const jd = String(req.body?.jd || '').trim()
  const traineeId = req.body?.traineeId
  const keys = req.body?.keys || {}
  const runtimeSarvamKey = String(keys.sarvam || DEFAULT_SARVAM_KEY || '').trim()
  const structurerKey = String(keys.structurer || DEFAULT_RESUME_STRUCTURER_KEY).trim()

  if (!resume || !jd) {
    res.status(400).json({ error: 'Resume and JD are required.' })
    return
  }
  if (!runtimeSarvamKey) {
    const strategist = buildFallbackStrategist(resume, jd)
    const tailoredResume = buildFallbackTailoredResume(resume, jd, strategist)
    const structuredResume = await ensureStructuredResume({
      resumeText: tailoredResume,
      jd,
      sarvamKey: '',
      geminiKey: '',
      structurerKey,
    })
    const structuredResumeText = structuredToResumeText(structuredResume)
    const analysis = buildAnalysis(strategist)
    const skillProfile = buildFallbackSkillProfile(resume, jd)

    await persistSkillGapSnapshotIfTrainee({ traineeId, jd, skillProfile, analysis })

    res.json({
      tailoredResume: structuredResumeText,
      structuredResume,
      analysis,
      skillProfile,
      fallback: true,
      warning: 'Sarvam API key not configured. Generated local resilient fallback package.',
      modelUsed: 'resilient-local-fallback',
    })
    return
  }
  void structurerKey

  try {
    const singlePassPrompt = [
      'You are Nexus-Director. Build one complete resume optimization package.',
      'CRITICAL CONSTRAINT: You must ONLY use information explicitly present in the candidate\'s original resume.',
      'NEVER invent, fabricate, or embellish skills, job titles, companies, achievements, dates, or metrics not found in the original resume text.',
      'Do NOT add skills from the JD that the candidate has not demonstrated. Do NOT upgrade experience levels, project scopes, or impact numbers beyond what the resume states.',
      'Use the Job Description and Resume to produce strict JSON only with this shape:',
      '{',
      '  "strategist": { "priorities": string[], "gaps": string[], "strengths": string[] },',
      '  "analysis": {',
      '    "atsCompatibility": number(0-100),',
      '    "skillGaps": [{"skill": string, "status": "verified"|"needs-proof"|"gap"}],',
      '    "interviewReadiness": { "technicalDeepDive": number, "behavioralQuestions": number, "systemDesign": number }',
      '  },',
      '  "skillProfile": {',
      '    "jd_role_title": string,',
      '    "jd_seniority": string (e.g. "Junior"|"Mid"|"Senior"|"Lead"|"Staff"|"Principal"),',
      '    "jd_required_skills": string[],',
      '    "jd_nice_to_have_skills": string[],',
      '    "candidate_skills": [{ "skill": string, "demonstrated": boolean }],',
      '    "candidate_experience_summary": { "level": string, "years": number, "domains": string[] }',
      '  },',
      '  "structuredResume": {',
      '    "header": { "name": string, "title": string, "email": string, "phone": string, "location": string, "links": string[] },',
      '    "summary": string (rewritten for the target role, but only using facts from the original resume),',
      '    "skills": { "core": string[], "tools": string[], "cloud": string[] } (only skills evidenced in the original resume),',
      '    "experience": [{ "title": string, "company": string, "location": string, "start": string, "end": string, "bullets": string[] }] (use original job titles, companies, dates; rewrite bullets for clarity and impact but do not fabricate metrics),',
      '    "projects": [{ "name": string, "bullets": string[] }] (only projects from the original resume),',
      '    "education": [{ "degree": string, "school": string, "year": string }],',
      '    "certifications": string[] (only from the original resume),',
      '    "targetJobSummary": string',
      '  }',
      '}',
      'For skillProfile.candidate_skills, mark demonstrated=true only when the resume contains concrete evidence (project, job bullet, or certification). Mark demonstrated=false for skills that appear only in a skills list without supporting evidence.',
      `JOB DESCRIPTION:\n${jd}`,
      `RESUME:\n${resume}`,
    ].join('\n\n')

    const rawPackage = await callSarvamWithRetry({
      apiKey: runtimeSarvamKey,
      messages: [
        { role: 'system', content: 'Return strict JSON only. No markdown.' },
        { role: 'user', content: singlePassPrompt },
      ],
      attempts: 4,
    })

    const parsedPackage = tryParseJsonLoose(rawPackage) || {}
    const strategist = parsedPackage?.strategist || {
      priorities: ['Role alignment', 'Impact-driven bullet optimization'],
      gaps: ['Domain-specific tooling evidence'],
      strengths: ['Engineering delivery and ownership'],
    }

    const fallbackAnalysis = buildAnalysis(strategist)
    const analysis = normalizeAnalysisShape(parsedPackage?.analysis || null, fallbackAnalysis)

    let structuredResume = normalizeStructuredResume(parsedPackage?.structuredResume || null, resume, jd)
    if (!structuredResume?.experience?.length) {
      structuredResume = await ensureStructuredResume({
        resumeText: resume,
        jd,
        sarvamKey: runtimeSarvamKey,
        geminiKey: '',
        structurerKey,
      })
    }

    const structuredResumeText = structuredToResumeText(structuredResume)

    const skillProfile = normalizeSkillProfile(parsedPackage?.skillProfile || null)

    await persistSkillGapSnapshotIfTrainee({ traineeId, jd, skillProfile, analysis })

    res.json({
      tailoredResume: structuredResumeText,
      structuredResume,
      analysis,
      skillProfile,
      modelUsed: 'sarvam-m-single-pass',
      structurer: structurerKey ? 'resume-maker-structured-pdf' : 'resume-maker-structured-pdf',
      warning: '',
    })
  } catch (err) {
    console.error('[resume/tailor] model error:', err)
    const strategist = buildFallbackStrategist(resume, jd)
    const tailoredResume = buildFallbackTailoredResume(resume, jd, strategist)
    const usedFallback = true

    const structuredResume = await ensureStructuredResume({
      resumeText: tailoredResume,
      jd,
      sarvamKey: runtimeSarvamKey,
      geminiKey: '',
      structurerKey,
    })
    const structuredResumeText = structuredToResumeText(structuredResume)
    const analysis = buildAnalysis(strategist)
    const skillProfile = buildFallbackSkillProfile(resume, jd)

    await persistSkillGapSnapshotIfTrainee({ traineeId, jd, skillProfile, analysis })

    res.json({
      tailoredResume: structuredResumeText,
      structuredResume,
      analysis,
      skillProfile,
      fallback: usedFallback,
      warning: normalizeSarvamError(err),
      modelUsed: 'resilient-local-fallback',
    })
  }
})

router.post('/resume/render-pdf', async (req, res) => {
  let structuredResume = req.body?.structuredResume
  const resumeText = String(req.body?.resume || '').trim()
  const jd = String(req.body?.jd || '').trim()
  const keys = req.body?.keys || {}
  const runtimeSarvamKey = String(keys.sarvam || DEFAULT_SARVAM_KEY).trim()
  const runtimeGeminiKey = String(keys.gemini || GEMINI_API_KEY).trim()
  const structurerKey = String(keys.structurer || DEFAULT_RESUME_STRUCTURER_KEY).trim()

  if ((!structuredResume || typeof structuredResume !== 'object') && resumeText) {
    structuredResume = await ensureStructuredResume({
      resumeText,
      jd,
      sarvamKey: runtimeSarvamKey,
      geminiKey: runtimeGeminiKey,
      structurerKey,
    })
  }

  if (!structuredResume || typeof structuredResume !== 'object') {
    res.status(400).json({ error: 'structuredResume JSON is required, or provide resume text for auto-structuring.' })
    return
  }

  try {
    const pdfBuffer = await buildResumePdfFromStructured(structuredResume)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="forgev3-structured-resume-${Date.now()}.pdf"`)
    res.send(pdfBuffer)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to render resume PDF' })
  }
})

export default router
