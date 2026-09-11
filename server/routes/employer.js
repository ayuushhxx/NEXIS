/**
 * FILE: server/routes/employer.js
 * PURPOSE: Employer verification request generation, public verification token lookup,
 *          and employer confirmation/denial resolution.
 * DEPENDENCIES: server/lib/prisma, server/utils/auth, server/utils/consent,
 *               server/services/notificationService
 * USED BY: server/index.js
 */

import { Router } from 'express'
import crypto from 'crypto'
import prisma from '../lib/prisma.js'
import { resolveGithubIdentity } from '../utils/auth.js'
import { resolveCurrentConsent } from '../utils/consent.js'
import { sendEmployerVerificationRequest } from '../services/notificationService.js'

const router = Router()

// ── Configuration & Value Sets ───────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Common free/consumer email domains. If an employer email ends in one of these,
// contactDomainFlag is set to true as a lower-confidence signal without blocking.
const FREE_EMAIL_DOMAINS = Object.freeze([
  'gmail.com',
  'yahoo.com',
  'yahoo.co.in',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'mail.com',
  'protonmail.com',
  'aol.com',
  'rediffmail.com',
  'zoho.com',
  'yandex.com',
])

export const DENIAL_REASON_CODES = Object.freeze([
  'SKILL_GAP',
  'WAGE_MISMATCH',
  'LOCATION',
  'NO_SHOW',
  'ROLE_MISMATCH',
  'OTHER',
])

function isFreeConsumerDomain(email) {
  if (!email || !email.includes('@')) return false
  const domain = email.split('@')[1].trim().toLowerCase()
  return FREE_EMAIL_DOMAINS.includes(domain)
}

function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex')
}

// ── POST /api/trainee/request-employer-verification ──────────────────────────
// Trainee triggers verification email for an "EMPLOYED" checkin.
// Auth: Authorization: Bearer <github_token>
// Body: { outcomeCheckInId, employerContact }
router.post('/trainee/request-employer-verification', async (req, res) => {
  let caller
  try {
    caller = await resolveGithubIdentity(req)
  } catch (authErr) {
    res.status(authErr.statusCode || 401).json({ error: authErr.message })
    return
  }

  const { outcomeCheckInId, employerContact } = req.body ?? {}

  // 1. Basic validation
  if (!outcomeCheckInId || typeof outcomeCheckInId !== 'string') {
    res.status(400).json({ error: 'Missing required field: outcomeCheckInId' })
    return
  }

  if (!employerContact || !EMAIL_REGEX.test(String(employerContact).trim())) {
    res.status(400).json({
      error: 'Invalid or missing employerContact. A valid email address is required.',
    })
    return
  }

  try {
    // 2. Identify trainee
    const trainee = await prisma.trainee.findUnique({
      where: { githubId: caller.githubId },
    })

    if (!trainee) {
      res.status(404).json({ error: 'No trainee profile found for this account.' })
      return
    }

    // 3. Consent check: EMPLOYER_SHARING must be granted
    const consent = await resolveCurrentConsent(trainee.id, prisma)
    if (!consent?.EMPLOYER_SHARING?.granted) {
      res.status(403).json({
        error: 'Employer verification requires "EMPLOYER_SHARING" consent. Please update your consent settings.',
        consentRequired: 'EMPLOYER_SHARING',
      })
      return
    }

    // 4. Validate the OutcomeCheckIn
    const checkIn = await prisma.outcomeCheckIn.findUnique({
      where: { id: outcomeCheckInId },
      include: { employerVerification: true },
    })

    if (!checkIn) {
      res.status(404).json({ error: 'Outcome check-in record not found.' })
      return
    }

    if (checkIn.traineeId !== trainee.id) {
      res.status(403).json({ error: 'You do not own this outcome check-in record.' })
      return
    }

    if (checkIn.employmentStatus !== 'EMPLOYED') {
      res.status(400).json({
        error: `Employer verification is only applicable when employmentStatus is "EMPLOYED". Current status is "${checkIn.employmentStatus}".`,
      })
      return
    }

    if (checkIn.employerVerification) {
      res.status(409).json({
        error: 'An employer verification request has already been created for this check-in.',
        verification: checkIn.employerVerification,
      })
      return
    }

    // 5. Compute domain flag and tokens
    const contactEmail = String(employerContact).trim().toLowerCase()
    const contactDomainFlag = isFreeConsumerDomain(contactEmail)
    const verificationToken = generateVerificationToken()
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days out

    // 6. Create EmployerVerification record
    const verification = await prisma.employerVerification.create({
      data: {
        outcomeCheckInId: checkIn.id,
        traineeId: trainee.id,
        employerNameClaimed: checkIn.employerName || 'Claimed Employer',
        employerContactEmail: contactEmail,
        contactDomainFlag,
        verificationToken,
        tokenExpiresAt,
        status: 'PENDING',
      },
    })

    // 7. Dispatch verification request notification
    const clientOrigin = req.headers.origin || 'http://localhost:3000'
    const verificationLink = `${clientOrigin}/verify/${verificationToken}`

    await sendEmployerVerificationRequest(contactEmail, verificationLink, {
      traineeName: trainee.name,
      employerNameClaimed: checkIn.employerName,
      contactDomainFlag,
    })

    res.status(201).json({
      verification,
      verificationLink,
      message: 'Employer verification request created and dispatched.',
    })
  } catch (err) {
    console.error('[trainee/request-employer-verification POST] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to request employer verification',
    })
  }
})

// ── GET /api/verify/:token ────────────────────────────────────────────────────
// Public lookup for the verification portal.
// Returns trainee first name only, claimed employer name, scheme/course context,
// and current resolution status.
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params

  if (!token || token.trim() === '') {
    res.status(400).json({ error: 'Missing verification token parameter' })
    return
  }

  try {
    const verification = await prisma.employerVerification.findUnique({
      where: { verificationToken: token.trim() },
      include: {
        trainee: {
          select: {
            id: true,
            name: true,
            enrolments: {
              orderBy: { enrolmentDate: 'desc' },
              select: {
                scheme: true,
                courseName: true,
                providerName: true,
                enrolmentDate: true,
                certificationDate: true,
              },
            },
          },
        },
        outcomeCheckIn: {
          select: {
            id: true,
            employmentStatus: true,
            employerName: true,
            wageBand: true,
            roleRelevance: true,
            apprenticeshipEmployer: true,
            createdAt: true,
          },
        },
      },
    })

    if (!verification) {
      res.status(404).json({ error: 'Invalid or unknown verification token.' })
      return
    }

    const isExpired = new Date() > new Date(verification.tokenExpiresAt)
    if (isExpired && verification.status === 'PENDING') {
      res.status(410).json({
        error: 'This verification request has expired (tokens are valid for 30 days).',
        expired: true,
        status: verification.status,
      })
      return
    }

    // Privacy-preserving: return only first name of trainee
    const traineeFirstName = verification.trainee?.name
      ? verification.trainee.name.split(' ')[0]
      : 'Candidate'

    const primaryEnrolment = verification.trainee?.enrolments?.[0] || null

    res.json({
      id: verification.id,
      status: verification.status,
      traineeFirstName,
      employerNameClaimed: verification.employerNameClaimed,
      contactDomainFlag: verification.contactDomainFlag,
      employerContactEmail: verification.employerContactEmail,
      tokenExpiresAt: verification.tokenExpiresAt,
      verifiedByName: verification.verifiedByName,
      verifiedAt: verification.verifiedAt,
      reasonCode: verification.reasonCode,
      reasonNotes: verification.reasonNotes,
      courseContext: primaryEnrolment
        ? {
            scheme: primaryEnrolment.scheme,
            courseName: primaryEnrolment.courseName,
            providerName: primaryEnrolment.providerName,
          }
        : null,
      claimedWageBand: verification.outcomeCheckIn?.wageBand || null,
      claimedRelevance: verification.outcomeCheckIn?.roleRelevance || null,
    })
  } catch (err) {
    console.error('[verify/:token GET] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to fetch verification details',
    })
  }
})

// ── POST /api/verify/:token ───────────────────────────────────────────────────
// Public submission from employer confirming or denying employment.
// Body: { decision: "CONFIRMED" | "DENIED", reasonCode?, reasonNotes?, verifiedByName }
router.post('/verify/:token', async (req, res) => {
  const { token } = req.params
  const { decision, reasonCode, reasonNotes, verifiedByName } = req.body ?? {}

  if (!token || token.trim() === '') {
    res.status(400).json({ error: 'Missing verification token parameter' })
    return
  }

  if (decision !== 'CONFIRMED' && decision !== 'DENIED') {
    res.status(400).json({
      error: 'Invalid decision. Allowed values: "CONFIRMED" or "DENIED"',
    })
    return
  }

  if (decision === 'DENIED') {
    if (!reasonCode || !DENIAL_REASON_CODES.includes(String(reasonCode).trim())) {
      res.status(400).json({
        error: `reasonCode is required when decision is "DENIED". Allowed values: ${DENIAL_REASON_CODES.join(', ')}`,
      })
      return
    }
  }

  try {
    const verification = await prisma.employerVerification.findUnique({
      where: { verificationToken: token.trim() },
    })

    if (!verification) {
      res.status(404).json({ error: 'Invalid or unknown verification token.' })
      return
    }

    if (verification.status !== 'PENDING') {
      res.status(409).json({
        error: `This verification has already been resolved with decision "${verification.status}".`,
        status: verification.status,
      })
      return
    }

    if (new Date() > new Date(verification.tokenExpiresAt)) {
      res.status(410).json({
        error: 'This verification request has expired (30-day window passed).',
      })
      return
    }

    const updated = await prisma.employerVerification.update({
      where: { id: verification.id },
      data: {
        status: decision,
        reasonCode: decision === 'DENIED' ? String(reasonCode).trim() : null,
        reasonNotes: reasonNotes ? String(reasonNotes).trim() : null,
        verifiedByName: verifiedByName ? String(verifiedByName).trim() : null,
        verifiedAt: new Date(),
      },
    })

    res.json({
      message: `Employment claim successfully ${decision.toLowerCase()}.`,
      verification: updated,
    })
  } catch (err) {
    console.error('[verify/:token POST] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to submit verification decision',
    })
  }
})

export default router
