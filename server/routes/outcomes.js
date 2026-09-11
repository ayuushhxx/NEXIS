/**
 * FILE: server/routes/outcomes.js
 * PURPOSE: Outcome self-reporting, status history, admin check-in triggering,
 *          and simulated WhatsApp/SMS reply webhook endpoints.
 * DEPENDENCIES: server/lib/prisma, server/utils/auth, server/services/notificationService
 * USED BY: server/index.js
 */

import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { resolveGithubIdentity } from '../utils/auth.js'
import { sendCheckinMessage } from '../services/notificationService.js'
import { requireAdmin } from '../utils/adminAuth.js'

const router = Router()

// ── Allowed value sets (enforced here, not in DB) ─────────────────────────────

const CHECKIN_TYPES = Object.freeze(['SELF_INITIATED', '90_DAY', '180_DAY', '365_DAY'])
const CHECKIN_STATUSES = Object.freeze(['PENDING', 'COMPLETED', 'NO_RESPONSE'])
const EMPLOYMENT_STATUSES = Object.freeze(['EMPLOYED', 'SELF_EMPLOYED', 'SEARCHING', 'IN_TRAINING', 'OTHER'])
const WAGE_BANDS = Object.freeze(['0-10k', '10-20k', '20k+'])
export const ROLE_RELEVANCE_VALUES = Object.freeze(['DIRECTLY_RELATED', 'SOMEWHAT_RELATED', 'UNRELATED'])
export const NON_PLACEMENT_REASON_VALUES = Object.freeze([
  'SKILL_GAP',
  'WAGE_EXPECTATION',
  'LOCATION',
  'NO_RESPONSE_FROM_EMPLOYERS',
  'OTHER',
])

// Maps each scheduled check-in type to the approximate number of days after enrolment
const CHECKIN_DAY_MAP = { '90_DAY': 90, '180_DAY': 180, '365_DAY': 365 }

// Tolerance window (±days) used when matching "trainees due for a check-in"
const TOLERANCE_DAYS = 3

// ── POST /api/trainee/status-update ──────────────────────────────────────────
// Self-report endpoint — trainee reports their employment status at any time.
// Auth: Authorization: Bearer <github_token>
// Body: { employmentStatus, employerName?, wageBand?, notes?, roleRelevance?, selfEmploymentType?, apprenticeshipEmployer?, nonPlacementReason? }
router.post('/trainee/status-update', async (req, res) => {
  let caller
  try {
    caller = await resolveGithubIdentity(req)
  } catch (authErr) {
    res.status(authErr.statusCode || 401).json({ error: authErr.message })
    return
  }

  const {
    employmentStatus,
    employerName,
    wageBand,
    notes,
    roleRelevance,
    selfEmploymentType,
    apprenticeshipEmployer,
    nonPlacementReason,
    placementDistrict,
  } = req.body ?? {}

  // Validate employmentStatus — required for a self-report
  if (!employmentStatus || String(employmentStatus).trim() === '') {
    res.status(400).json({ error: 'Missing required field: employmentStatus' })
    return
  }
  const normEmploymentStatus = String(employmentStatus).trim()
  if (!EMPLOYMENT_STATUSES.includes(normEmploymentStatus)) {
    res.status(400).json({
      error: `Unknown employmentStatus: "${employmentStatus}". Allowed values: ${EMPLOYMENT_STATUSES.join(', ')}`,
    })
    return
  }
  if (wageBand && !WAGE_BANDS.includes(String(wageBand).trim())) {
    res.status(400).json({
      error: `Unknown wageBand: "${wageBand}". Allowed values: ${WAGE_BANDS.join(', ')}`,
    })
    return
  }
  if (roleRelevance && !ROLE_RELEVANCE_VALUES.includes(String(roleRelevance).trim())) {
    res.status(400).json({
      error: `Unknown roleRelevance: "${roleRelevance}". Allowed values: ${ROLE_RELEVANCE_VALUES.join(', ')}`,
    })
    return
  }
  if (nonPlacementReason && !NON_PLACEMENT_REASON_VALUES.includes(String(nonPlacementReason).trim())) {
    res.status(400).json({
      error: `Unknown nonPlacementReason: "${nonPlacementReason}". Allowed values: ${NON_PLACEMENT_REASON_VALUES.join(', ')}`,
    })
    return
  }

  try {
    const trainee = await prisma.trainee.findUnique({
      where: { githubId: caller.githubId },
    })
    if (!trainee) {
      res.status(404).json({
        error: 'No trainee profile found. POST /api/trainee/profile first.',
      })
      return
    }

    const checkIn = await prisma.outcomeCheckIn.create({
      data: {
        traineeId: trainee.id,
        checkinType: 'SELF_INITIATED',
        status: 'COMPLETED',
        employmentStatus: normEmploymentStatus,
        employerName: employerName ? String(employerName).trim() : null,
        wageBand: wageBand ? String(wageBand).trim() : null,
        notes: notes ? String(notes).trim() : null,
        roleRelevance: roleRelevance ? String(roleRelevance).trim() : null,
        selfEmploymentType: selfEmploymentType ? String(selfEmploymentType).trim() : null,
        apprenticeshipEmployer: apprenticeshipEmployer ? String(apprenticeshipEmployer).trim() : null,
        nonPlacementReason: nonPlacementReason ? String(nonPlacementReason).trim() : null,
        placementDistrict: placementDistrict ? String(placementDistrict).trim() : null,
        respondedAt: new Date(),
      },
      include: {
        employerVerification: true,
      },
    })

    res.status(201).json({ checkIn })
  } catch (err) {
    console.error('[trainee/status-update POST] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to record status update' })
  }
})

// ── GET /api/trainee/status-history/:traineeId ────────────────────────────────
// Returns all OutcomeCheckIns for a trainee, newest first — for timeline rendering.
// Public (no auth) — mirrors GET /api/consent/:traineeId pattern.
router.get('/trainee/status-history/:traineeId', async (req, res) => {
  const { traineeId } = req.params

  if (!traineeId || traineeId.trim() === '') {
    res.status(400).json({ error: 'Missing traineeId parameter' })
    return
  }

  try {
    const trainee = await prisma.trainee.findUnique({
      where: { id: traineeId },
      select: { id: true, name: true },
    })
    if (!trainee) {
      res.status(404).json({ error: `No trainee found with id: ${traineeId}` })
      return
    }

    const history = await prisma.outcomeCheckIn.findMany({
      where: { traineeId },
      include: { employerVerification: true },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ traineeId, trainee, history })
  } catch (err) {
    console.error('[trainee/status-history GET] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch status history' })
  }
})

// ── POST /api/admin/trigger-checkins ─────────────────────────────────────────
// Manually-triggerable stand-in for a cron job.
// Finds all Trainees whose earliest enrolmentDate is ~90, ~180, or ~365 days ago
// (within ±TOLERANCE_DAYS), creates a PENDING OutcomeCheckIn for each, and fires
// sendCheckinMessage via notificationService.
//
// Body (all optional):
//   { daysAgo: number }  — override to force a specific window (demo use only)
//
// Safeguard: if a Trainee already has a PENDING check-in of the same type, skip them.
router.post('/admin/trigger-checkins', requireAdmin('ANALYST'), async (req, res) => {
  const { daysAgo } = req.body ?? {}


  // Build the list of windows to check: either a forced single window (daysAgo override)
  // or all three standard milestones.
  let windows
  if (daysAgo !== undefined) {
    const n = Number(daysAgo)
    if (isNaN(n) || n <= 0) {
      res.status(400).json({ error: 'daysAgo must be a positive number' })
      return
    }
    // Map the override to the nearest standard type, or use a special label
    const nearestType =
      Math.abs(n - 90) <= TOLERANCE_DAYS
        ? '90_DAY'
        : Math.abs(n - 180) <= TOLERANCE_DAYS
        ? '180_DAY'
        : Math.abs(n - 365) <= TOLERANCE_DAYS
        ? '365_DAY'
        : null

    if (!nearestType) {
      // Demo override: treat daysAgo as an exact target and snap to nearest type
      const snapped =
        n <= 135 ? '90_DAY' : n <= 272 ? '180_DAY' : '365_DAY'
      windows = [{ type: snapped, targetDays: n }]
    } else {
      windows = [{ type: nearestType, targetDays: n }]
    }
  } else {
    windows = Object.entries(CHECKIN_DAY_MAP).map(([type, targetDays]) => ({ type, targetDays }))
  }

  const now = new Date()
  const triggered = []
  const skipped = []
  const errors = []

  for (const { type, targetDays } of windows) {
    const low = new Date(now)
    low.setDate(low.getDate() - (targetDays + TOLERANCE_DAYS))
    const high = new Date(now)
    high.setDate(high.getDate() - (targetDays - TOLERANCE_DAYS))

    // Find trainees whose EARLIEST enrolment falls in the window
    const candidates = await prisma.trainee.findMany({
      include: {
        enrolments: {
          orderBy: { enrolmentDate: 'asc' },
          take: 1,
        },
        outcomeCheckIns: {
          where: { checkinType: type, status: 'PENDING' },
          take: 1,
        },
      },
    })

    for (const trainee of candidates) {
      const earliest = trainee.enrolments[0]
      if (!earliest) continue

      const enrolDate = new Date(earliest.enrolmentDate)
      if (enrolDate < low || enrolDate > high) continue

      // Safeguard: skip if already has a PENDING check-in of this type
      if (trainee.outcomeCheckIns.length > 0) {
        skipped.push({ traineeId: trainee.id, name: trainee.name, type, reason: 'already_pending' })
        continue
      }

      try {
        const scheduledFor = new Date(enrolDate)
        scheduledFor.setDate(scheduledFor.getDate() + targetDays)

        const checkIn = await prisma.outcomeCheckIn.create({
          data: {
            traineeId: trainee.id,
            checkinType: type,
            status: 'PENDING',
            scheduledFor,
          },
        })

        const msgResult = await sendCheckinMessage(trainee, checkIn)
        triggered.push({
          traineeId: trainee.id,
          name: trainee.name,
          type,
          checkinId: checkIn.id,
          messageId: msgResult.messageId,
        })
      } catch (err) {
        console.error(`[admin/trigger-checkins] error for trainee ${trainee.id}:`, err)
        errors.push({ traineeId: trainee.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  res.json({
    triggered: triggered.length,
    skipped: skipped.length,
    errors: errors.length,
    detail: { triggered, skipped, errors },
    windows: windows.map((w) => `${w.type} (~${w.targetDays} days ±${TOLERANCE_DAYS})`),
  })
})

// ── POST /api/webhook/checkin-reply ──────────────────────────────────────────
// Simulates an inbound WhatsApp/SMS reply (stand-in for a real provider webhook).
// In production, the WhatsApp Business API or SMS gateway would POST here with
// the trainee's reply payload.
//
// Body: { traineeId, checkinId, employmentStatus, wageBand?, employerName? }
router.post('/webhook/checkin-reply', async (req, res) => {
  const { traineeId, checkinId, employmentStatus, wageBand, employerName } = req.body ?? {}

  if (!traineeId || !checkinId) {
    res.status(400).json({ error: 'Missing required fields: traineeId, checkinId' })
    return
  }
  if (!employmentStatus || !EMPLOYMENT_STATUSES.includes(String(employmentStatus).trim())) {
    res.status(400).json({
      error: `Missing or invalid employmentStatus. Allowed values: ${EMPLOYMENT_STATUSES.join(', ')}`,
    })
    return
  }
  if (wageBand && !WAGE_BANDS.includes(String(wageBand).trim())) {
    res.status(400).json({
      error: `Unknown wageBand: "${wageBand}". Allowed values: ${WAGE_BANDS.join(', ')}`,
    })
    return
  }

  try {
    // Find the specific PENDING check-in
    const checkIn = await prisma.outcomeCheckIn.findUnique({
      where: { id: checkinId },
    })

    if (!checkIn) {
      res.status(404).json({ error: `No check-in found with id: ${checkinId}` })
      return
    }
    if (checkIn.traineeId !== traineeId) {
      res.status(403).json({ error: 'traineeId does not match the check-in record' })
      return
    }
    if (checkIn.status !== 'PENDING') {
      res.status(409).json({
        error: `Check-in is already ${checkIn.status}. Only PENDING check-ins can be updated via reply.`,
      })
      return
    }

    const updated = await prisma.outcomeCheckIn.update({
      where: { id: checkinId },
      data: {
        status: 'COMPLETED',
        employmentStatus: String(employmentStatus).trim(),
        wageBand: wageBand ? String(wageBand).trim() : null,
        employerName: employerName ? String(employerName).trim() : null,
        respondedAt: new Date(),
      },
    })

    res.json({ checkIn: updated })
  } catch (err) {
    console.error('[webhook/checkin-reply POST] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process check-in reply' })
  }
})

export default router
