/**
 * FILE: server/routes/trainee.js
 * PURPOSE: Trainee profile creation, update, and retrieval endpoints.
 * DEPENDENCIES: server/lib/prisma, server/utils/auth, server/utils/consent
 * USED BY: server/index.js
 */

import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { resolveGithubIdentity } from '../utils/auth.js'
import { resolveCurrentConsent } from '../utils/consent.js'
import { validateOtpVerificationToken } from './otpAuth.js'
import crypto from 'crypto'

const router = Router()

// ── Validation helpers ────────────────────────────────────────────────────────

// Accepts E.164-compatible numbers (with or without leading +), 7–15 digits.
// Lenient enough for Indian mobile (10 digits) and international formats.
const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/

/**
 * Returns a 400 error string if required fields are missing, otherwise null.
 * Kept as a pure function so it's independently testable.
 */
function validateProfileBody(body) {
  const required = ['phoneNumber', 'name', 'scheme', 'courseName', 'providerName', 'cohortName', 'enrolmentDate']
  for (const field of required) {
    if (!body?.[field] || String(body[field]).trim() === '') {
      return `Missing required field: ${field}`
    }
  }
  if (!PHONE_REGEX.test(String(body.phoneNumber).trim())) {
    return 'Invalid phoneNumber. Expected E.164-compatible format (e.g. +919876543210 or 9876543210).'
  }
  const dateTs = Date.parse(body.enrolmentDate)
  if (isNaN(dateTs)) {
    return 'Invalid enrolmentDate. Expected an ISO 8601 date string (e.g. 2024-06-01).'
  }
  return null
}

// ── POST /api/trainee/profile ─────────────────────────────────────────────────
// Creates or updates the caller's Trainee record and appends a new Enrolment.
// Auth: Authorization: Bearer <github_token>
// Body: { phoneNumber, name, preferredLanguage?, scheme, courseName, providerName, cohortName, enrolmentDate, certificationDate?, dateOfBirth?, district?, aadhaarLast4?, otpVerificationToken }
router.post('/trainee/profile', async (req, res) => {
  // 1. Resolve caller identity
  let caller
  try {
    caller = await resolveGithubIdentity(req)
  } catch (authErr) {
    res.status(authErr.statusCode || 401).json({ error: authErr.message })
    return
  }

  // 2. Validate request body
  const validationError = validateProfileBody(req.body)
  if (validationError) {
    res.status(400).json({ error: validationError })
    return
  }

  const {
    phoneNumber,
    name,
    scheme,
    courseName,
    providerName,
    cohortName,
    enrolmentDate,
    certificationDate,
    dateOfBirth,
    district,
    aadhaarLast4,
    priorQualification,
    otpVerificationToken
  } = req.body

  if (!otpVerificationToken) {
    res.status(400).json({ error: 'otpVerificationToken is required to verify identity.' })
    return
  }

  const verifiedPhone = validateOtpVerificationToken(otpVerificationToken);
  if (!verifiedPhone || verifiedPhone !== String(phoneNumber).trim()) {
    res.status(401).json({ error: 'Invalid or expired OTP verification token for this phone number.' })
    return
  }

  const preferredLanguage = String(req.body?.preferredLanguage || 'en').trim() || 'en'
  
  let aadhaarLast4Hash = null;
  if (aadhaarLast4 && /^\d{4}$/.test(String(aadhaarLast4).trim())) {
    aadhaarLast4Hash = crypto.createHash('sha256').update(String(aadhaarLast4).trim()).digest('hex');
  }

  try {
    // 3. Upsert Trainee — match on githubId (the session link), not phoneNumber,
    //    so a user can correct their phone number without creating a duplicate record.
    const trainee = await prisma.trainee.upsert({
      where: { githubId: caller.githubId },
      update: {
        phoneNumber: String(phoneNumber).trim(),
        name: String(name).trim(),
        preferredLanguage,
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(district && { district: String(district).trim() }),
        ...(aadhaarLast4Hash && { aadhaarLast4Hash }),
        ...(priorQualification && { priorQualification: String(priorQualification).trim() }),
        phoneVerified: true
      },
      create: {
        phoneNumber: String(phoneNumber).trim(),
        name: String(name).trim(),
        preferredLanguage,
        githubId: caller.githubId,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        district: district ? String(district).trim() : null,
        aadhaarLast4Hash: aadhaarLast4Hash || null,
        priorQualification: priorQualification ? String(priorQualification).trim() : null,
        phoneVerified: true
      },
    })

    // 4. Append a new Enrolment row (no deduplication — re-enrolment is valid)
    const enrolment = await prisma.enrolment.create({
      data: {
        traineeId: trainee.id,
        scheme: String(scheme).trim(),
        courseName: String(courseName).trim(),
        providerName: String(providerName).trim(),
        cohortName: String(cohortName).trim(),
        enrolmentDate: new Date(enrolmentDate),
        certificationDate: certificationDate ? new Date(certificationDate) : null,
      },
    })

    // 201 for first-time creation, 200 for subsequent updates
    const isNew = trainee.createdAt.getTime() === trainee.updatedAt.getTime()
    res.status(isNew ? 201 : 200).json({ trainee, enrolment })
  } catch (err) {
    // Surface Prisma unique-constraint violation on phoneNumber with a clear message
    if (err?.code === 'P2002' && err?.meta?.target?.includes('phoneNumber')) {
      res.status(409).json({
        error: 'This phone number is already registered to a different account.',
      })
      return
    }
    console.error('[trainee/profile POST] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save trainee profile' })
  }
})

// ── GET /api/trainee/profile ──────────────────────────────────────────────────
// Returns the caller's Trainee record with all linked Enrolments and current consent state.
// Auth: Authorization: Bearer <github_token>
router.get('/trainee/profile', async (req, res) => {
  // 1. Resolve caller identity
  let caller
  try {
    caller = await resolveGithubIdentity(req)
  } catch (authErr) {
    res.status(authErr.statusCode || 401).json({ error: authErr.message })
    return
  }

  try {
    // 2. Look up trainee by githubId
    const trainee = await prisma.trainee.findUnique({
      where: { githubId: caller.githubId },
    })

    if (!trainee || trainee.phoneNumber.startsWith('temp_')) {
      res.status(404).json({
        error: 'No profile found for this account. POST /api/trainee/profile to create one.',
      })
      return
    }

    // 3. Fetch all enrolments and current consent state in parallel
    const [enrolments, consent] = await Promise.all([
      prisma.enrolment.findMany({
        where: { traineeId: trainee.id },
        orderBy: { enrolmentDate: 'desc' },
      }),
      resolveCurrentConsent(trainee.id, prisma),
    ])

    res.json({ trainee, enrolments, consent })
  } catch (err) {
    console.error('[trainee/profile GET] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to retrieve trainee profile' })
  }
})

export default router
