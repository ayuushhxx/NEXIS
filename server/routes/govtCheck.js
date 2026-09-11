/**
 * FILE: server/routes/govtCheck.js
 * PURPOSE: Endpoints for admin-triggered government registry cross-checks (e-Shram and UDYAM)
 *          and trainee cross-check history retrieval.
 * DEPENDENCIES: server/lib/prisma, server/utils/adminAuth, server/utils/consent,
 *               server/services/govtVerificationService
 * USED BY: server/index.js
 */

import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAdmin, logAdminAction } from '../utils/adminAuth.js'
import { resolveCurrentConsent } from '../utils/consent.js'
import { checkEShram, checkUdyam } from '../services/govtVerificationService.js'

const router = Router()

// ── POST /api/admin/trigger-govt-crosscheck ──────────────────────────────────
// Admin initiates cross-check against e-Shram and UDYAM registries for a trainee.
// Auth: Authorization: Bearer <github_token> (minRole: ANALYST)
// Body: { traineeId }
router.post('/admin/trigger-govt-crosscheck', requireAdmin('ANALYST'), async (req, res) => {
  const { traineeId } = req.body ?? {}

  if (!traineeId || typeof traineeId !== 'string' || traineeId.trim() === '') {
    res.status(400).json({ error: 'Missing required field: traineeId' })
    return
  }

  try {
    // 1. Look up trainee with enrolments for trade context
    const trainee = await prisma.trainee.findUnique({
      where: { id: traineeId.trim() },
      include: {
        enrolments: {
          orderBy: { enrolmentDate: 'desc' },
        },
      },
    })

    if (!trainee) {
      res.status(404).json({ error: `Trainee not found with id: ${traineeId}` })
      return
    }

    // 2. Consent Check: GOVT_CROSS_CHECK must be granted
    const consent = await resolveCurrentConsent(trainee.id, prisma)
    if (!consent?.GOVT_CROSS_CHECK?.granted) {
      res.status(403).json({
        error: 'Government registry cross-check requires explicit "GOVT_CROSS_CHECK" consent from the trainee under DPDP guidelines.',
        consentRequired: 'GOVT_CROSS_CHECK',
      })
      return
    }

    // 3. Execute both registry checks
    const [eshramResult, udyamResult] = await Promise.all([
      checkEShram(trainee),
      checkUdyam(trainee),
    ])

    // 4. Persist results in transaction
    const [savedEShram, savedUdyam] = await prisma.$transaction([
      prisma.govtCrossCheckResult.create({
        data: {
          traineeId: trainee.id,
          source: 'ESHRAM',
          matchFound: eshramResult.matchFound,
          matchConfidence: eshramResult.matchConfidence,
          matchedRecordSummary: eshramResult.summary,
        },
      }),
      prisma.govtCrossCheckResult.create({
        data: {
          traineeId: trainee.id,
          source: 'UDYAM',
          matchFound: udyamResult.matchFound,
          matchConfidence: udyamResult.matchConfidence,
          matchedRecordSummary: udyamResult.summary,
        },
      }),
    ])

    // 5. Log the admin action
    await logAdminAction(req.adminUser.id, 'GOVT_CROSS_CHECK', 'Trainee', trainee.id, {
      traineeName: trainee.name,
      eshramMatch: eshramResult.matchFound,
      eshramConfidence: eshramResult.matchConfidence,
      udyamMatch: udyamResult.matchFound,
      udyamConfidence: udyamResult.matchConfidence,
    })

    res.status(200).json({
      traineeId: trainee.id,
      traineeName: trainee.name,
      results: [savedEShram, savedUdyam],
    })
  } catch (err) {
    console.error('[admin/trigger-govt-crosscheck POST] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to execute government cross-check',
    })
  }
})

// ── GET /api/trainee/govt-crosscheck-history/:traineeId ───────────────────────
// Returns all government registry cross-check results for a trainee, newest first.
// Public lookup mirroring status-history and consent query endpoints.
router.get('/trainee/govt-crosscheck-history/:traineeId', async (req, res) => {
  const { traineeId } = req.params

  if (!traineeId || traineeId.trim() === '') {
    res.status(400).json({ error: 'Missing traineeId parameter' })
    return
  }

  try {
    const trainee = await prisma.trainee.findUnique({
      where: { id: traineeId.trim() },
      select: { id: true, name: true },
    })

    if (!trainee) {
      res.status(404).json({ error: `Trainee not found with id: ${traineeId}` })
      return
    }

    const history = await prisma.govtCrossCheckResult.findMany({
      where: { traineeId: trainee.id },
      orderBy: { checkedAt: 'desc' },
    })

    res.json({
      traineeId: trainee.id,
      traineeName: trainee.name,
      history,
    })
  } catch (err) {
    console.error('[trainee/govt-crosscheck-history GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to retrieve government cross-check history',
    })
  }
})

export default router
