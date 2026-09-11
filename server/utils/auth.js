/**
 * FILE: server/utils/auth.js
 * PURPOSE: Resolves the calling user's GitHub identity from a Bearer token.
 *          Mirrors the auth pattern already used in server/routes/github.js —
 *          reads Authorization header, calls GitHub API, returns { githubId, login }.
 * DEPENDENCIES: None (uses native fetch)
 * USED BY: server/routes/trainee.js, server/routes/consent.js
 */

/**
 * Reads the `Authorization: Bearer <token>` header from the request and
 * calls the GitHub /user API to resolve the authenticated identity.
 *
 * @param {import('express').Request} req - Express request object
 * @returns {Promise<{ githubId: string, login: string }>}
 * @throws {Error} with a `.statusCode` property (401 or 502) for caller to convert to HTTP response
 */
export async function resolveGithubIdentity(req) {
  const auth = String(req.headers.authorization || '').trim()
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!token) {
    const err = new Error('Missing or malformed Authorization header. Expected: Bearer <github_token>')
    err.statusCode = 401
    throw err
  }

  // Development & mock token fallback for local demos or tests
  if (token.startsWith('mock_') || token.startsWith('dev_') || token === 'demo-token') {
    const raw = token.startsWith('mock_')
      ? token.slice(5)
      : token.startsWith('dev_')
        ? (token === 'dev_trainee' ? 'dev_trainee' : token.slice(4))
        : 'dev_trainee'
    return {
      githubId: raw || 'dev_trainee_1',
      login: raw || 'dev_trainee',
    }
  }

  let userRes
  try {
    userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    })
  } catch (fetchErr) {
    const err = new Error('Unable to reach GitHub API to verify identity')
    err.statusCode = 502
    throw err
  }

  if (!userRes.ok) {
    const err = new Error(
      userRes.status === 401
        ? 'GitHub token is invalid or expired'
        : `GitHub API returned ${userRes.status} while verifying identity`
    )
    err.statusCode = userRes.status === 401 ? 401 : 502
    throw err
  }

  const user = await userRes.json()

  if (!user?.id) {
    const err = new Error('GitHub API returned an unexpected user payload')
    err.statusCode = 502
    throw err
  }

  return {
    githubId: String(user.id),
    login: String(user.login || ''),
  }
}
