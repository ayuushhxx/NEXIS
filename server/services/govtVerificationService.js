/**
 * FILE: server/services/govtVerificationService.js
 * PURPOSE: Provider-agnostic service for corroborating trainee outcomes against
 *          national government registries (e-Shram for informal workers, UDYAM for micro-enterprises).
 *
 * IMPORTANT ARCHITECTURAL & ETHICAL NOTE:
 * Registry cross-checks represent a supportive corroboration signal, NOT verified ground-truth.
 * e-Shram only records self-registered informal workers, and UDYAM only records registered MSMEs.
 * Neither guarantees active employer-employee placement or verified wage earnings.
 *
 * SWAPPABLE PROVIDER PATTERN:
 * In production, this service will connect to official MoLE (Ministry of Labour & Employment)
 * and Ministry of MSME API gateways once credentials and data-sharing agreements are established.
 * Currently, a deterministic mock provider is active to ensure demo repeatability without relying
 * on live government servers.
 */

import crypto from 'crypto'

/**
 * Deterministically hashes a string + salt to an integer between 0 and 9999.
 * This guarantees that the exact same trainee phone number produces the exact same
 * match determination on every run, while remaining varied across different trainees.
 */
function getDeterministicHashValue(input, salt = '') {
  const hash = crypto.createHash('sha256').update(String(input || '') + salt).digest('hex')
  return parseInt(hash.slice(0, 8), 16) % 10000
}

// ── Mock Provider Implementation ─────────────────────────────────────────────
// Placeholder implementation pending official MoLE / Ministry of MSME API credentials.
const mockProvider = {
  name: 'mock-registry-stub',

  /**
   * Mock check against the e-Shram National Database of Unorganised Workers.
   * Target match rate: ~36% (deterministic per phone number)
   */
  async checkEShram(trainee) {
    const phone = trainee?.phoneNumber || ''
    const hashVal = getDeterministicHashValue(phone, 'ESHRAM_REGISTRY_SALT')
    const matchFound = hashVal % 100 < 36 // ~36% match rate

    if (matchFound) {
      // Deterministic confidence between 0.74 and 0.92
      const confidence = 0.74 + ((hashVal % 18) / 100)
      const primaryTrade = trainee?.enrolments?.[0]?.courseName || 'vocational sector'
      return {
        matchFound: true,
        matchConfidence: parseFloat(confidence.toFixed(2)),
        summary: `Active e-Shram unorganised worker record found under primary mobile; trade classification corresponds to ${primaryTrade}.`,
      }
    }

    return {
      matchFound: false,
      matchConfidence: null,
      summary: 'No active informal worker registration found under registered phone number in e-Shram registry.',
    }
  },

  /**
   * Mock check against the UDYAM MSME Enterprise Registration Portal.
   * Target match rate: ~28% (deterministic per phone number)
   */
  async checkUdyam(trainee) {
    const phone = trainee?.phoneNumber || ''
    const hashVal = getDeterministicHashValue(phone, 'UDYAM_REGISTRY_SALT')
    const matchFound = hashVal % 100 < 28 // ~28% match rate

    if (matchFound) {
      // Deterministic confidence between 0.70 and 0.88
      const confidence = 0.70 + ((hashVal % 18) / 100)
      return {
        matchFound: true,
        matchConfidence: parseFloat(confidence.toFixed(2)),
        summary: 'Micro-enterprise registration certificate linked to registered phone number in manufacturing/services category.',
      }
    }

    return {
      matchFound: false,
      matchConfidence: null,
      summary: 'No registered MSME or UDYAM enterprise certificate found linked to registered phone number.',
    }
  },
}

// ── Active Provider ──────────────────────────────────────────────────────────
// Swappable provider instance. Swap to live production provider when official MoLE/MSME API keys are configured.
const activeProvider = mockProvider

// ── Public Interface ─────────────────────────────────────────────────────────

/**
 * Checks a trainee against the e-Shram national database of unorganised workers.
 *
 * @param {object} trainee - Prisma Trainee record with optional enrolments
 * @returns {Promise<{ matchFound: boolean, matchConfidence: number|null, summary: string }>}
 */
export async function checkEShram(trainee) {
  return activeProvider.checkEShram(trainee)
}

/**
 * Checks a trainee against the UDYAM MSME business registration portal.
 *
 * @param {object} trainee - Prisma Trainee record
 * @returns {Promise<{ matchFound: boolean, matchConfidence: number|null, summary: string }>}
 */
export async function checkUdyam(trainee) {
  return activeProvider.checkUdyam(trainee)
}
