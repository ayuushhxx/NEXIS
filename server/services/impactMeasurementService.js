/**
 * FILE: server/services/impactMeasurementService.js
 * PURPOSE: Simplified stratified impact estimation comparing vocational trainees
 *          against a synthetic illustrative control group (ControlGroupRecord).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT FRAMING — READ BEFORE USING OR CITING THIS MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * computeImpact() does NOT produce a validated causal estimate.
 *
 * The comparison population (ControlGroupRecord) is SYNTHETIC DATA generated
 * by a deterministic seeded pseudo-random function in seedControlGroup.js.
 * It does NOT represent real people who did not attend vocational training.
 * No randomized controlled trial has been conducted.
 *
 * The methodology used here is SIMPLIFIED STRATIFIED MATCHING:
 *   - Bucket trainees and control records by (ageBand, district, priorQualification).
 *   - Compute employment rate within each bucket for both groups.
 *   - Subtract control rate from trainee rate to get a bucket-level "uplift".
 *   - Compute a trainee-count-weighted average of bucket uplifts.
 *
 * Full statistical propensity score modeling (logistic regression, nearest-
 * neighbor matching, inverse probability weighting, etc.) is intentionally
 * NOT implemented. Doing so on synthetic demo data would falsely imply
 * statistical rigor that the data cannot support.
 *
 * EVERY response from this module includes the FIXED_DISCLAIMER string
 * verbatim. It must never be suppressed or truncated.
 *
 * What would be needed to use this with real data:
 *   - Replace the seedControlGroup.js seed function with an import from a real
 *     non-trainee population dataset (e.g. NSSO/PLFS micro-data).
 *   - Set isSynthetic = false on imported rows.
 *   - The matching logic in computeImpact() requires NO changes — only the
 *     data source changes. The schema accommodates this via isSynthetic.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DEPENDENCIES: server/lib/prisma.js
 * EXPORTS: getAgeBand(dateOfBirth), computeImpact()
 * USED BY: server/routes/analytics.js, server/scripts/seedControlGroup.js
 */

import prisma from '../lib/prisma.js'

/**
 * Fixed disclaimer string included verbatim in every computeImpact() response.
 * Must never be suppressed, collapsed, or altered.
 */
export const IMPACT_DISCLAIMER =
  'Estimated using stratified comparison against a synthetic illustrative control group, not a randomized controlled trial or real non-trainee population. Intended to demonstrate methodology, not to represent a validated causal effect.'

/**
 * Fixed methodology description string.
 */
const METHODOLOGY_DESCRIPTION =
  'Simplified stratified matching: trainees and synthetic control records are grouped into ' +
  'strata by (ageBand, home district, priorQualification). Within each stratum, employment ' +
  'rates (EMPLOYED + SELF_EMPLOYED) are computed for both groups and the difference (trainee ' +
  'minus control) is taken. The headline uplift is a trainee-count-weighted average of stratum ' +
  'differences. Strata with fewer than 3 trainees or fewer than 3 control records are skipped ' +
  'to avoid spurious estimates from very small samples.'

/**
 * AGE BUCKETING FUNCTION — single definition used by both this service and
 * seedControlGroup.js (which imports it).  If the bucket boundaries ever change,
 * update here only; the seed script will automatically pick up the new logic on
 * the next re-seed.
 *
 * Buckets:
 *   18-25  →  age in [18, 25]
 *   26-35  →  age in [26, 35]
 *   36-45  →  age in [36, 45]
 *   46+    →  age >= 46
 *   unknown → dateOfBirth is null / invalid
 *
 * @param {Date|string|null} dateOfBirth
 * @returns {string}
 */
export function getAgeBand(dateOfBirth) {
  if (!dateOfBirth) return 'unknown'

  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return 'unknown'

  const today = new Date()
  // Integer age in completed years
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--
  }

  if (age < 18) return 'unknown' // under-age edge case
  if (age <= 25) return '18-25'
  if (age <= 35) return '26-35'
  if (age <= 45) return '36-45'
  return '46+'
}

/**
 * Minimum per-stratum sample size for both trainees and control records.
 * Strata below this threshold are skipped to avoid spurious point estimates.
 */
const MIN_STRATUM_SIZE = 3

/**
 * Computes estimated placement uplift using simplified stratified matching.
 *
 * Algorithm:
 *  1. Fetch trainees with dateOfBirth, district, AND priorQualification all
 *     non-null AND with at least one OutcomeCheckIn with non-null employmentStatus.
 *     Use each trainee's most recent check-in.
 *  2. Fetch all ControlGroupRecord rows.
 *  3. Stratify both groups by (ageBand, district, priorQualification).
 *     Note: uses Trainee.district (home district), NOT placementDistrict.
 *  4. For each stratum with >= MIN_STRATUM_SIZE trainees AND >= MIN_STRATUM_SIZE
 *     control records, compute:
 *       trainee placement rate = (EMPLOYED + SELF_EMPLOYED) / total trainees
 *       control placement rate  = (EMPLOYED + SELF_EMPLOYED) / total controls
 *       bucket uplift           = trainee rate - control rate
 *  5. Overall uplift = trainee-count-weighted average of bucket uplifts.
 *
 * @returns {Promise<{
 *   overallEstimatedUpliftPp: number|null,
 *   eligibleBuckets: number,
 *   skippedBuckets: number,
 *   totalTraineesInEligibleBuckets: number,
 *   totalControlsInEligibleBuckets: number,
 *   perBucketBreakdown: Array<object>,
 *   disclaimer: string,
 *   methodology: string
 * }>}
 */
export async function computeImpact() {
  // ── Fetch trainees eligible for matching ────────────────────────────────────
  // A trainee is eligible only if they have all three stratification signals AND
  // have reported at least one employment outcome.
  const eligibleTrainees = await prisma.trainee.findMany({
    where: {
      dateOfBirth: { not: null },
      district: { not: null },
      priorQualification: { not: null },
      outcomeCheckIns: {
        some: {
          employmentStatus: { not: null },
        },
      },
    },
    include: {
      outcomeCheckIns: {
        orderBy: { createdAt: 'desc' },
        where: { employmentStatus: { not: null } },
      },
    },
  })

  // ── Fetch control group ─────────────────────────────────────────────────────
  const controlRecords = await prisma.controlGroupRecord.findMany()

  // ── Stratify trainees ────────────────────────────────────────────────────────
  // Map: stratum key → array of { isPlaced: boolean }
  const traineeStrata = new Map()

  for (const trainee of eligibleTrainees) {
    const ageBand = getAgeBand(trainee.dateOfBirth)
    if (ageBand === 'unknown') continue

    const district = (trainee.district || '').trim()
    const qual = (trainee.priorQualification || '').trim()
    if (!district || !qual) continue

    const key = `${ageBand}||${district}||${qual}`

    // Use most recent reported check-in (already ordered desc, filtered for non-null)
    const latestCheckIn = trainee.outcomeCheckIns[0]
    if (!latestCheckIn) continue

    const isPlaced =
      latestCheckIn.employmentStatus === 'EMPLOYED' ||
      latestCheckIn.employmentStatus === 'SELF_EMPLOYED'

    if (!traineeStrata.has(key)) traineeStrata.set(key, [])
    traineeStrata.get(key).push({ isPlaced, ageBand, district, priorQualification: qual })
  }

  // ── Stratify control records ────────────────────────────────────────────────
  const controlStrata = new Map()

  for (const ctrl of controlRecords) {
    const ageBand = (ctrl.ageBand || '').trim()
    const district = (ctrl.district || '').trim()
    const qual = (ctrl.priorQualification || '').trim()
    if (!ageBand || !district || !qual) continue

    const key = `${ageBand}||${district}||${qual}`
    const isPlaced =
      ctrl.employmentStatus === 'EMPLOYED' || ctrl.employmentStatus === 'SELF_EMPLOYED'

    if (!controlStrata.has(key)) controlStrata.set(key, [])
    controlStrata.get(key).push({ isPlaced })
  }

  // ── Compute per-bucket uplift ────────────────────────────────────────────────
  const perBucketBreakdown = []
  let skippedBuckets = 0
  let weightedUpliftSum = 0
  let totalTraineeWeight = 0
  let totalTraineesEligible = 0
  let totalControlsEligible = 0

  for (const [key, traineeList] of traineeStrata.entries()) {
    const controlList = controlStrata.get(key) || []
    const [ageBand, district, priorQualification] = key.split('||')

    const traineeN = traineeList.length
    const controlN = controlList.length

    if (traineeN < MIN_STRATUM_SIZE || controlN < MIN_STRATUM_SIZE) {
      skippedBuckets++
      perBucketBreakdown.push({
        ageBand,
        district,
        priorQualification,
        traineeCount: traineeN,
        controlCount: controlN,
        traineePlacementRate: null,
        controlPlacementRate: null,
        estimatedUpliftPp: null,
        skipped: true,
        skipReason: `Insufficient sample: ${traineeN} trainees, ${controlN} controls (min ${MIN_STRATUM_SIZE} each required)`,
      })
      continue
    }

    const traineePlaced = traineeList.filter((t) => t.isPlaced).length
    const controlPlaced = controlList.filter((c) => c.isPlaced).length

    const traineePlacementRate = traineePlaced / traineeN
    const controlPlacementRate = controlPlaced / controlN
    const upliftPp = (traineePlacementRate - controlPlacementRate) * 100

    perBucketBreakdown.push({
      ageBand,
      district,
      priorQualification,
      traineeCount: traineeN,
      controlCount: controlN,
      traineePlacementRate: Math.round(traineePlacementRate * 1000) / 10, // one decimal %
      controlPlacementRate: Math.round(controlPlacementRate * 1000) / 10,
      estimatedUpliftPp: Math.round(upliftPp * 10) / 10, // one decimal pp
      skipped: false,
      skipReason: null,
    })

    weightedUpliftSum += upliftPp * traineeN
    totalTraineeWeight += traineeN
    totalTraineesEligible += traineeN
    totalControlsEligible += controlN
  }

  const eligibleBuckets = perBucketBreakdown.filter((b) => !b.skipped).length

  const overallEstimatedUpliftPp =
    totalTraineeWeight > 0
      ? Math.round((weightedUpliftSum / totalTraineeWeight) * 10) / 10
      : null

  // Sort breakdown: eligible buckets first (sorted by uplift desc), then skipped
  perBucketBreakdown.sort((a, b) => {
    if (a.skipped !== b.skipped) return a.skipped ? 1 : -1
    return (b.estimatedUpliftPp ?? -Infinity) - (a.estimatedUpliftPp ?? -Infinity)
  })

  return {
    overallEstimatedUpliftPp,
    eligibleBuckets,
    skippedBuckets,
    totalTraineesInEligibleBuckets: totalTraineesEligible,
    totalControlsInEligibleBuckets: totalControlsEligible,
    perBucketBreakdown,
    disclaimer: IMPACT_DISCLAIMER,
    methodology: METHODOLOGY_DESCRIPTION,
  }
}
