/**
 * FILE: server/routes/github.js
 * PURPOSE: GitHub OAuth flow and repository data endpoints.
 * DEPENDENCIES: config
 * USED BY: server/index.js
 */

import { Router } from 'express'
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from '../config.js'
import { requireEnv } from '../utils/errors.js'

const router = Router()

router.get('/github/oauth/start', (req, res) => {
  if (!requireEnv('GITHUB_CLIENT_ID', GITHUB_CLIENT_ID, res)) return

  const redirectUri = process.env.GITHUB_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/github/oauth/callback`
  const state = Math.random().toString(36).slice(2)
  res.cookie('github_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 10 * 60 * 1000 })

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', GITHUB_CLIENT_ID)
  url.searchParams.set('scope', 'repo read:user')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)

  res.redirect(url.toString())
})

router.get('/github/oauth/callback', async (req, res) => {
  if (!requireEnv('GITHUB_CLIENT_ID', GITHUB_CLIENT_ID, res)) return
  if (!requireEnv('GITHUB_CLIENT_SECRET', GITHUB_CLIENT_SECRET, res)) return

  const { code, state } = req.query
  if (!code) {
    res.status(400).send('Missing OAuth code')
    return
  }

  const expectedState = req.cookies.github_oauth_state
  if (!state || !expectedState || String(state) !== String(expectedState)) {
    res.status(400).send('Invalid OAuth state')
    return
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok || tokenJson.error || !tokenJson.access_token) {
    res.status(500).send('OAuth token exchange failed')
    return
  }

  const appReturn = process.env.APP_RETURN_URL || 'http://localhost:3000/'
  const next = new URL(appReturn)
  next.searchParams.set('github_token', tokenJson.access_token)
  res.clearCookie('github_oauth_state')
  res.redirect(next.toString())
})

export default router
