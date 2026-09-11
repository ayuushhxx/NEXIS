/**
 * FILE: server/routes/linkedinAuth.js
 * PURPOSE: LinkedIn OpenID Connect (OIDC) flow and PDF profile import endpoints.
 * DEPENDENCIES: config, multer, pdf-parse, services/gemini
 * USED BY: server/index.js
 */

import { Router } from 'express'
import { PDFParse } from 'pdf-parse'
import prisma from '../lib/prisma.js'
import { upload } from '../middleware/upload.js'
import { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, GEMINI_API_KEY } from '../config.js'
import { requireEnv } from '../utils/errors.js'
import { callGeminiTextWithRetry } from '../services/gemini.js'

const router = Router()

router.get('/linkedin/oauth/start', (req, res) => {
  if (!requireEnv('LINKEDIN_CLIENT_ID', LINKEDIN_CLIENT_ID, res)) return

  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/linkedin/oauth/callback`
  const state = Math.random().toString(36).slice(2)
  const traineeId = req.query.traineeId || ''
  
  res.cookie('linkedin_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 10 * 60 * 1000 })
  if (traineeId) {
    res.cookie('linkedin_oauth_trainee_id', traineeId, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 10 * 60 * 1000 })
  }

  const url = new URL('https://www.linkedin.com/oauth/v2/authorization')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', LINKEDIN_CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'openid profile email')

  res.redirect(url.toString())
})

router.get('/linkedin/oauth/callback', async (req, res) => {
  if (!requireEnv('LINKEDIN_CLIENT_ID', LINKEDIN_CLIENT_ID, res)) return
  if (!requireEnv('LINKEDIN_CLIENT_SECRET', LINKEDIN_CLIENT_SECRET, res)) return

  const { code, state, error, error_description } = req.query

  const appReturn = process.env.APP_RETURN_URL || 'http://localhost:3000/'
  const next = new URL(appReturn)

  if (error) {
    console.error('[linkedin/oauth/callback] Error from LinkedIn:', error, error_description)
    next.searchParams.set('linkedin_error', String(error_description || error))
    return res.redirect(next.toString())
  }

  if (!code) {
    res.status(400).send('Missing OAuth code')
    return
  }

  const expectedState = req.cookies.linkedin_oauth_state
  if (!state || !expectedState || String(state) !== String(expectedState)) {
    res.status(400).send('Invalid OAuth state')
    return
  }

  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/linkedin/oauth/callback`

  try {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    })

    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error('[linkedin/oauth/callback] Token exchange failed:', tokenJson)
      next.searchParams.set('linkedin_error', 'Token exchange failed')
      return res.redirect(next.toString())
    }

    const accessToken = tokenJson.access_token

    // Fetch user info using OpenID Connect endpoint
    const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    
    if (userRes.ok) {
      const userInfo = await userRes.json()
      const linkedinId = userInfo.sub // 'sub' is the unique identifier in OIDC
      
      const traineeId = req.cookies.linkedin_oauth_trainee_id
      if (traineeId && linkedinId) {
        // Update Trainee record
        await prisma.trainee.update({
          where: { id: traineeId },
          data: {
            linkedinId: String(linkedinId),
            linkedinVerified: true,
          },
        }).catch(err => {
          console.error('[linkedin/oauth/callback] Failed to update Trainee with linkedinId:', err)
        })
      }
    } else {
      console.error('[linkedin/oauth/callback] Failed to fetch userinfo:', await userRes.text())
    }

    next.searchParams.set('linkedin_token', accessToken)
    res.clearCookie('linkedin_oauth_state')
    res.clearCookie('linkedin_oauth_trainee_id')
    res.redirect(next.toString())
  } catch (err) {
    console.error('[linkedin/oauth/callback] Exception:', err)
    next.searchParams.set('linkedin_error', 'Internal server error')
    res.redirect(next.toString())
  }
})

router.post('/linkedin/import-profile-pdf', upload.single('profilePdf'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Missing profile PDF file' })
    return
  }

  const userGeminiKey = req.body?.keys?.gemini
  const runtimeGeminiKey = userGeminiKey || GEMINI_API_KEY
  if (!requireEnv('GEMINI_API_KEY', runtimeGeminiKey, res)) return

  try {
    const parser = new PDFParse({ data: req.file.buffer })
    const textResult = await parser.getText()
    await parser.destroy()
    const text = (textResult.text || '').trim()
    
    if (!text) {
      res.status(422).json({ error: 'Unable to extract text from LinkedIn profile PDF' })
      return
    }

    // Extract experience and generate bullets
    const prompt = `Based on this LinkedIn profile export, generate 3 high-impact, quantified resume bullet points using Action Verbs. Focus on work experience, projects, and achievements. Return ONLY the bullet points, each on a new line starting with a bullet character (-).\n\nProfile Data:\n${text.substring(0, 8000)}`

    const response = await callGeminiTextWithRetry({
      apiKey: runtimeGeminiKey,
      prompt,
      systemInstruction: 'You are Nexus-Writer. Extract key professional achievements from LinkedIn profiles and rewrite them into powerful, quantified resume bullets.',
    })

    const bullets = response ? response.split('\n').map(b => b.trim().replace(/^- /, '')).filter(Boolean) : []
    
    if (bullets.length === 0) {
      bullets.push('Spearheaded key initiatives yielding measurable business outcomes.')
      bullets.push('Collaborated with cross-functional teams to deliver critical projects on time.')
    }

    res.json({
      success: true,
      bullets,
      extractedTextLength: text.length,
    })
  } catch (err) {
    console.error('[linkedin/import-profile-pdf] Error parsing PDF or generating bullets:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process LinkedIn PDF' })
  }
})

export default router
