/**
 * FILE: server/routes/analytics.js
 * PURPOSE: Government and provider analytics aggregation endpoints and course relevance scoring.
 *
 * RBAC Authorization:
 * - Admin analytics endpoints require requireAdmin('ANALYST') or higher.
 * - Mutating endpoints log actions to AdminActionLog for compliance auditing.
 * - Provider view (/api/provider-view/:token) is token-authenticated and public,
 *   strictly isolated to aggregate metrics for the given provider without leaking PII.
 *
 * Core Analytical Principles:
 * 1. Placement rate is ALWAYS paired with response rate (non-responders are not a random sample).
 * 2. District attribution distinguishes Trainee.district (home) from OutcomeCheckIn.placementDistrict (placement/migration).
 * 3. Consistent query filtering (?scheme=... and ?from=...&to=... / ?startDate=...&endDate=...).
 *
 * Endpoints:
 *   POST /api/admin/compute-relevance-scores                      — triggers relevance scoring calculation
 *   GET  /api/analytics/course-relevance                          — returns all scorecards (worst-first)
 *   GET  /api/analytics/course-relevance/:courseName/:providerName — drill-down for course & provider
 *   GET  /api/analytics/overview                                  — overall aggregate metrics
 *   GET  /api/analytics/by-district                               — home vs placement district breakdown
 *   GET  /api/analytics/by-cohort                                 — cohort breakdown
 *   GET  /api/analytics/by-provider                               — provider breakdown with relevance scores
 *   GET  /api/analytics/wage-progression                          — wage band movement over time
 *   POST /api/admin/generate-provider-token                       — generates tokenized shareable link
 *   GET  /api/provider-view/:token                                — token-authenticated read-only view
 *
 * DEPENDENCIES: server/lib/prisma.js, server/utils/adminAuth.js, server/services/relevanceScoringService.js
 * USED BY: server/index.js
 */

import crypto from 'crypto'
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAdmin, logAdminAction } from '../utils/adminAuth.js'
import { computeRelevanceScores } from '../services/relevanceScoringService.js'
import { computeImpact } from '../services/impactMeasurementService.js'
import { seedControlGroup } from '../scripts/seedControlGroup.js'

const router = Router()

/**
 * Standard wage band ordinal mappings for tracking progression over time.
 */
const WAGE_BAND_ORDINALS = {
  '0-10k': 0,
  '0-10000': 0,
  '10-20k': 1,
  '10000-20000': 1,
  '20-30k': 2,
  '20k+': 2,
  '20000+': 2,
  '30k+': 3,
  '30000+': 3,
}

function getWageOrdinal(wageBand) {
  if (!wageBand || typeof wageBand !== 'string') return null
  const key = wageBand.trim().toLowerCase()
  return WAGE_BAND_ORDINALS[key] !== undefined ? WAGE_BAND_ORDINALS[key] : null
}

/**
 * Parses query parameters into Prisma where filter on Enrolment.
 * Supports:
 *   - scheme: exact scheme string
 *   - from / startDate: enrolmentDate >= from
 *   - to / endDate: enrolmentDate <= to
 */
function buildEnrolmentFilter(query = {}) {
  const where = {}

  if (query.scheme && typeof query.scheme === 'string' && query.scheme.trim()) {
    where.scheme = query.scheme.trim()
  }

  const fromDate = query.from || query.startDate
  const toDate = query.to || query.endDate

  if (fromDate || toDate) {
    where.enrolmentDate = {}
    if (fromDate) {
      const d = new Date(fromDate)
      if (!isNaN(d.getTime())) where.enrolmentDate.gte = d
    }
    if (toDate) {
      const d = new Date(toDate)
      if (!isNaN(d.getTime())) where.enrolmentDate.lte = d
    }
  }

  return where
}

/**
 * Computes core trainee metrics for a collection of unique Trainees.
 *
 * Rules:
 * - Trainees due for check-in: enrolled >= 90 days ago (enrolmentDate <= now - 90d).
 * - Response rate = non-pending check-in / due check-in.
 * - Placement rate = (employed + self_employed) / reported status.
 * - Always pairs placementRate with responseRate.
 * - Trainees are evaluated once (latest check-in takes precedence).
 */
function computeTraineeMetrics(trainees = []) {
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  let dueCheckinCount = 0
  let respondedCount = 0
  let reportedCount = 0
  let placedCount = 0

  const statusBreakdown = {
    EMPLOYED: 0,
    SELF_EMPLOYED: 0,
    SEARCHING: 0,
    IN_TRAINING: 0,
    OTHER: 0,
  }

  for (const trainee of trainees) {
    const enrolments = trainee.enrolments || []
    const isDue = enrolments.some((e) => new Date(e.enrolmentDate) <= ninetyDaysAgo)
    if (isDue) {
      dueCheckinCount++
    }

    const checkIns = (trainee.outcomeCheckIns || []).slice().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // Non-pending check-in count for response rate
    const hasResponded = checkIns.some(
      (c) =>
        c.status === 'COMPLETED' ||
        c.respondedAt !== null ||
        (c.status !== 'PENDING' && c.employmentStatus !== null)
    )

    if (isDue && hasResponded) {
      respondedCount++
    }

    // Latest check-in with reported employment status
    const latestReported = checkIns.find(
      (c) => c.employmentStatus && statusBreakdown[c.employmentStatus] !== undefined
    )

    if (latestReported) {
      reportedCount++
      const status = latestReported.employmentStatus
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1

      if (status === 'EMPLOYED' || status === 'SELF_EMPLOYED') {
        placedCount++
      }
    }
  }

  // Response rate: null if no trainees due
  const responseRate =
    dueCheckinCount > 0 ? Math.round((respondedCount / dueCheckinCount) * 10000) / 10000 : null
  const responseRatePercentage =
    responseRate !== null ? Math.round(responseRate * 1000) / 10 : null

  // Placement rate: null if no trainees reported
  const placementRate =
    reportedCount > 0 ? Math.round((placedCount / reportedCount) * 10000) / 10000 : null
  const placementRatePercentage =
    placementRate !== null ? Math.round(placementRate * 1000) / 10 : null

  return {
    totalTrainees: trainees.length,
    dueCheckinTrainees: dueCheckinCount,
    respondedTrainees: respondedCount,
    responseRate,
    responseRatePercentage,
    reportedTrainees: reportedCount,
    placedTrainees: placedCount,
    placementRate,
    placementRatePercentage,
    employmentStatusBreakdown: statusBreakdown,
  }
}

/**
 * Parses JSON strings in CourseRelevanceScore record for structured API output.
 */
function formatScorecard(record) {
  if (!record) return null

  let employerReasonBreakdown = {}
  try {
    employerReasonBreakdown = JSON.parse(record.employerReasonBreakdown || '{}')
  } catch {
    employerReasonBreakdown = {}
  }

  let traineeReasonBreakdown = {}
  try {
    traineeReasonBreakdown = JSON.parse(record.traineeReasonBreakdown || '{}')
  } catch {
    traineeReasonBreakdown = {}
  }

  let topMissingSkills = []
  try {
    topMissingSkills = JSON.parse(record.topMissingSkills || '[]')
  } catch {
    topMissingSkills = []
  }

  return {
    id: record.id,
    courseName: record.courseName,
    providerName: record.providerName,
    totalClaims: record.totalClaims,
    confirmedCount: record.confirmedCount,
    deniedCount: record.deniedCount,
    relevanceScore: record.relevanceScore,
    employerReasonBreakdown,
    traineeReasonBreakdown,
    topMissingSkills,
    computedAt: record.computedAt,
  }
}

// ── POST /api/admin/compute-relevance-scores ─────────────────────────────────
// Triggers the course relevance scoring engine.
// Role required: ANALYST
router.post('/admin/compute-relevance-scores', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const summary = await computeRelevanceScores()

    await logAdminAction(
      req.adminUser.id,
      'COMPUTE_RELEVANCE_SCORES',
      'CourseRelevanceScore',
      'batch',
      {
        coursesProcessed: summary.coursesProcessed,
        triggeredBy: req.adminUser.githubUsername,
      }
    )

    res.json({
      message: 'Course relevance scores computed successfully',
      coursesProcessed: summary.coursesProcessed,
      timestamp: summary.timestamp,
      scores: summary.scores.map(formatScorecard),
    })
  } catch (err) {
    console.error('[admin/compute-relevance-scores POST] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to compute relevance scores',
    })
  }
})

// ── GET /api/analytics/course-relevance ──────────────────────────────────────
// Returns all CourseRelevanceScore rows sorted by relevanceScore ascending (worst-first),
// with null-score entries (insufficient claims) grouped separately at the end.
// Role required: ANALYST
router.get('/analytics/course-relevance', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const allScores = await prisma.courseRelevanceScore.findMany()

    const scored = []
    const unscored = []

    for (const item of allScores) {
      if (item.relevanceScore !== null && item.relevanceScore !== undefined) {
        scored.push(item)
      } else {
        unscored.push(item)
      }
    }

    // Sort ascending: worst score first (most actionable for intervention)
    scored.sort((a, b) => a.relevanceScore - b.relevanceScore)

    // Unscored / insufficient data sorted alphabetically by courseName
    unscored.sort((a, b) => a.courseName.localeCompare(b.courseName))

    const sortedScores = [...scored, ...unscored].map(formatScorecard)

    res.json({
      totalCourses: sortedScores.length,
      scoredCount: scored.length,
      unscoredCount: unscored.length,
      scores: sortedScores,
    })
  } catch (err) {
    console.error('[analytics/course-relevance GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to fetch course relevance scores',
    })
  }
})

// ── GET /api/analytics/course-relevance/:courseName/:providerName ────────────
// Returns full scorecard for a specific course and provider for drill-down analysis.
// Role required: ANALYST
router.get(
  '/analytics/course-relevance/:courseName/:providerName',
  requireAdmin('ANALYST'),
  async (req, res) => {
    const { courseName, providerName } = req.params

    if (!courseName || !providerName) {
      res.status(400).json({ error: 'courseName and providerName parameters are required.' })
      return
    }

    const decodedCourse = decodeURIComponent(courseName).trim()
    const decodedProvider = decodeURIComponent(providerName).trim()

    try {
      const scorecard = await prisma.courseRelevanceScore.findUnique({
        where: {
          courseName_providerName: {
            courseName: decodedCourse,
            providerName: decodedProvider,
          },
        },
      })

      if (!scorecard) {
        res.status(404).json({
          error: `No relevance scorecard found for course "${decodedCourse}" by provider "${decodedProvider}".`,
        })
        return
      }

      res.json({ scorecard: formatScorecard(scorecard) })
    } catch (err) {
      console.error('[analytics/course-relevance/:courseName/:providerName GET] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch course relevance scorecard',
      })
    }
  }
)

// ── GET /api/analytics/overview ─────────────────────────────────────────────
// Overall analytics overview: total enrolments, unique trainees, response rate,
// placement rate, and employment status breakdown.
// Role required: ANALYST
router.get('/analytics/overview', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const whereEnrolment = buildEnrolmentFilter(req.query)

    const trainees = await prisma.trainee.findMany({
      where:
        Object.keys(whereEnrolment).length > 0
          ? { enrolments: { some: whereEnrolment } }
          : undefined,
      include: {
        enrolments: true,
        outcomeCheckIns: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    const totalEnrolmentsCount = await prisma.enrolment.count({
      where: whereEnrolment,
    })

    const metrics = computeTraineeMetrics(trainees)

    res.json({
      filterApplied: {
        scheme: req.query.scheme || null,
        from: req.query.from || req.query.startDate || null,
        to: req.query.to || req.query.endDate || null,
      },
      totalEnrolments: totalEnrolmentsCount,
      ...metrics,
    })
  } catch (err) {
    console.error('[analytics/overview GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to compute analytics overview',
    })
  }
})

// ── GET /api/analytics/by-district ──────────────────────────────────────────
// Returns two distinct breakdowns:
//   1) homeDistrictBreakdown: grouped by Trainee.district
//   2) placementDistrictBreakdown: grouped by OutcomeCheckIn.placementDistrict
// Every placement rate includes response rate alongside it.
// Role required: ANALYST
router.get('/analytics/by-district', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const whereEnrolment = buildEnrolmentFilter(req.query)

    const trainees = await prisma.trainee.findMany({
      where:
        Object.keys(whereEnrolment).length > 0
          ? { enrolments: { some: whereEnrolment } }
          : undefined,
      include: {
        enrolments: true,
        outcomeCheckIns: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // 1. homeDistrictBreakdown: Grouped by Trainee.district
    const homeMap = new Map()
    for (const trainee of trainees) {
      const district = trainee.district?.trim() || 'Unknown'
      if (!homeMap.has(district)) homeMap.set(district, [])
      homeMap.get(district).push(trainee)
    }

    const homeDistrictBreakdown = Array.from(homeMap.entries()).map(
      ([district, districtTrainees]) => {
        const metrics = computeTraineeMetrics(districtTrainees)
        return {
          district,
          ...metrics,
        }
      }
    )
    homeDistrictBreakdown.sort(
      (a, b) => b.totalTrainees - a.totalTrainees || a.district.localeCompare(b.district)
    )

    // 2. placementDistrictBreakdown: Grouped by OutcomeCheckIn.placementDistrict
    const placementMap = new Map()
    for (const trainee of trainees) {
      const checkIns = trainee.outcomeCheckIns || []
      const latestCheckin = checkIns[0]
      if (latestCheckin?.placementDistrict && latestCheckin.placementDistrict.trim()) {
        const pDistrict = latestCheckin.placementDistrict.trim()
        if (!placementMap.has(pDistrict)) placementMap.set(pDistrict, [])
        placementMap.get(pDistrict).push({
          trainee,
          homeDistrict: trainee.district?.trim() || 'Unknown',
        })
      }
    }

    const placementDistrictBreakdown = Array.from(placementMap.entries()).map(
      ([pDistrict, records]) => {
        const districtTrainees = records.map((r) => r.trainee)
        const metrics = computeTraineeMetrics(districtTrainees)

        // Count home districts for migration attribution
        const homeCounts = new Map()
        for (const r of records) {
          homeCounts.set(r.homeDistrict, (homeCounts.get(r.homeDistrict) || 0) + 1)
        }
        const topHomeDistricts = Array.from(homeCounts.entries())
          .map(([homeDistrict, count]) => ({ homeDistrict, count }))
          .sort((a, b) => b.count - a.count || a.homeDistrict.localeCompare(b.homeDistrict))

        return {
          placementDistrict: pDistrict,
          ...metrics,
          topHomeDistricts,
        }
      }
    )
    placementDistrictBreakdown.sort(
      (a, b) =>
        b.totalTrainees - a.totalTrainees ||
        a.placementDistrict.localeCompare(b.placementDistrict)
    )

    res.json({
      filterApplied: {
        scheme: req.query.scheme || null,
        from: req.query.from || req.query.startDate || null,
        to: req.query.to || req.query.endDate || null,
      },
      homeDistrictBreakdown,
      placementDistrictBreakdown,
    })
  } catch (err) {
    console.error('[analytics/by-district GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to compute district analytics',
    })
  }
})

// ── GET /api/analytics/by-cohort ────────────────────────────────────────────
// Breakdown by cohortName, including response and placement rates.
// Role required: ANALYST
router.get('/analytics/by-cohort', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const whereEnrolment = buildEnrolmentFilter(req.query)

    const enrolments = await prisma.enrolment.findMany({
      where: whereEnrolment,
      include: {
        trainee: {
          include: {
            enrolments: true,
            outcomeCheckIns: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    const cohortMap = new Map()
    for (const e of enrolments) {
      const cohortName = e.cohortName?.trim() || 'Unassigned'
      if (!cohortMap.has(cohortName)) {
        cohortMap.set(cohortName, {
          cohortName,
          schemes: new Set(),
          providers: new Set(),
          traineesMap: new Map(),
        })
      }
      const group = cohortMap.get(cohortName)
      if (e.scheme) group.schemes.add(e.scheme)
      if (e.providerName) group.providers.add(e.providerName)
      if (e.trainee && !group.traineesMap.has(e.trainee.id)) {
        group.traineesMap.set(e.trainee.id, e.trainee)
      }
    }

    const cohorts = Array.from(cohortMap.values()).map((group) => {
      const traineesList = Array.from(group.traineesMap.values())
      const metrics = computeTraineeMetrics(traineesList)
      return {
        cohortName: group.cohortName,
        schemes: Array.from(group.schemes).sort(),
        providers: Array.from(group.providers).sort(),
        ...metrics,
      }
    })

    cohorts.sort(
      (a, b) => b.totalTrainees - a.totalTrainees || a.cohortName.localeCompare(b.cohortName)
    )

    res.json({
      filterApplied: {
        scheme: req.query.scheme || null,
        from: req.query.from || req.query.startDate || null,
        to: req.query.to || req.query.endDate || null,
      },
      totalCohorts: cohorts.length,
      cohorts,
    })
  } catch (err) {
    console.error('[analytics/by-cohort GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to compute cohort analytics',
    })
  }
})

// ── GET /api/analytics/by-provider ──────────────────────────────────────────
// Breakdown by providerName, joined with that provider's course relevance scores.
// Role required: ANALYST
router.get('/analytics/by-provider', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const whereEnrolment = buildEnrolmentFilter(req.query)

    const enrolments = await prisma.enrolment.findMany({
      where: whereEnrolment,
      include: {
        trainee: {
          include: {
            enrolments: true,
            outcomeCheckIns: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    // Fetch all CourseRelevanceScore rows to join
    const allScores = await prisma.courseRelevanceScore.findMany()
    const scoreMap = new Map()
    for (const score of allScores) {
      const p = score.providerName?.trim()
      if (p) {
        if (!scoreMap.has(p)) scoreMap.set(p, [])
        scoreMap.get(p).push(score)
      }
    }

    const providerMap = new Map()
    for (const e of enrolments) {
      const providerName = e.providerName?.trim() || 'Unknown Provider'
      if (!providerMap.has(providerName)) {
        providerMap.set(providerName, {
          providerName,
          schemes: new Set(),
          courses: new Set(),
          traineesMap: new Map(),
        })
      }
      const group = providerMap.get(providerName)
      if (e.scheme) group.schemes.add(e.scheme)
      if (e.courseName) group.courses.add(e.courseName)
      if (e.trainee && !group.traineesMap.has(e.trainee.id)) {
        group.traineesMap.set(e.trainee.id, e.trainee)
      }
    }

    const providers = Array.from(providerMap.values()).map((group) => {
      const traineesList = Array.from(group.traineesMap.values())
      const metrics = computeTraineeMetrics(traineesList)

      const providerScores = scoreMap.get(group.providerName) || []
      const scoredList = providerScores.filter(
        (s) => s.relevanceScore !== null && s.relevanceScore !== undefined
      )
      const avgScore =
        scoredList.length > 0
          ? Math.round(
              (scoredList.reduce((sum, s) => sum + s.relevanceScore, 0) / scoredList.length) * 10
            ) / 10
          : null

      return {
        providerName: group.providerName,
        schemes: Array.from(group.schemes).sort(),
        enrolledCourses: Array.from(group.courses).sort(),
        ...metrics,
        averageRelevanceScore: avgScore,
        courseScorecards: providerScores.map(formatScorecard),
      }
    })

    providers.sort(
      (a, b) => b.totalTrainees - a.totalTrainees || a.providerName.localeCompare(b.providerName)
    )

    res.json({
      filterApplied: {
        scheme: req.query.scheme || null,
        from: req.query.from || req.query.startDate || null,
        to: req.query.to || req.query.endDate || null,
      },
      totalProviders: providers.length,
      providers,
    })
  } catch (err) {
    console.error('[analytics/by-provider GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to compute provider analytics',
    })
  }
})

// ── GET /api/analytics/wage-progression ──────────────────────────────────────
// Evaluates trainees with >= 2 check-ins with reported wageBand, computing
// percentage moved up, stayed same, or moved down over time.
// Role required: ANALYST
router.get('/analytics/wage-progression', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const whereEnrolment = buildEnrolmentFilter(req.query)

    const trainees = await prisma.trainee.findMany({
      where:
        Object.keys(whereEnrolment).length > 0
          ? { enrolments: { some: whereEnrolment } }
          : undefined,
      include: {
        outcomeCheckIns: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    let movedUp = 0
    let stayedSame = 0
    let movedDown = 0
    let insufficientData = 0

    const transitionCounts = new Map()

    for (const trainee of trainees) {
      const checkInsWithWage = (trainee.outcomeCheckIns || []).filter(
        (c) => getWageOrdinal(c.wageBand) !== null
      )

      if (checkInsWithWage.length >= 2) {
        const first = checkInsWithWage[0]
        const last = checkInsWithWage[checkInsWithWage.length - 1]
        const firstOrd = getWageOrdinal(first.wageBand)
        const lastOrd = getWageOrdinal(last.wageBand)

        if (lastOrd > firstOrd) {
          movedUp++
        } else if (lastOrd === firstOrd) {
          stayedSame++
        } else {
          movedDown++
        }

        const transitionKey = `${first.wageBand.trim()} -> ${last.wageBand.trim()}`
        transitionCounts.set(transitionKey, (transitionCounts.get(transitionKey) || 0) + 1)
      } else {
        insufficientData++
      }
    }

    const eligibleCount = movedUp + stayedSame + movedDown
    const percentageMovedUp =
      eligibleCount > 0 ? Math.round((movedUp / eligibleCount) * 1000) / 10 : 0
    const percentageStayedSame =
      eligibleCount > 0 ? Math.round((stayedSame / eligibleCount) * 1000) / 10 : 0
    const percentageMovedDown =
      eligibleCount > 0 ? Math.round((movedDown / eligibleCount) * 1000) / 10 : 0

    const transitions = Array.from(transitionCounts.entries())
      .map(([transition, count]) => ({ transition, count }))
      .sort((a, b) => b.count - a.count)

    res.json({
      filterApplied: {
        scheme: req.query.scheme || null,
        from: req.query.from || req.query.startDate || null,
        to: req.query.to || req.query.endDate || null,
      },
      totalTrainees: trainees.length,
      eligibleTrainees: eligibleCount,
      insufficientDataCount: insufficientData,
      movedUpCount: movedUp,
      stayedSameCount: stayedSame,
      movedDownCount: movedDown,
      percentageMovedUp,
      percentageStayedSame,
      percentageMovedDown,
      transitions,
    })
  } catch (err) {
    console.error('[analytics/wage-progression GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to compute wage progression analytics',
    })
  }
})

// ── POST /api/admin/generate-provider-token ──────────────────────────────────
// Generates a cryptographically secure token for a training provider to access
// their isolated aggregate placement metrics and course scorecards.
// Role required: ANALYST
router.post('/admin/generate-provider-token', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const { providerName, expiresInDays } = req.body

    if (!providerName || typeof providerName !== 'string' || !providerName.trim()) {
      res.status(400).json({ error: 'providerName is required and must be a non-empty string.' })
      return
    }

    const trimmedProvider = providerName.trim()
    const days = Number(expiresInDays) || 30
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const token = 'pvt_' + crypto.randomBytes(24).toString('hex')

    const tokenRecord = await prisma.providerAccessToken.create({
      data: {
        providerName: trimmedProvider,
        token,
        expiresAt,
      },
    })

    await logAdminAction(
      req.adminUser.id,
      'GENERATE_PROVIDER_TOKEN',
      'ProviderAccessToken',
      tokenRecord.id,
      {
        providerName: trimmedProvider,
        expiresAt: tokenRecord.expiresAt,
        generatedBy: req.adminUser.githubUsername,
      }
    )

    const shareableLink = `/api/provider-view/${token}`
    const fullUrl = `${req.protocol}://${req.get('host')}${shareableLink}`

    res.json({
      message: 'Provider access token generated successfully',
      id: tokenRecord.id,
      providerName: tokenRecord.providerName,
      token: tokenRecord.token,
      expiresAt: tokenRecord.expiresAt,
      shareableLink,
      fullUrl,
    })
  } catch (err) {
    console.error('[admin/generate-provider-token POST] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to generate provider access token',
    })
  }
})

// ── GET /api/provider-view/:token ───────────────────────────────────────────
// PUBLIC token-authenticated endpoint for a provider to review their aggregate
// metrics and course relevance scorecards. Never exposes PII or other providers.
router.get('/provider-view/:token', async (req, res) => {
  try {
    const { token } = req.params

    if (!token) {
      res.status(400).json({ error: 'Token parameter is required.' })
      return
    }

    const tokenRecord = await prisma.providerAccessToken.findUnique({
      where: { token: token.trim() },
    })

    if (!tokenRecord) {
      res.status(404).json({ error: 'Invalid or nonexistent provider access token.' })
      return
    }

    if (tokenRecord.expiresAt && new Date() > new Date(tokenRecord.expiresAt)) {
      res
        .status(403)
        .json({ error: 'Provider access token has expired. Please contact the administrator.' })
      return
    }

    const providerName = tokenRecord.providerName
    const whereEnrolment = buildEnrolmentFilter(req.query)
    whereEnrolment.providerName = providerName

    const enrolments = await prisma.enrolment.findMany({
      where: whereEnrolment,
      include: {
        trainee: {
          include: {
            enrolments: true,
            outcomeCheckIns: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    // Group and deduplicate trainees strictly for this provider
    const traineeMap = new Map()
    const schemes = new Set()
    const courses = new Set()

    for (const e of enrolments) {
      if (e.scheme) schemes.add(e.scheme)
      if (e.courseName) courses.add(e.courseName)
      if (e.trainee && !traineeMap.has(e.trainee.id)) {
        traineeMap.set(e.trainee.id, e.trainee)
      }
    }

    const traineesList = Array.from(traineeMap.values())
    const metrics = computeTraineeMetrics(traineesList)

    // Fetch relevance scores strictly for this provider
    const scorecards = await prisma.courseRelevanceScore.findMany({
      where: { providerName },
    })

    const scored = scorecards.filter(
      (s) => s.relevanceScore !== null && s.relevanceScore !== undefined
    )
    const averageRelevanceScore =
      scored.length > 0
        ? Math.round(
            (scored.reduce((sum, s) => sum + s.relevanceScore, 0) / scored.length) * 10
          ) / 10
        : null

    res.json({
      providerName,
      tokenExpiresAt: tokenRecord.expiresAt,
      filterApplied: {
        scheme: req.query.scheme || null,
        from: req.query.from || req.query.startDate || null,
        to: req.query.to || req.query.endDate || null,
      },
      schemes: Array.from(schemes).sort(),
      enrolledCourses: Array.from(courses).sort(),
      overview: metrics,
      averageRelevanceScore,
      courses: scorecards.map(formatScorecard),
    })
  } catch (err) {
    console.error('[provider-view/:token GET] error:', err)
    res.status(500).json({
      error:
        err instanceof Error ? err.message : 'Failed to retrieve provider analytics view',
    })
  }
})


// ── POST /api/admin/seed-control-group ─────────────────────────────────────────
// Seeds synthetic ControlGroupRecord rows for the illustrative impact estimation.
// Body: { confirm: true, force?: true }
// - confirm: true is required as an explicit acknowledgement the data is synthetic.
// - force: true deletes all existing rows before re-seeding.
// Role required: ANALYST
router.post('/admin/seed-control-group', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const { confirm, force, count } = req.body

    if (confirm !== true) {
      res.status(400).json({
        error:
          'Body must include { confirm: true } to acknowledge that this seeds SYNTHETIC illustrative data, ' +
          'not a real comparison population. Pass { force: true } as well to overwrite existing rows.',
      })
      return
    }

    const existing = await prisma.controlGroupRecord.count()
    if (existing > 0 && !force) {
      res.status(409).json({
        error:
          `ControlGroupRecord already contains ${existing} rows. ` +
          'Pass { force: true } in the request body to delete them and re-seed.',
        existingRowCount: existing,
      })
      return
    }

    if (existing > 0 && force) {
      await prisma.controlGroupRecord.deleteMany()
    }

    const rowCount = Number(count) || 200
    if (rowCount < 1 || rowCount > 100000) {
      res.status(400).json({ error: 'count must be between 1 and 100,000.' })
      return
    }

    const seeded = await seedControlGroup(rowCount, prisma)

    await logAdminAction(
      req.adminUser.id,
      'SEED_CONTROL_GROUP',
      'ControlGroupRecord',
      'batch',
      {
        rowsSeeded: seeded,
        force: !!force,
        previousRows: existing,
        triggeredBy: req.adminUser.githubUsername,
        note: 'SYNTHETIC ILLUSTRATIVE DATA — not a real comparison population',
      }
    )

    res.json({
      message: `Seeded ${seeded} synthetic ControlGroupRecord rows successfully.`,
      rowsSeeded: seeded,
      disclaimer:
        'These are SYNTHETIC illustrative rows generated by a deterministic seeded PRNG. ' +
        'They do not represent real people who did not undergo vocational training.',
    })
  } catch (err) {
    console.error('[admin/seed-control-group POST] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to seed control group data',
    })
  }
})

// ── GET /api/analytics/impact ──────────────────────────────────────────────────
// Returns the impact estimation result from computeImpact().
// Every response includes the fixed disclaimer string — it cannot be suppressed.
// Role required: ANALYST
router.get('/analytics/impact', requireAdmin('ANALYST'), async (req, res) => {
  try {
    const result = await computeImpact()

    // Sanity check: disclaimer must always be present
    if (!result.disclaimer) {
      throw new Error('Internal error: computeImpact() returned a result without a disclaimer.')
    }

    res.json(result)
  } catch (err) {
    console.error('[analytics/impact GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to compute impact estimate',
    })
  }
})

export default router
