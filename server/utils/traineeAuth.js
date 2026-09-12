/**
 * FILE: server/utils/traineeAuth.js
 * PURPOSE: Issues and validates durable trainee session tokens based on phone + OTP.
 *          Completely independent of GitHub OAuth.
 *
 * TOKEN FORMAT (base64-encoded, colon-delimited):
 *   phoneNumber : traineeId (or "unbound") : issuedAt : expiry : signature
 *
 * The token is HMAC-SHA256 signed with SESSION_SECRET.  traineeId is "unbound"
 * until the trainee has created a profile (so consent can be collected first),
 * and is upgraded to the real Trainee.id once the profile is created.
 *
 * DEPENDENCIES: crypto, server/lib/prisma
 * USED BY: server/routes/otpAuth.js (issue), all trainee-facing routes (resolve)
 */

import crypto from 'crypto'
import prisma from '../lib/prisma.js'

// Prefer a dedicated env var; fall back to existing secret; final fallback for dev.
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.GITHUB_CLIENT_SECRET ||
  'forge_trainee_session_dev_secret_32b'

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
}

/**
 * Issues a durable trainee session token after OTP verification.
 *
 * @param {string} phoneNumber - Verified phone number.
 * @param {string|null} [traineeId] - Trainee.id if already known; "unbound" otherwise.
 * @returns {string} Base64-encoded signed session token.
 */
export function issueTraineeSessionToken(phoneNumber, traineeId = null) {
  const id = traineeId || 'unbound'
  const issuedAt = Date.now()
  const expiry = issuedAt + SESSION_EXPIRY_MS
  const payload = `${phoneNumber}:${id}:${issuedAt}:${expiry}`
  const sig = sign(payload)
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

/**
 * Validates a trainee session token.
 *
 * @param {string} tokenB64 - base64url-encoded session token from Authorization header.
 * @returns {{ phoneNumber: string, traineeId: string|null } | null} Caller identity, or null if invalid/expired.
 */
export function validateTraineeSessionToken(tokenB64) {
  try {
    if (!tokenB64) return null
    const raw = Buffer.from(tokenB64, 'base64url').toString('utf-8')
    // Format: phone:id:issuedAt:expiry:signature
    const lastColon = raw.lastIndexOf(':')
    const payload = raw.slice(0, lastColon)
    const sig = raw.slice(lastColon + 1)

    const expectedSig = sign(payload)
    if (sig !== expectedSig) return null

    const parts = payload.split(':')
    if (parts.length < 4) return null

    // Last two are issuedAt and expiry; everything before is phone:id (id may contain no colons)
    const expiry = parseInt(parts[parts.length - 1], 10)
    // issuedAt = parts[parts.length - 2]
    const traineeIdRaw = parts[parts.length - 3]
    const phoneNumber = parts.slice(0, parts.length - 3).join(':')

    if (!phoneNumber || isNaN(expiry)) return null
    if (Date.now() > expiry) return null

    return {
      phoneNumber,
      traineeId: traineeIdRaw === 'unbound' ? null : traineeIdRaw,
    }
  } catch {
    return null
  }
}

/**
 * Express middleware helper: reads the Authorization: Bearer <token> header,
 * validates it as a trainee session token, and resolves the Trainee record.
 *
 * Returns { phoneNumber, traineeId, trainee } where trainee may be null if
 * the profile hasn't been created yet (consent-only step).
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ phoneNumber: string, traineeId: string|null, trainee: object|null }>}
 * @throws {Error} with .statusCode for the caller to convert to an HTTP response.
 */
export async function resolveTraineeIdentity(req) {
  const auth = String(req.headers.authorization || '').trim()
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!token) {
    const err = new Error(
      'Missing or malformed Authorization header. Expected: Bearer <trainee_session_token>'
    )
    err.statusCode = 401
    throw err
  }

  const identity = validateTraineeSessionToken(token)
  if (!identity) {
    const err = new Error(
      'Invalid or expired trainee session token. Please re-verify your phone number.'
    )
    err.statusCode = 401
    throw err
  }

  const { phoneNumber, traineeId } = identity

  // If the token already has a bound traineeId, trust it (signature already verified).
  if (traineeId) {
    try {
      const trainee = await prisma.trainee.findUnique({ where: { id: traineeId } })
      if (!trainee) {
        const err = new Error('Trainee record not found. Profile may have been removed.')
        err.statusCode = 404
        throw err
      }
      return { phoneNumber, traineeId, trainee }
    } catch (dbErr) {
      if (dbErr.statusCode) throw dbErr
      const err = new Error('Failed to resolve trainee identity from database.')
      err.statusCode = 500
      throw err
    }
  }

  // Unbound token — phone verified but no profile yet.
  // Look up trainee by phone in case profile was created under a different token.
  const trainee = await prisma.trainee.findUnique({ where: { phoneNumber } }).catch(() => null)

  return {
    phoneNumber,
    traineeId: trainee?.id || null,
    trainee: trainee || null,
  }
}
