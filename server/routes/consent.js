/**
 * FILE: server/routes/consent.js
 * PURPOSE: Consent recording (audit-trail style) and current-state retrieval endpoints.
 * DEPENDENCIES: server/lib/prisma, server/utils/auth, server/utils/consent
 * USED BY: server/index.js
 */

import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { resolveGithubIdentity } from '../utils/auth.js'
import { ALLOWED_SCOPES, resolveCurrentConsent } from '../utils/consent.js'

const router = Router()

// ── POST /api/consent ─────────────────────────────────────────────────────────
// Records a new consent event (grant or revoke) for the calling user's Trainee record.
// Each call appends a new ConsentRecord row — existing rows are never mutated.
// Auth: Authorization: Bearer <github_token>
// Body: { scope: string, granted: boolean, version?: string }
router.post('/consent', async (req, res) => {
  // 1. Resolve caller identity
  let caller
  try {
    caller = await resolveGithubIdentity(req)
  } catch (authErr) {
    res.status(authErr.statusCode || 401).json({ error: authErr.message })
    return
  }

  // 2. Validate body fields
  const { scope, granted, version } = req.body ?? {}

  if (!scope || String(scope).trim() === '') {
    res.status(400).json({ error: 'Missing required field: scope' })
    return
  }
  if (!ALLOWED_SCOPES.includes(String(scope).trim())) {
    res.status(400).json({
      error: `Unknown consent scope: "${scope}". Allowed values: ${ALLOWED_SCOPES.join(', ')}`,
    })
    return
  }
  if (typeof granted !== 'boolean') {
    res.status(400).json({
      error: 'Field "granted" must be a boolean (true or false)',
    })
    return
  }

  const consentVersion = String(version || 'v1').trim() || 'v1'

  try {
    // 3. Ensure the caller has a Trainee record — if not, auto-create a stub record so consent can be recorded
    let trainee = await prisma.trainee.findUnique({
      where: { githubId: caller.githubId },
    })

    if (!trainee) {
      trainee = await prisma.trainee.create({
        data: {
          githubId: caller.githubId,
          name: caller.login || 'Trainee',
          phoneNumber: `temp_${caller.githubId}`,
        },
      })
    }

    // 4. Append a new ConsentRecord (audit-trail style — never update existing rows)
    const consentRecord = await prisma.consentRecord.create({
      data: {
        traineeId: trainee.id,
        scope: String(scope).trim(),
        granted,
        grantedAt: new Date(),
        revokedAt: granted ? null : new Date(), // set revokedAt when explicitly revoking
        version: consentVersion,
      },
    })

    res.status(201).json({ consentRecord })
  } catch (err) {
    console.error('[consent POST] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to record consent' })
  }
})

// ── GET /api/consent ──────────────────────────────────────────────────────────
// Returns the current consent state for the authenticated caller.
// If caller has no Trainee record yet, returns { consent: {} } (no scopes granted).
// Auth: Authorization: Bearer <github_token>
router.get('/consent', async (req, res) => {
  let caller
  try {
    caller = await resolveGithubIdentity(req)
  } catch (authErr) {
    res.status(authErr.statusCode || 401).json({ error: authErr.message })
    return
  }

  try {
    const trainee = await prisma.trainee.findUnique({
      where: { githubId: caller.githubId },
    })

    if (!trainee) {
      res.json({ traineeId: null, consent: {} })
      return
    }

    const consent = await resolveCurrentConsent(trainee.id, prisma)
    res.json({ traineeId: trainee.id, trainee, consent })
  } catch (err) {
    console.error('[consent GET] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to retrieve consent state' })
  }
})

// ── GET /api/consent/:traineeId ───────────────────────────────────────────────
// Returns the current (most-recent per scope) consent state for a given trainee.
// This endpoint is intentionally unauthenticated — employer/government verification
// portals will call it with just the traineeId.  Scope values reflect live DB state.
router.get('/consent/:traineeId', async (req, res) => {
  const { traineeId } = req.params

  if (!traineeId || traineeId.trim() === '') {
    res.status(400).json({ error: 'Missing traineeId parameter' })
    return
  }

  try {
    // Verify the trainee exists
    const trainee = await prisma.trainee.findUnique({
      where: { id: traineeId },
      select: { id: true, name: true, preferredLanguage: true },
    })

    if (!trainee) {
      res.status(404).json({ error: `No trainee found with id: ${traineeId}` })
      return
    }

    // Resolve current (latest-per-scope) consent state
    const consent = await resolveCurrentConsent(traineeId, prisma)

    res.json({ traineeId, trainee, consent })
  } catch (err) {
    console.error('[consent/:traineeId GET] error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to retrieve consent state' })
  }
})

export default router
