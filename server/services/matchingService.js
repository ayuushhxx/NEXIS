/**
 * FILE: server/services/matchingService.js
 * PURPOSE: Trainee deduplication — similarity scoring and DedupCandidate creation.
 *
 * Algorithm: Jaro-Winkler similarity (chosen over Levenshtein because it performs
 * better on short name strings, particularly Indian given names where a small prefix
 * difference — e.g. "Rahul" vs "Raghul" — should not dominate the score). An inline
 * ~35-line implementation is used here to avoid adding an npm dependency.
 *
 * Signal weights (must sum to 1.0):
 *   name similarity (Jaro-Winkler):  0.35
 *   phone last-6-digit match:         0.25
 *   dateOfBirth exact match:          0.20
 *   district exact match:             0.10
 *   aadhaarLast4Hash exact match:     0.10
 *
 * A DedupCandidate row is created only when the weighted score > 0.6.
 * Pairs already flagged in any status (PENDING / CONFIRMED_MERGE / REJECTED)
 * are skipped — this function is safe to call repeatedly.
 *
 * DEPENDENCIES: server/lib/prisma
 * USED BY: server/routes/admin.js
 */

import prisma from '../lib/prisma.js'

// ── Jaro-Winkler Implementation ───────────────────────────────────────────────
// Self-contained, no external dependency.

/**
 * Computes the Jaro similarity between two strings.
 * Returns a value in [0.0, 1.0].
 */
function jaroSimilarity(s1, s2) {
  if (s1 === s2) return 1.0
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0.0

  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)

  let matches = 0
  let transpositions = 0

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  )
}

/**
 * Computes the Jaro-Winkler similarity between two strings.
 * Applies a prefix bonus (p=0.1, max 4 chars) to the Jaro score.
 * Returns a value in [0.0, 1.0].
 */
function jaroWinkler(a, b) {
  // Normalize: lowercase + collapse whitespace
  const s1 = String(a || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const s2 = String(b || '').toLowerCase().trim().replace(/\s+/g, ' ')
  if (!s1 || !s2) return 0.0

  const jaro = jaroSimilarity(s1, s2)

  // Prefix bonus
  let prefixLen = 0
  const maxPrefix = Math.min(4, s1.length, s2.length)
  while (prefixLen < maxPrefix && s1[prefixLen] === s2[prefixLen]) prefixLen++

  return jaro + prefixLen * 0.1 * (1 - jaro)
}

// ── Signal Weights ────────────────────────────────────────────────────────────
// These weights define how much each matching signal contributes to the overall
// score. They must sum to 1.0. Adjust here if real-world data shows a signal is
// too noisy or too sparse.
const WEIGHTS = {
  name: 0.35,          // Jaro-Winkler similarity on full name
  phoneLast6: 0.20,    // exact match on last 6 digits of phone number
  dateOfBirth: 0.25,   // exact match on date of birth (YYYY-MM-DD)
  district: 0.10,      // exact match on district (case-insensitive)
  aadhaarLast4: 0.10,  // exact match on aadhaarLast4Hash (both must be present)
}

// ── Score Threshold ───────────────────────────────────────────────────────────
const SCORE_THRESHOLD = 0.6

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the last N digits of a phone number string (digits only). */
function phoneLast6(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  return digits.length >= 6 ? digits.slice(-6) : null
}

/** Returns YYYY-MM-DD string for a date, or null. */
function toDateStr(d) {
  if (!d) return null
  try {
    return new Date(d).toISOString().split('T')[0]
  } catch {
    return null
  }
}

// ── findPotentialDuplicates ───────────────────────────────────────────────────

/**
 * Compares every non-merged Trainee pair, creates DedupCandidate rows for pairs
 * with a weighted similarity score above SCORE_THRESHOLD, and skips pairs already
 * flagged in any status.
 *
 * Safe to call repeatedly — existing flagged pairs are always skipped.
 *
 * @returns {Promise<{ scanned: number, created: number, skipped: number }>}
 */
export async function findPotentialDuplicates() {
  // 1. Fetch all active (non-merged) trainees
  const trainees = await prisma.trainee.findMany({
    where: { mergedIntoId: null },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      dateOfBirth: true,
      district: true,
      aadhaarLast4Hash: true,
    },
  })

  // 2. Fetch all already-flagged pairs as a Set of canonical keys "idA:idB"
  const existingCandidates = await prisma.dedupCandidate.findMany({
    select: { traineeIdA: true, traineeIdB: true },
  })
  const flaggedPairs = new Set(
    existingCandidates.map((c) => `${c.traineeIdA}:${c.traineeIdB}`)
  )

  let created = 0
  let skipped = 0
  let scanned = 0

  // 3. Compare every unique pair (O(n²) — acceptable for the dataset sizes
  //    expected in this system; can be replaced with blocking/partitioning later)
  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      const tA = trainees[i]
      const tB = trainees[j]
      scanned++

      // Canonical key: lexicographically smaller id first (matches DB @@unique constraint)
      const [idA, idB] = tA.id < tB.id ? [tA.id, tB.id] : [tB.id, tA.id]
      const pairKey = `${idA}:${idB}`

      if (flaggedPairs.has(pairKey)) {
        skipped++
        continue
      }

      // ── Compute per-signal scores and reasons ──────────────────────────────
      const reasons = []
      
      // Determine which signals are available
      const phoneA = phoneLast6(tA.phoneNumber)
      const phoneB = phoneLast6(tB.phoneNumber)
      const hasPhone = !!(phoneA && phoneB)

      const dobA = toDateStr(tA.dateOfBirth)
      const dobB = toDateStr(tB.dateOfBirth)
      const hasDob = !!(dobA && dobB)

      const districtA = tA.district ? tA.district.toLowerCase().trim() : null
      const districtB = tB.district ? tB.district.toLowerCase().trim() : null
      const hasDistrict = !!(districtA && districtB)

      const hasAadhaar = !!(tA.aadhaarLast4Hash && tB.aadhaarLast4Hash)

      // Calculate total available weight
      let totalAvailableWeight = WEIGHTS.name
      if (hasPhone) totalAvailableWeight += WEIGHTS.phoneLast6
      if (hasDob) totalAvailableWeight += WEIGHTS.dateOfBirth
      if (hasDistrict) totalAvailableWeight += WEIGHTS.district
      if (hasAadhaar) totalAvailableWeight += WEIGHTS.aadhaarLast4

      // We redistribute the weight proportionally by dividing each signal's
      // nominal weight by the total available weight. This ensures we don't
      // artificially lower the score just because data is missing.
      let score = 0

      // Name — Jaro-Winkler similarity
      const nameSim = jaroWinkler(tA.name, tB.name)
      const nameActualWeight = WEIGHTS.name / totalAvailableWeight
      score += nameSim * nameActualWeight
      if (nameSim > 0.7) {
        reasons.push(`name_similarity:${nameSim.toFixed(3)}`)
      }

      // Phone — last 6 digits
      if (hasPhone) {
        const phoneActualWeight = WEIGHTS.phoneLast6 / totalAvailableWeight
        if (phoneA === phoneB) {
          score += phoneActualWeight
          reasons.push(`phone_last6_match:${phoneA}`)
        }
      }

      // Date of birth — exact match
      if (hasDob) {
        const dobActualWeight = WEIGHTS.dateOfBirth / totalAvailableWeight
        if (dobA === dobB) {
          score += dobActualWeight
          reasons.push(`dob_exact_match:${dobA}`)
        }
      }

      // District — exact match (case-insensitive)
      if (hasDistrict) {
        const districtActualWeight = WEIGHTS.district / totalAvailableWeight
        if (districtA === districtB) {
          score += districtActualWeight
          reasons.push(`district_exact_match:${tA.district.trim()}`)
        }
      }

      // AadhaarLast4Hash — exact match
      if (hasAadhaar) {
        const aadhaarActualWeight = WEIGHTS.aadhaarLast4 / totalAvailableWeight
        if (tA.aadhaarLast4Hash === tB.aadhaarLast4Hash) {
          score += aadhaarActualWeight
          reasons.push('aadhaar_last4_hash_match')
        }
      }

      // ── Create DedupCandidate if score exceeds threshold ──────────────────
      if (score > SCORE_THRESHOLD) {
        try {
          await prisma.dedupCandidate.create({
            data: {
              traineeIdA: idA,
              traineeIdB: idB,
              matchScore: Math.min(score, 1.0), // cap at 1.0
              matchReasons: JSON.stringify(reasons),
              status: 'PENDING',
            },
          })
          flaggedPairs.add(pairKey) // update local cache to prevent duplicates in same run
          created++
        } catch (err) {
          // P2002 = unique constraint — pair was created concurrently; skip gracefully
          if (err?.code !== 'P2002') {
            console.error(`[matchingService] Error creating DedupCandidate for ${pairKey}:`, err)
          } else {
            skipped++
          }
        }
      }
    }
  }

  return { scanned, created, skipped }
}
