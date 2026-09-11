/**
 * FILE: server/utils/consent.js
 * PURPOSE: Resolves "current" consent state for a trainee from the append-only ConsentRecord log.
 *          Because we store one new row per grant/revoke event, "current" = latest row per scope.
 * DEPENDENCIES: None (accepts prisma client as argument for testability)
 * USED BY: server/routes/trainee.js, server/routes/consent.js
 */

/**
 * All consent scopes recognised by the system.
 * Centralised here so trainee.js and consent.js both import from one source of truth.
 */
export const ALLOWED_SCOPES = Object.freeze([
  'JOB_SEARCH_DATA',
  'EMPLOYER_SHARING',
  'ANALYTICS',
  'GOVT_CROSS_CHECK',
])

/**
 * Resolves the most-recent ConsentRecord per scope for a given traineeId.
 * Returns a plain object keyed by scope with the current state, or an empty
 * object if the trainee has never submitted any consent.
 *
 * @param {string} traineeId
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<Record<string, { granted: boolean, grantedAt: Date, revokedAt: Date|null, version: string }>>}
 */
export async function resolveCurrentConsent(traineeId, prisma) {
  // Fetch all consent rows for this trainee, newest-first
  const rows = await prisma.consentRecord.findMany({
    where: { traineeId },
    orderBy: { createdAt: 'desc' },
  })

  // Keep only the first (latest) row encountered per scope — that is "current"
  const seen = new Set()
  const consent = {}

  for (const row of rows) {
    if (seen.has(row.scope)) continue
    seen.add(row.scope)
    consent[row.scope] = {
      granted: row.granted,
      grantedAt: row.grantedAt,
      revokedAt: row.revokedAt,
      version: row.version,
    }
  }

  return consent
}
