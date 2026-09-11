/**
 * FILE: scratch/test_analytics_endpoints.mjs
 * PURPOSE: End-to-end integration test for government/provider analytics endpoints,
 *          paired response-placement rates, home vs placement district migration tracking,
 *          wage progression, and tokenized read-only provider views.
 */

import prisma from '../server/lib/prisma.js'

const BASE_URL = 'http://localhost:8787'
const AUTH_HEADER = {
  Authorization: 'Bearer mock_test-admin',
  'Content-Type': 'application/json',
}

async function runTests() {
  console.log('─── Starting Analytics Endpoints Integration Tests ───\n')

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${message}`)
      failed++
    }
  }

  try {
    // 0. Seed a test trainee with a distinct homeDistrict vs placementDistrict if needed
    console.log('Step 0: Ensuring sample trainee with home vs placement district migration...')
    const testMigrantTrainee = await prisma.trainee.upsert({
      where: { phoneNumber: '+919999988888' },
      update: {
        district: 'Satara',
        name: 'Migration Test Candidate',
      },
      create: {
        phoneNumber: '+919999988888',
        name: 'Migration Test Candidate',
        district: 'Satara', // Home district
      },
    })

    // Add enrolment >= 90 days ago so they are due for check-in
    const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000)
    let enrolment = await prisma.enrolment.findFirst({
      where: { traineeId: testMigrantTrainee.id },
    })
    if (!enrolment) {
      enrolment = await prisma.enrolment.create({
        data: {
          traineeId: testMigrantTrainee.id,
          scheme: 'PMKVY 4.0',
          courseName: 'Full-Stack Software Development',
          providerName: 'Skill India Training Partner',
          cohortName: 'Cohort-2024-A',
          enrolmentDate: ninetyFiveDaysAgo,
        },
      })
    }

    // Add 2 check-ins to test wage progression & placement district
    // Check-in 1: 10-20k
    // Check-in 2: 20k+ placed in 'Pune'
    await prisma.outcomeCheckIn.deleteMany({
      where: { traineeId: testMigrantTrainee.id },
    })

    const checkIn1 = await prisma.outcomeCheckIn.create({
      data: {
        traineeId: testMigrantTrainee.id,
        checkinType: '90_DAY',
        status: 'COMPLETED',
        employmentStatus: 'EMPLOYED',
        employerName: 'Pune Tech Corp',
        wageBand: '10-20k',
        roleRelevance: 'DIRECTLY_RELATED',
        placementDistrict: 'Pune', // Placed in Pune (differs from Satara)
        respondedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    })

    const checkIn2 = await prisma.outcomeCheckIn.create({
      data: {
        traineeId: testMigrantTrainee.id,
        checkinType: '180_DAY',
        status: 'COMPLETED',
        employmentStatus: 'EMPLOYED',
        employerName: 'Pune Tech Corp',
        wageBand: '20k+', // Advanced wage band!
        roleRelevance: 'DIRECTLY_RELATED',
        placementDistrict: 'Pune',
        respondedAt: new Date(),
        createdAt: new Date(),
      },
    })

    console.log(`Created test candidate ${testMigrantTrainee.id} with home: Satara, placement: Pune\n`)

    // ── Test 1: GET /api/analytics/overview ──
    console.log('Test 1: GET /api/analytics/overview')
    const overviewRes = await fetch(`${BASE_URL}/api/analytics/overview`, {
      headers: AUTH_HEADER,
    })
    assert(overviewRes.status === 200, `Overview returns 200 OK (got ${overviewRes.status})`)
    const overviewData = await overviewRes.json()
    assert(overviewData.totalTrainees > 0, `Returns totalTrainees > 0 (${overviewData.totalTrainees})`)
    assert('responseRate' in overviewData, `Returns responseRate field (${overviewData.responseRate})`)
    assert('placementRate' in overviewData, `Returns placementRate field (${overviewData.placementRate})`)
    assert(overviewData.employmentStatusBreakdown !== undefined, 'Returns employmentStatusBreakdown object')
    assert(overviewData.employmentStatusBreakdown.EMPLOYED > 0, `Counts employed trainees (${overviewData.employmentStatusBreakdown.EMPLOYED})`)
    console.log(`  -> Overview response rate: ${overviewData.responseRatePercentage}%, placement rate: ${overviewData.placementRatePercentage}%\n`)

    // ── Test 2: GET /api/analytics/by-district ──
    console.log('Test 2: GET /api/analytics/by-district (Home vs Placement attribution)')
    const districtRes = await fetch(`${BASE_URL}/api/analytics/by-district`, {
      headers: AUTH_HEADER,
    })
    assert(districtRes.status === 200, `By-district returns 200 OK (got ${districtRes.status})`)
    const districtData = await districtRes.json()
    assert(Array.isArray(districtData.homeDistrictBreakdown), 'homeDistrictBreakdown is an array')
    assert(Array.isArray(districtData.placementDistrictBreakdown), 'placementDistrictBreakdown is an array')

    // Find Satara in homeDistrictBreakdown
    const sataraHome = districtData.homeDistrictBreakdown.find((d) => d.district === 'Satara')
    assert(!!sataraHome, 'Satara appears in homeDistrictBreakdown')
    if (sataraHome) {
      assert('responseRate' in sataraHome && 'placementRate' in sataraHome, 'Satara has paired responseRate and placementRate')
    }

    // Find Pune in placementDistrictBreakdown
    const punePlacement = districtData.placementDistrictBreakdown.find((d) => d.placementDistrict === 'Pune')
    assert(!!punePlacement, 'Pune appears in placementDistrictBreakdown')
    if (punePlacement) {
      assert('responseRate' in punePlacement && 'placementRate' in punePlacement, 'Pune has paired responseRate and placementRate')
      assert(Array.isArray(punePlacement.topHomeDistricts), 'Pune includes topHomeDistricts for migration analysis')
      const sataraOrigin = punePlacement.topHomeDistricts.find((o) => o.homeDistrict === 'Satara')
      assert(!!sataraOrigin, 'topHomeDistricts correctly attributes migrant from Satara to Pune')
    }
    console.log('  -> Distinct home vs placement breakdowns successfully verified.\n')

    // ── Test 3: GET /api/analytics/by-cohort ──
    console.log('Test 3: GET /api/analytics/by-cohort')
    const cohortRes = await fetch(`${BASE_URL}/api/analytics/by-cohort`, {
      headers: AUTH_HEADER,
    })
    assert(cohortRes.status === 200, `By-cohort returns 200 OK (got ${cohortRes.status})`)
    const cohortData = await cohortRes.json()
    assert(Array.isArray(cohortData.cohorts) && cohortData.cohorts.length > 0, `Returns non-empty cohorts list (${cohortData.totalCohorts} cohorts)`)
    const firstCohort = cohortData.cohorts[0]
    assert('responseRate' in firstCohort && 'placementRate' in firstCohort, 'Cohort entry pairs responseRate alongside placementRate')
    console.log(`  -> Cohort "${firstCohort.cohortName}": placement=${firstCohort.placementRatePercentage}%, response=${firstCohort.responseRatePercentage}%\n`)

    // ── Test 4: GET /api/analytics/by-provider ──
    console.log('Test 4: GET /api/analytics/by-provider (Joined with Course Relevance Scores)')
    const providerRes = await fetch(`${BASE_URL}/api/analytics/by-provider`, {
      headers: AUTH_HEADER,
    })
    assert(providerRes.status === 200, `By-provider returns 200 OK (got ${providerRes.status})`)
    const providerData = await providerRes.json()
    assert(Array.isArray(providerData.providers) && providerData.providers.length > 0, `Returns non-empty providers list (${providerData.totalProviders} providers)`)
    const firstProvider = providerData.providers[0]
    assert('responseRate' in firstProvider && 'placementRate' in firstProvider, 'Provider entry pairs responseRate alongside placementRate')
    assert('averageRelevanceScore' in firstProvider, 'Provider includes joined averageRelevanceScore')
    assert(Array.isArray(firstProvider.courseScorecards), 'Provider includes courseScorecards array')
    console.log(`  -> Provider "${firstProvider.providerName}": avgScore=${firstProvider.averageRelevanceScore}, courses=${firstProvider.courseScorecards.length}\n`)

    // ── Test 5: GET /api/analytics/wage-progression ──
    console.log('Test 5: GET /api/analytics/wage-progression')
    const wageRes = await fetch(`${BASE_URL}/api/analytics/wage-progression`, {
      headers: AUTH_HEADER,
    })
    assert(wageRes.status === 200, `Wage-progression returns 200 OK (got ${wageRes.status})`)
    const wageData = await wageRes.json()
    assert(wageData.eligibleTrainees > 0, `Identified eligible trainees with >= 2 check-ins (${wageData.eligibleTrainees})`)
    assert(wageData.movedUpCount > 0, `Identified trainees who moved up wage bands (${wageData.movedUpCount})`)
    assert(wageData.percentageMovedUp > 0, `Computed positive percentageMovedUp (${wageData.percentageMovedUp}%)`)
    assert(Array.isArray(wageData.transitions) && wageData.transitions.length > 0, `Identified wage band transitions (e.g. ${wageData.transitions[0]?.transition})`)
    console.log(`  -> Wage progression: movedUp=${wageData.movedUpCount} (${wageData.percentageMovedUp}%), stayedSame=${wageData.stayedSameCount}\n`)

    // ── Test 6: Query Filtering (?scheme=... & ?from=...&to=...) ──
    console.log('Test 6: Query Filtering on Endpoints')
    const filteredRes = await fetch(`${BASE_URL}/api/analytics/overview?scheme=PMKVY%204.0`, {
      headers: AUTH_HEADER,
    })
    assert(filteredRes.status === 200, `Filtered overview returns 200 OK`)
    const filteredData = await filteredRes.json()
    assert(filteredData.filterApplied?.scheme === 'PMKVY 4.0', 'Correctly acknowledged applied scheme filter')
    console.log(`  -> Filtered query scheme=PMKVY 4.0 acknowledged.\n`)

    // ── Test 7: POST /api/admin/generate-provider-token ──
    console.log('Test 7: POST /api/admin/generate-provider-token')
    const tokenGenRes = await fetch(`${BASE_URL}/api/admin/generate-provider-token`, {
      method: 'POST',
      headers: AUTH_HEADER,
      body: JSON.stringify({
        providerName: 'Skill India Training Partner',
        expiresInDays: 14,
      }),
    })
    assert(tokenGenRes.status === 200, `Token generation returns 200 OK (got ${tokenGenRes.status})`)
    const tokenGenData = await tokenGenRes.json()
    assert(typeof tokenGenData.token === 'string' && tokenGenData.token.startsWith('pvt_'), `Token generated with prefix 'pvt_' (${tokenGenData.token.slice(0, 12)}...)`)
    assert(tokenGenData.shareableLink === `/api/provider-view/${tokenGenData.token}`, 'Returns correct shareableLink')
    assert(tokenGenData.providerName === 'Skill India Training Partner', 'Returns correct providerName')

    // Check audit log
    const auditLog = await prisma.adminActionLog.findFirst({
      where: { action: 'GENERATE_PROVIDER_TOKEN' },
      orderBy: { createdAt: 'desc' },
    })
    assert(!!auditLog, 'AdminActionLog recorded GENERATE_PROVIDER_TOKEN event')
    console.log('  -> Provider token successfully generated and audited.\n')

    // ── Test 8: GET /api/provider-view/:token (PUBLIC, no auth header) ──
    console.log('Test 8: GET /api/provider-view/:token (Public Token-Gated View)')
    const providerViewRes = await fetch(`${BASE_URL}/api/provider-view/${tokenGenData.token}`)
    assert(providerViewRes.status === 200, `Provider view returns 200 OK without session cookie/Bearer token`)
    const providerViewData = await providerViewRes.json()
    assert(providerViewData.providerName === 'Skill India Training Partner', 'Returns providerName')
    assert(providerViewData.overview !== undefined, 'Returns overview metrics')
    assert('responseRate' in providerViewData.overview && 'placementRate' in providerViewData.overview, 'Pairs responseRate with placementRate in provider overview')
    assert(Array.isArray(providerViewData.courses), 'Returns courses scorecards')

    // Verify isolation and no PII leak
    const payloadStr = JSON.stringify(providerViewData)
    assert(!payloadStr.includes('aadhaarHash'), 'Never leaks trainee aadhaarHash')
    assert(!payloadStr.includes('mobileHash'), 'Never leaks trainee mobileHash')
    assert(!payloadStr.includes('Migration Test Candidate'), 'Never leaks individual candidate names')
    console.log('  -> Provider view verified: zero PII leaks, strictly aggregate metrics.\n')

    // ── Test 9: Invalid & Expired Tokens ──
    console.log('Test 9: Invalid and Expired Token Rejection')
    const badTokenRes = await fetch(`${BASE_URL}/api/provider-view/invalid_nonexistent_token_123`)
    assert(badTokenRes.status === 404, `Invalid token returns 404 Not Found (got ${badTokenRes.status})`)

    // Create an expired token
    const expiredTokenRecord = await prisma.providerAccessToken.create({
      data: {
        providerName: 'Skill India Training Partner',
        token: 'pvt_expired_token_test_abc123',
        expiresAt: new Date(Date.now() - 1000 * 60 * 60), // Expired 1 hour ago
      },
    })
    const expiredRes = await fetch(`${BASE_URL}/api/provider-view/${expiredTokenRecord.token}`)
    assert(expiredRes.status === 403, `Expired token returns 403 Forbidden (got ${expiredRes.status})`)
    console.log('  -> Invalid and expired tokens properly rejected.\n')

    // ── Clean up test data ──
    await prisma.providerAccessToken.deleteMany({
      where: {
        token: { in: [tokenGenData.token, expiredTokenRecord.token] },
      },
    })

    console.log(`─── SUMMARY: ${passed} passed, ${failed} failed ───\n`)
    if (failed === 0) {
      console.log('🎉 ALL INTEGRATION TESTS PASSED!')
      process.exit(0)
    } else {
      console.error(`💥 ${failed} test(s) failed.`)
      process.exit(1)
    }
  } catch (err) {
    console.error('Fatal error running tests:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runTests()
