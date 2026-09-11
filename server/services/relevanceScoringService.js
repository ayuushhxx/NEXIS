/**
 * FILE: server/services/relevanceScoringService.js
 * PURPOSE: Course and provider relevance scoring engine combining three independent signals:
 *   1) Employer-reported denial reasons (from EmployerVerification DENIED rows)
 *   2) Trainee-reported non-placement reasons (from OutcomeCheckIn SEARCHING rows)
 *   3) Aggregated skill gaps from individual Resume Forge sessions (from SkillGapSnapshot rows)
 *
 * ATTRIBUTION CONVENTION:
 * Every event is attributed to a (courseName, providerName) pair via the trainee's most
 * recent Enrolment as of the record's timestamp (verifiedAt/respondedAt/createdAt).
 * ASSUMPTION / FALLBACK: If ambiguous or no enrolment strictly precedes the record's
 * timestamp, the trainee's most recent Enrolment by enrolmentDate is used, matching the
 * exact attribution pattern established in server/routes/employer.js (lines 203-249).
 *
 * CONFIDENCE PRINCIPLE:
 * Employer-reported and trainee-reported reasons carry different confidence levels
 * (verified employer attestation vs. self-reported perception). They are stored and
 * reported as separate breakdown dictionaries and are never merged into a single count,
 * except for the dominant-reason penalty evaluation.
 *
 * DEPENDENCIES: server/lib/prisma.js
 * USED BY: server/routes/analytics.js
 */

import prisma from '../lib/prisma.js'

/**
 * Resolves the attributed Enrolment for a given trainee and timestamp.
 *
 * @param {Array<object>} traineeEnrolments - All Enrolments belonging to the trainee
 * @param {Date|string|number} [recordTimestamp] - Timestamp of the event being attributed
 * @returns {object|null} The attributed Enrolment record, or null if no enrolments exist
 */
export function attributeToEnrolment(traineeEnrolments, recordTimestamp) {
  if (!Array.isArray(traineeEnrolments) || traineeEnrolments.length === 0) {
    return null
  }

  // Ensure enrolments are sorted descending by enrolmentDate
  const sorted = [...traineeEnrolments].sort(
    (a, b) => new Date(b.enrolmentDate).getTime() - new Date(a.enrolmentDate).getTime()
  )

  if (recordTimestamp) {
    const targetMs = new Date(recordTimestamp).getTime()
    if (!Number.isNaN(targetMs)) {
      const prior = sorted.find((e) => new Date(e.enrolmentDate).getTime() <= targetMs)
      if (prior) return prior
    }
  }

  // Fallback assumption: if ambiguous or none strictly prior, use most recent by enrolmentDate
  return sorted[0]
}

/**
 * Computes and persists course relevance scores for all known courses and providers.
 * Upserts CourseRelevanceScore rows idempotently.
 *
 * @returns {Promise<{ coursesProcessed: number, timestamp: Date, scores: Array<object> }>}
 */
export async function computeRelevanceScores() {
  // 1. Fetch all Enrolments to discover course/provider pairs and build trainee lookup
  const allEnrolments = await prisma.enrolment.findMany({
    orderBy: { enrolmentDate: 'desc' },
  })

  const enrolmentsByTrainee = new Map()
  const groups = new Map() // key: `${courseName}:::${providerName}`

  function getOrCreateGroup(courseName, providerName) {
    const normCourse = String(courseName || '').trim()
    const normProvider = String(providerName || '').trim()
    const key = `${normCourse}:::${normProvider}`

    if (!groups.has(key)) {
      groups.set(key, {
        courseName: normCourse,
        providerName: normProvider,
        totalClaims: 0,
        confirmedCount: 0,
        deniedCount: 0,
        employerReasonBreakdown: {}, // reasonCode -> count
        traineeReasonBreakdown: {},  // nonPlacementReason -> count
        skillCounts: {},             // skill -> count
      })
    }
    return groups.get(key)
  }

  for (const e of allEnrolments) {
    if (!enrolmentsByTrainee.has(e.traineeId)) {
      enrolmentsByTrainee.set(e.traineeId, [])
    }
    enrolmentsByTrainee.get(e.traineeId).push(e)

    if (e.courseName && e.providerName) {
      getOrCreateGroup(e.courseName, e.providerName)
    }
  }

  // 2. Attribute EmployerVerification records (Signal 1: Employer determinations)
  const verifications = await prisma.employerVerification.findMany({
    where: {
      status: { in: ['CONFIRMED', 'DENIED'] },
    },
    include: {
      outcomeCheckIn: {
        select: { respondedAt: true, createdAt: true },
      },
    },
  })

  for (const v of verifications) {
    const traineeEnrolments = enrolmentsByTrainee.get(v.traineeId)
    const timestamp = v.verifiedAt || v.outcomeCheckIn?.respondedAt || v.createdAt
    const enrolment = attributeToEnrolment(traineeEnrolments, timestamp)
    if (!enrolment) continue

    const group = getOrCreateGroup(enrolment.courseName, enrolment.providerName)

    if (v.status === 'CONFIRMED') {
      group.confirmedCount++
      group.totalClaims++
    } else if (v.status === 'DENIED') {
      group.deniedCount++
      group.totalClaims++
      if (v.reasonCode) {
        const code = String(v.reasonCode).trim()
        group.employerReasonBreakdown[code] = (group.employerReasonBreakdown[code] || 0) + 1
      }
    }
  }

  // 3. Attribute OutcomeCheckIn records (Signal 2: Trainee-reported non-placement reasons)
  const checkIns = await prisma.outcomeCheckIn.findMany({
    where: {
      employmentStatus: 'SEARCHING',
      nonPlacementReason: { not: null },
    },
  })

  for (const c of checkIns) {
    const traineeEnrolments = enrolmentsByTrainee.get(c.traineeId)
    const timestamp = c.respondedAt || c.createdAt
    const enrolment = attributeToEnrolment(traineeEnrolments, timestamp)
    if (!enrolment) continue

    const group = getOrCreateGroup(enrolment.courseName, enrolment.providerName)
    if (c.nonPlacementReason) {
      const reason = String(c.nonPlacementReason).trim()
      group.traineeReasonBreakdown[reason] = (group.traineeReasonBreakdown[reason] || 0) + 1
    }
  }

  // 4. Attribute SkillGapSnapshot records (Signal 3: Persisted Resume Forge skill gaps)
  const snapshots = await prisma.skillGapSnapshot.findMany()

  for (const snap of snapshots) {
    const traineeEnrolments = enrolmentsByTrainee.get(snap.traineeId)
    const timestamp = snap.createdAt
    const enrolment = attributeToEnrolment(traineeEnrolments, timestamp)
    if (!enrolment) continue

    const group = getOrCreateGroup(enrolment.courseName, enrolment.providerName)

    let parsedSkills = []
    try {
      parsedSkills = JSON.parse(snap.missingSkills || '[]')
    } catch {
      parsedSkills = []
    }

    if (Array.isArray(parsedSkills)) {
      for (const skill of parsedSkills) {
        const trimmed = String(skill || '').trim()
        if (trimmed) {
          group.skillCounts[trimmed] = (group.skillCounts[trimmed] || 0) + 1
        }
      }
    }
  }

  // 5. Compute scores, top missing skills, and upsert each course/provider scorecard
  const upsertedScores = []

  for (const group of groups.values()) {
    // Top 10 missing skills by frequency
    const topMissingSkills = Object.entries(group.skillCounts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
      .slice(0, 10)

    // Dominant-reason check: combine employer and trainee breakdowns ONLY for this check
    const combinedReasons = {}
    for (const [r, cnt] of Object.entries(group.employerReasonBreakdown)) {
      combinedReasons[r] = (combinedReasons[r] || 0) + cnt
    }
    for (const [r, cnt] of Object.entries(group.traineeReasonBreakdown)) {
      combinedReasons[r] = (combinedReasons[r] || 0) + cnt
    }

    let maxReasonCount = 0
    for (const cnt of Object.values(combinedReasons)) {
      if (cnt > maxReasonCount) maxReasonCount = cnt
    }

    const topReasons = Object.entries(combinedReasons).filter(
      ([_, cnt]) => cnt === maxReasonCount && cnt > 0
    )
    const isSkillGapDominant = topReasons.length === 1 && topReasons[0][0] === 'SKILL_GAP'

    // Relevance score calculation:
    // confirmedCount / totalClaims when totalClaims > 0, else null (insufficient data, not zero)
    let relevanceScore = null
    if (group.totalClaims > 0) {
      let score = group.confirmedCount / group.totalClaims
      if (isSkillGapDominant) {
        score = Math.max(0, score - 0.1)
      }
      relevanceScore = Math.round(score * 10000) / 10000
    }

    const payload = {
      courseName: group.courseName,
      providerName: group.providerName,
      totalClaims: group.totalClaims,
      confirmedCount: group.confirmedCount,
      deniedCount: group.deniedCount,
      employerReasonBreakdown: JSON.stringify(group.employerReasonBreakdown),
      traineeReasonBreakdown: JSON.stringify(group.traineeReasonBreakdown),
      topMissingSkills: JSON.stringify(topMissingSkills),
      relevanceScore,
      computedAt: new Date(),
    }

    const saved = await prisma.courseRelevanceScore.upsert({
      where: {
        courseName_providerName: {
          courseName: group.courseName,
          providerName: group.providerName,
        },
      },
      update: payload,
      create: payload,
    })

    upsertedScores.push(saved)
  }

  return {
    coursesProcessed: upsertedScores.length,
    timestamp: new Date(),
    scores: upsertedScores,
  }
}
