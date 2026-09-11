/**
 * FILE: server/config.js
 * PURPOSE: Centralized configuration — environment variables, API keys, model lists.
 * DEPENDENCIES: dotenv
 * USED BY: All route and service modules
 */

import dotenv from 'dotenv'

dotenv.config()

export const PORT = process.env.PORT || 8787

// ── GitHub OAuth ──────────────────────────────────────────────────────────────
export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''

// ── LinkedIn OAuth ────────────────────────────────────────────────────────────
export const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || ''
export const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || ''
export const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || ''

// ── AI Service Keys ───────────────────────────────────────────────────────────
export const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || ''
export const DEFAULT_SARVAM_KEY = process.env.SARVAM_API_KEY || ''
export const DEFAULT_RESUME_STRUCTURER_KEY = process.env.RESUME_STRUCTURER_KEY || ''
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY
export const SERPER_API_KEY = process.env.SERPER_API_KEY || ''

export const SARVAM_MODEL = process.env.SARVAM_MODEL || 'sarvam-105b'

// ── Gemini Model Candidates (tried in order) ──────────────────────────────────
export const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  'gemini-3.6-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
]
