/**
 * FILE: server/utils/adminAuth.js
 * PURPOSE: RBAC middleware and audit logging for admin-gated routes.
 *
 * Exports:
 *   requireAdmin(minRole)      — Express middleware; resolves GitHub identity,
 *                                looks up AdminUser, checks role hierarchy.
 *   logAdminAction(...)        — Inserts one AdminActionLog row. Call from every
 *                                admin-gated write in this and future tasks.
 *
 * Role hierarchy (highest → lowest):
 *   SUPER_ADMIN > REVIEWER > ANALYST
 *
 * Usage:
 *   import { requireAdmin, logAdminAction } from '../utils/adminAuth.js'
 *   router.post('/admin/foo', requireAdmin('ANALYST'), async (req, res) => {
 *     // req.adminUser is the AdminUser record
 *     await logAdminAction(req.adminUser.id, 'FOO', 'Target', targetId, { ... })
 *     ...
 *   })
 *
 * DEPENDENCIES: server/utils/auth, server/lib/prisma
 * USED BY: server/routes/admin.js, server/routes/outcomes.js
 */

import prisma from '../lib/prisma.js'
import { resolveGithubIdentity } from './auth.js'

// ── Role Hierarchy ────────────────────────────────────────────────────────────
// Higher index = higher privilege. A user meets minRole if their role index >= minRole index.
const ROLE_ORDER = ['ANALYST', 'REVIEWER', 'SUPER_ADMIN']

const VALID_ROLES = new Set(ROLE_ORDER)

/**
 * Returns the numeric rank of a role string (higher = more privileged).
 * Unknown roles return -1 (always fails any check).
 */
function roleRank(role) {
  const idx = ROLE_ORDER.indexOf(role)
  return idx // -1 for unknown
}

// ── requireAdmin(minRole) — Express Middleware ────────────────────────────────

/**
 * Express middleware that enforces admin access with a minimum role requirement.
 *
 * On success: attaches `req.adminUser` (the AdminUser DB record) and calls next().
 * On failure: responds with 401 (no/bad token), 403 (not admin or insufficient role).
 *
 * @param {'ANALYST' | 'REVIEWER' | 'SUPER_ADMIN'} minRole - minimum role required
 * @returns {import('express').RequestHandler}
 */
export function requireAdmin(minRole) {
  if (!VALID_ROLES.has(minRole)) {
    throw new Error(`[requireAdmin] Invalid minRole: "${minRole}". Must be one of: ${ROLE_ORDER.join(', ')}`)
  }

  return async function adminAuthMiddleware(req, res, next) {
    // 1. Resolve GitHub identity from Bearer token (reuses existing auth utility)
    let caller
    try {
      caller = await resolveGithubIdentity(req)
    } catch (authErr) {
      res.status(authErr.statusCode || 401).json({ error: authErr.message })
      return
    }

    // 2. Look up AdminUser by GitHub login
    let adminUser
    try {
      adminUser = await prisma.adminUser.findUnique({
        where: { githubUsername: caller.login },
      })
    } catch (dbErr) {
      console.error('[requireAdmin] DB lookup error:', dbErr)
      res.status(500).json({ error: 'Admin authorization check failed' })
      return
    }

    // 3. Not in the AdminUser table → 403
    if (!adminUser) {
      res.status(403).json({
        error: `Forbidden: "${caller.login}" is not a registered admin. Contact a SUPER_ADMIN.`,
      })
      return
    }

    // 4. Check role meets minimum requirement
    if (roleRank(adminUser.role) < roleRank(minRole)) {
      res.status(403).json({
        error: `Forbidden: this action requires the "${minRole}" role or higher. Your role: "${adminUser.role}".`,
      })
      return
    }

    // 5. All checks passed — attach the admin record and continue
    req.adminUser = adminUser
    next()
  }
}

// ── logAdminAction — Audit Trail Helper ───────────────────────────────────────

/**
 * Inserts one AdminActionLog row. Call this from every admin-gated write.
 * Non-blocking — errors are caught and logged to console but do NOT propagate
 * (the primary action should not fail due to a logging error).
 *
 * @param {string} adminUserId    - AdminUser.id of the acting admin
 * @param {string} action         - Action label, e.g. "MERGE_TRAINEE", "REJECT_CANDIDATE"
 * @param {string} targetType     - Type of the affected record, e.g. "DedupCandidate"
 * @param {string} targetId       - id of the affected record
 * @param {object} details        - Arbitrary object; will be JSON.stringified
 * @returns {Promise<void>}
 */
export async function logAdminAction(adminUserId, action, targetType, targetId, details) {
  try {
    await prisma.adminActionLog.create({
      data: {
        adminUserId,
        action: String(action),
        targetType: String(targetType),
        targetId: String(targetId),
        details: JSON.stringify(details ?? {}),
      },
    })
  } catch (err) {
    // Logging must not break the primary operation
    console.error(`[logAdminAction] Failed to write audit log for action "${action}" on ${targetType}/${targetId}:`, err)
  }
}
