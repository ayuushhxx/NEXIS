/**
 * FILE: server/services/resumeBuilder.js
 * PURPOSE: Resume normalization, structured resume building, analysis generation, and fallback strategies.
 * DEPENDENCIES: server/services/resumeParser.js, server/services/sarvam.js, server/utils/helpers.js
 * USED BY: routes/resume.js
 */

import { extractFromResumeText } from './resumeParser.js'
import { callSarvamOrGemini } from './sarvam.js'
import { tokenize, tryParseJsonLoose } from '../utils/helpers.js'

export function buildFallbackStrategist(resume, jd) {
  const jdTokens = tokenize(jd)
  const resumeTokens = new Set(tokenize(resume))
  const freq = new Map()
  jdTokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1))

  const prioritized = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => !['with', 'from', 'that', 'this', 'your', 'have', 'need'].includes(k))

  const priorities = prioritized.slice(0, 5).map((p) => p.toUpperCase())
  const gaps = priorities.filter((p) => !resumeTokens.has(p.toLowerCase())).slice(0, 4)
  const strengths = priorities.filter((p) => resumeTokens.has(p.toLowerCase())).slice(0, 4)

  return {
    priorities: priorities.length ? priorities : ['ROLE ALIGNMENT', 'IMPACT-DRIVEN BULLETS'],
    gaps: gaps.length ? gaps : ['QUANTIFIED IMPACT', 'DOMAIN-SPECIFIC KEYWORDS'],
    strengths: strengths.length ? strengths : ['ENGINEERING DELIVERY', 'SYSTEM OWNERSHIP'],
  }
}

export function buildFallbackTailoredResume(resume, jd, strategist) {
  const jdLine = jd.split('\n').map((x) => x.trim()).filter(Boolean)[0] || 'target role requirements'
  const highlight = strategist.priorities.slice(0, 3).join(', ')
  const base = resume.trim()

  const additions = [
    'PROFESSIONAL SUMMARY',
    `Results-oriented candidate aligned to ${jdLine}.`,
    `Core focus areas: ${highlight}.`,
    '',
    'TARGETED IMPACT BULLETS',
    '- Delivered production-grade features with measurable impact on reliability, speed, and user outcomes.',
    '- Collaborated across stakeholders to convert requirements into scalable, maintainable implementations.',
    '- Improved execution quality through structured testing, monitoring, and iterative optimization.',
  ].join('\n')

  return `${base}\n\n${additions}`.trim()
}

export function buildAnalysis(strategist) {
  const atsCompatibility = Math.min(95, Math.max(58, 70 + strategist.priorities.length * 4 - strategist.gaps.length * 3))
  const activityFeed = [
    {
      id: `a_${Date.now()}_1`,
      timestamp: Date.now(),
      agent: 'Nexus-Writer',
      action: 'Resume Tailoring Complete',
      details: 'Generated role-specific bullet upgrades using JD priorities.',
      status: 'completed',
    },
    {
      id: `a_${Date.now()}_2`,
      timestamp: Date.now() - 60000,
      agent: 'Nexus-Strategist',
      action: 'JD Intent Mining',
      details: `${strategist.priorities.length} priorities and ${strategist.gaps.length} gaps identified.`,
      status: strategist.gaps.length > 0 ? 'warning' : 'success',
    },
  ]

  const pipeline = [
    {
      id: 'discovery',
      title: 'Job Discovery',
      cards: [{ id: 'd1', title: 'Target Role Selected', status: 'JD Parsed' }],
    },
    {
      id: 'tailoring',
      title: 'Resume Tailoring',
      cards: [{ id: 't1', title: 'Tailored Resume Draft', status: 'Nexus-Writer Complete', progress: 100 }],
    },
    {
      id: 'proof-check',
      title: 'Proof-of-Work Verification',
      cards: strategist.gaps.map((g, i) => ({ id: `p${i}`, title: g, status: 'Needs proof' })),
    },
    {
      id: 'ready',
      title: 'Ready to Submit',
      cards: [{ id: 'r1', title: 'Tailored Package', status: 'Ready' }],
    },
    {
      id: 'submitted',
      title: 'Submitted & Tracking',
      cards: [],
    },
  ]

  return {
    atsCompatibility,
    skillGaps: [
      ...strategist.strengths.slice(0, 2).map((s) => ({ skill: s, status: 'verified' })),
      ...strategist.gaps.slice(0, 3).map((g) => ({ skill: g, status: 'gap' })),
    ],
    interviewReadiness: {
      technicalDeepDive: Math.min(96, atsCompatibility + 5),
      behavioralQuestions: Math.max(55, 78 - strategist.gaps.length * 4),
      systemDesign: Math.min(94, atsCompatibility + 2),
    },
    activityFeed,
    pipeline,
  }
}

export function normalizeAnalysisShape(rawAnalysis, fallbackAnalysis) {
  const atsCompatibility = Number(rawAnalysis?.atsCompatibility)
  const toPercent = (v, fallback) => {
    const n = Number(v)
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)))
    return fallback
  }

  const normalizeStatus = (s) => {
    const v = String(s || '').toLowerCase()
    if (v === 'verified' || v === 'needs-proof' || v === 'gap') return v
    return 'gap'
  }

  const skillGaps = Array.isArray(rawAnalysis?.skillGaps)
    ? rawAnalysis.skillGaps
      .slice(0, 8)
      .map((x) => ({
        skill: String(x?.skill || '').trim(),
        status: normalizeStatus(x?.status),
      }))
      .filter((x) => x.skill)
    : fallbackAnalysis.skillGaps

  const interview = rawAnalysis?.interviewReadiness || {}

  return {
    atsCompatibility: Number.isFinite(atsCompatibility)
      ? Math.max(0, Math.min(100, Math.round(atsCompatibility)))
      : fallbackAnalysis.atsCompatibility,
    skillGaps: skillGaps.length ? skillGaps : fallbackAnalysis.skillGaps,
    interviewReadiness: {
      technicalDeepDive: toPercent(interview.technicalDeepDive, fallbackAnalysis.interviewReadiness.technicalDeepDive),
      behavioralQuestions: toPercent(interview.behavioralQuestions, fallbackAnalysis.interviewReadiness.behavioralQuestions),
      systemDesign: toPercent(interview.systemDesign, fallbackAnalysis.interviewReadiness.systemDesign),
    },
    activityFeed: fallbackAnalysis.activityFeed,
    pipeline: fallbackAnalysis.pipeline,
  }
}

export function normalizeStructuredResume(raw, fallbackText, jd) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const extracted = extractFromResumeText(fallbackText)

  const safeArray = (value) => (Array.isArray(value) ? value : [])
  const safeString = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

  // Detect if AI dumped everything into summary with no other sections
  const aiSummary = safeString(data?.summary, '')
  const aiExpLen = safeArray(data?.experience).filter((e) => e && (e.title || (Array.isArray(e.bullets) && e.bullets.length))).length
  const aiSkillsLen = safeArray(data?.skills?.core).length + safeArray(data?.skills?.tools).length + safeArray(data?.skills?.cloud).length
  const aiProjLen = safeArray(data?.projects).filter((p) => p && (p.name || (Array.isArray(p.bullets) && p.bullets.length))).length
  const everythingInSummary = aiSummary.length > 300 && aiExpLen === 0 && aiSkillsLen === 0 && aiProjLen === 0
  const useExtracted = !raw || everythingInSummary

  const header = {
    name: safeString(data?.header?.name, extracted.name || safeString(data?.header?.name, '')),
    title: safeString(data?.header?.title, extracted.title || ''),
    email: safeString(data?.header?.email, extracted.email || ''),
    phone: safeString(data?.header?.phone, extracted.phone || ''),
    location: safeString(data?.header?.location, extracted.location || ''),
    links: safeArray(data?.header?.links).map((x) => String(x).trim()).filter(Boolean).slice(0, 4),
  }
  if (!header.links.length && extracted.links.length) header.links = extracted.links

  const summary = useExtracted
    ? (extracted.summary || '')
    : safeString(data?.summary, extracted.summary || '')

  const aiSkillsCore = safeArray(data?.skills?.core).map((x) => String(x).trim()).filter(Boolean)
  const aiSkillsTools = safeArray(data?.skills?.tools).map((x) => String(x).trim()).filter(Boolean)
  const aiSkillsCloud = safeArray(data?.skills?.cloud).map((x) => String(x).trim()).filter(Boolean)
  const skills = {
    core: (aiSkillsCore.length && !useExtracted ? aiSkillsCore : extracted.skills.core).slice(0, 12),
    tools: (aiSkillsTools.length && !useExtracted ? aiSkillsTools : extracted.skills.tools).slice(0, 12),
    cloud: (aiSkillsCloud.length && !useExtracted ? aiSkillsCloud : extracted.skills.cloud).slice(0, 12),
  }

  let experience = safeArray(data?.experience)
    .slice(0, 6)
    .map((exp) => ({
      title: safeString(exp?.title, ''),
      company: safeString(exp?.company, ''),
      location: safeString(exp?.location, ''),
      start: safeString(exp?.start, ''),
      end: safeString(exp?.end, ''),
      bullets: safeArray(exp?.bullets).map((b) => String(b).trim()).filter(Boolean).slice(0, 5),
    }))
    .filter((exp) => exp.title || exp.bullets.length)
  if ((!experience.length || useExtracted) && extracted.experience.length) {
    experience = extracted.experience.slice(0, 6)
  }

  let projects = safeArray(data?.projects)
    .slice(0, 6)
    .map((p) => ({
      name: safeString(p?.name, ''),
      bullets: safeArray(p?.bullets).map((b) => String(b).trim()).filter(Boolean).slice(0, 5),
    }))
    .filter((p) => p.name || p.bullets.length)
  if ((!projects.length || useExtracted) && extracted.projects.length) {
    projects = extracted.projects.slice(0, 6)
  }

  let education = safeArray(data?.education)
    .slice(0, 3)
    .map((e) => ({
      degree: safeString(e?.degree, ''),
      school: safeString(e?.school, ''),
      year: safeString(e?.year, ''),
    }))
    .filter((e) => e.degree || e.school)
  if ((!education.length || useExtracted) && extracted.education.length) {
    education = extracted.education.slice(0, 3)
  }

  let certifications = safeArray(data?.certifications).map((c) => String(c).trim()).filter(Boolean).slice(0, 6)
  if (!certifications.length && extracted.certifications && extracted.certifications.length) {
    certifications = extracted.certifications.slice(0, 6)
  }

  return {
    header,
    summary,
    skills,
    experience,
    projects,
    education,
    certifications,
    targetJobSummary: safeString(data?.targetJobSummary, String(jd || '').split('\n').slice(0, 2).join(' ')),
  }
}

export function structuredToResumeText(sr) {
  const sections = []
  const h = sr.header || {}
  sections.push(`${h.name || 'Candidate Name'}`)
  sections.push(`${h.title || 'Target Role Candidate'}`)
  sections.push(`${h.email || ''} | ${h.phone || ''} | ${h.location || ''}`.replace(/^\s*\|\s*|\s*\|\s*$/g, ''))
  if (Array.isArray(h.links) && h.links.length) sections.push(h.links.join(' | '))
  sections.push('')

  sections.push('PROFESSIONAL SUMMARY')
  sections.push(sr.summary || '')
  sections.push('')

  sections.push('SKILLS')
  const skillLines = []
  if (sr.skills?.core?.length) skillLines.push(`Core: ${sr.skills.core.join(', ')}`)
  if (sr.skills?.tools?.length) skillLines.push(`Tools: ${sr.skills.tools.join(', ')}`)
  if (sr.skills?.cloud?.length) skillLines.push(`Cloud: ${sr.skills.cloud.join(', ')}`)
  sections.push(...skillLines)
  sections.push('')

  if (Array.isArray(sr.experience) && sr.experience.length) {
    sections.push('EXPERIENCE')
    sr.experience.forEach((exp) => {
      sections.push(`${exp.title} | ${exp.company} | ${exp.location}`)
      sections.push(`${exp.start} - ${exp.end}`)
      ;(exp.bullets || []).forEach((b) => sections.push(`- ${b}`))
      sections.push('')
    })
  }

  if (Array.isArray(sr.projects) && sr.projects.length) {
    sections.push('PROJECTS')
    sr.projects.forEach((p) => {
      sections.push(`${p.name}`)
      ;(p.bullets || []).forEach((b) => sections.push(`- ${b}`))
      sections.push('')
    })
  }

  if (Array.isArray(sr.education) && sr.education.length) {
    sections.push('EDUCATION')
    sr.education.forEach((e) => {
      sections.push(`${e.degree} | ${e.school} | ${e.year}`)
    })
    sections.push('')
  }

  if (Array.isArray(sr.certifications) && sr.certifications.length) {
    sections.push('CERTIFICATIONS')
    sr.certifications.forEach((c) => sections.push(`- ${c}`))
  }

  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function ensureStructuredResume({ resumeText, jd, sarvamKey, geminiKey, structurerKey }) {
  const structurerPrompt = [
    'Convert this tailored resume into strict structured JSON.',
    'Return ONLY JSON with this exact schema:',
    '{',
    '  "header": { "name": string, "title": string, "email": string, "phone": string, "location": string, "links": string[] },',
    '  "summary": string,',
    '  "skills": { "core": string[], "tools": string[], "cloud": string[] },',
    '  "experience": [{ "title": string, "company": string, "location": string, "start": string, "end": string, "bullets": string[] }],',
    '  "projects": [{ "name": string, "bullets": string[] }],',
    '  "education": [{ "degree": string, "school": string, "year": string }],',
    '  "certifications": string[],',
    '  "targetJobSummary": string',
    '}',
    `JOB DESCRIPTION:\n${jd}`,
    `TAILORED RESUME:\n${resumeText}`,
  ].join('\n\n')

  try {
    const structurerResult = await callSarvamOrGemini({
      sarvamKey,
      geminiKey,
      messages: [
        { role: 'system', content: 'You are a strict JSON formatter. Return valid JSON only.' },
        { role: 'user', content: structurerPrompt },
      ],
      systemInstruction: 'You are a strict JSON formatter. Return valid JSON only.',
    })
    const parsed = tryParseJsonLoose(structurerResult.text)
    return normalizeStructuredResume(parsed, resumeText, jd)
  } catch {
    void structurerKey
    return normalizeStructuredResume(null, resumeText, jd)
  }
}

/**
 * Validates and cleans the `skillProfile` block returned by the LLM.
 * Computes match_pct server-side: matched_required / total_required * 100.
 */
export function normalizeSkillProfile(raw) {
  if (!raw || typeof raw !== 'object') return null

  const safeStrArr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
  const safeStr = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback)
  const safeNum = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback }

  const jd_required_skills = safeStrArr(raw.jd_required_skills)
  const jd_nice_to_have_skills = safeStrArr(raw.jd_nice_to_have_skills)

  const candidate_skills = Array.isArray(raw.candidate_skills)
    ? raw.candidate_skills
        .map((x) => ({
          skill: safeStr(x?.skill),
          demonstrated: Boolean(x?.demonstrated),
        }))
        .filter((x) => x.skill)
    : []

  const candidateSkillNames = new Set(candidate_skills.map((x) => x.skill.toLowerCase()))

  // Compute match_pct: required skills that appear in candidate_skills (case-insensitive)
  const matchedRequired = jd_required_skills.filter((s) =>
    candidateSkillNames.has(s.toLowerCase())
  )
  const match_pct =
    jd_required_skills.length > 0
      ? Math.round((matchedRequired.length / jd_required_skills.length) * 100)
      : null

  const expSummary = raw.candidate_experience_summary || {}

  return {
    jd_role_title: safeStr(raw.jd_role_title, 'Target Role'),
    jd_seniority: safeStr(raw.jd_seniority, 'Mid'),
    jd_required_skills,
    jd_nice_to_have_skills,
    candidate_skills,
    candidate_experience_summary: {
      level: safeStr(expSummary.level, 'Mid-level'),
      years: safeNum(expSummary.years, 0),
      domains: safeStrArr(expSummary.domains),
    },
    match_pct,
    matched_required: matchedRequired,
  }
}

/**
 * Keyword-extraction fallback when the LLM call fails entirely.
 * Uses simple tokenization to infer likely required skills from the JD.
 */
export function buildFallbackSkillProfile(resume, jd) {
  const STOP = new Set(['with', 'from', 'that', 'this', 'your', 'have', 'need', 'will', 'must', 'able',
    'using', 'work', 'team', 'strong', 'good', 'knowledge', 'experience', 'skills', 'role', 'looking'])

  const jdWords = tokenize(jd).filter((w) => w.length > 3 && !STOP.has(w))
  const resumeTokens = new Set(tokenize(resume))

  // Most-frequent JD tokens as inferred required skills
  const freq = new Map()
  jdWords.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1))
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const jd_required_skills = sorted.slice(0, 10)
  const jd_nice_to_have_skills = sorted.slice(10, 16)

  const candidate_skills = jd_required_skills.map((skill) => ({
    skill,
    demonstrated: resumeTokens.has(skill),
  }))

  const matchedRequired = jd_required_skills.filter((s) => resumeTokens.has(s))
  const match_pct = jd_required_skills.length > 0
    ? Math.round((matchedRequired.length / jd_required_skills.length) * 100)
    : null

  return {
    jd_role_title: 'Target Role',
    jd_seniority: 'Mid',
    jd_required_skills,
    jd_nice_to_have_skills,
    candidate_skills,
    candidate_experience_summary: { level: 'Mid-level', years: 0, domains: [] },
    match_pct,
    matched_required: matchedRequired,
  }
}

