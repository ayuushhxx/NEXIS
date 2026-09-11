/**
 * FILE: test-govt-crosscheck.js
 * PURPOSE: Automated verification for Government Registry Cross-Checks (e-Shram and UDYAM).
 *          Verifies:
 *          1. Non-admin or unauthenticated access blocked.
 *          2. Missing GOVT_CROSS_CHECK consent blocked with 403.
 *          3. Admin trigger with consent succeeds and writes ESHRAM and UDYAM results.
 *          4. Deterministic results on repeated checks for same phone number.
 *          5. AdminActionLog audit record created.
 *          6. GET /api/trainee/govt-crosscheck-history/:traineeId returns ordered history.
 *
 * RUN: node test-govt-crosscheck.js
 */

import prisma from './server/lib/prisma.js'

const API_BASE = 'http://localhost:8787/api'

async function runTests() {
  console.log('=== Starting Government Registry Cross-Check Tests ===\n')

  const testPhone = '+919876500099'
  const adminToken = 'Bearer mock_test-admin' // test-admin is SUPER_ADMIN in dev.db
  const unauthHeader = {}
  const nonAdminToken = 'Bearer mock_random_user'

  try {
    // 0. Cleanup any previous test data
    console.log('[Setup] Cleaning up old test records...')
    const existing = await prisma.trainee.findUnique({ where: { phoneNumber: testPhone } })
    if (existing) {
      await prisma.govtCrossCheckResult.deleteMany({ where: { traineeId: existing.id } })
      await prisma.adminActionLog.deleteMany({ where: { targetId: existing.id } })
      await prisma.consentRecord.deleteMany({ where: { traineeId: existing.id } })
      await prisma.enrolment.deleteMany({ where: { traineeId: existing.id } })
      await prisma.trainee.delete({ where: { id: existing.id } })
    }

    // Ensure test-admin exists as SUPER_ADMIN
    await prisma.adminUser.upsert({
      where: { githubUsername: 'test-admin' },
      update: { role: 'SUPER_ADMIN' },
      create: { githubUsername: 'test-admin', role: 'SUPER_ADMIN' },
    })

    // Create a test trainee
    const trainee = await prisma.trainee.create({
      data: {
        phoneNumber: testPhone,
        name: 'Vikas Patel',
        preferredLanguage: 'hi',
        githubId: 'vikas_patel_test',
        phoneVerified: true,
        enrolments: {
          create: {
            scheme: 'PMKVY',
            courseName: 'Solar PV Installer',
            providerName: 'Gujarat Solar Institute',
            cohortName: '2024-S1',
            enrolmentDate: new Date('2024-02-01'),
            certificationDate: new Date('2024-08-01'),
          },
        },
      },
    })
    console.log(`✓ Test trainee created: ${trainee.name} (${trainee.id})`)

    // ── Test 1: Admin RBAC protection ──────────────────────────────────────────
    console.log('\n--- Test 1: Admin RBAC Enforcement ---')
    const unauthRes = await fetch(`${API_BASE}/admin/trigger-govt-crosscheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traineeId: trainee.id }),
    })
    console.log(`Unauthenticated call status: ${unauthRes.status} (Expected: 401)`)
    if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`)

    const nonAdminRes = await fetch(`${API_BASE}/admin/trigger-govt-crosscheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: nonAdminToken,
      },
      body: JSON.stringify({ traineeId: trainee.id }),
    })
    console.log(`Non-admin call status: ${nonAdminRes.status} (Expected: 403)`)
    if (nonAdminRes.status !== 403) throw new Error(`Expected 403, got ${nonAdminRes.status}`)
    console.log('✓ Test 1 Passed: RBAC properly guards the cross-check trigger.')

    // ── Test 2: Consent Gating (Without GOVT_CROSS_CHECK) ──────────────────────
    console.log('\n--- Test 2: Consent Gating (No Consent) ---')
    // Grant OUTCOME_SURVEY only, omitting GOVT_CROSS_CHECK
    await prisma.consentRecord.create({
      data: {
        traineeId: trainee.id,
        scope: 'OUTCOME_SURVEY',
        granted: true,
        grantedAt: new Date(),
      },
    })

    const noConsentRes = await fetch(`${API_BASE}/admin/trigger-govt-crosscheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminToken,
      },
      body: JSON.stringify({ traineeId: trainee.id }),
    })
    console.log(`Trigger without GOVT_CROSS_CHECK status: ${noConsentRes.status} (Expected: 403)`)
    const noConsentJson = await noConsentRes.json()
    console.log(`Response error: "${noConsentJson.error}"`)
    if (noConsentRes.status !== 403 || noConsentJson.consentRequired !== 'GOVT_CROSS_CHECK') {
      throw new Error(`Expected 403 with consentRequired='GOVT_CROSS_CHECK', got ${JSON.stringify(noConsentJson)}`)
    }
    console.log('✓ Test 2 Passed: Cross-check blocked when GOVT_CROSS_CHECK consent is absent.')

    // ── Test 3: Grant Consent & Run Trigger ────────────────────────────────────
    console.log('\n--- Test 3: Grant GOVT_CROSS_CHECK Consent & Trigger Cross-Check ---')
    await prisma.consentRecord.create({
      data: {
        traineeId: trainee.id,
        scope: 'GOVT_CROSS_CHECK',
        granted: true,
        grantedAt: new Date(),
      },
    })

    const run1Res = await fetch(`${API_BASE}/admin/trigger-govt-crosscheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminToken,
      },
      body: JSON.stringify({ traineeId: trainee.id }),
    })
    console.log(`Trigger with consent status: ${run1Res.status} (Expected: 200)`)
    if (run1Res.status !== 200) {
      const errBody = await run1Res.text()
      throw new Error(`Expected 200, got ${run1Res.status}: ${errBody}`)
    }
    const run1Json = await run1Res.json()
    console.log(`Results received (${run1Json.results?.length} records):`)
    for (const r of run1Json.results) {
      console.log(` - Source: ${r.source}, Match: ${r.matchFound}, Confidence: ${r.matchConfidence}, Summary: ${r.matchedRecordSummary}`)
    }
    if (run1Json.results?.length !== 2) throw new Error('Expected exactly 2 results (ESHRAM and UDYAM)')
    console.log('✓ Test 3 Passed: Cross-check executed and stored in database.')

    // ── Test 4: Determinism Verification ──────────────────────────────────────
    console.log('\n--- Test 4: Determinism of Phone-Hash Mocks ---')
    const run2Res = await fetch(`${API_BASE}/admin/trigger-govt-crosscheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminToken,
      },
      body: JSON.stringify({ traineeId: trainee.id }),
    })
    const run2Json = await run2Res.json()
    const eshram1 = run1Json.results.find(r => r.source === 'ESHRAM')
    const eshram2 = run2Json.results.find(r => r.source === 'ESHRAM')
    const udyam1 = run1Json.results.find(r => r.source === 'UDYAM')
    const udyam2 = run2Json.results.find(r => r.source === 'UDYAM')

    if (eshram1.matchFound !== eshram2.matchFound || eshram1.matchConfidence !== eshram2.matchConfidence) {
      throw new Error(`e-Shram result changed between runs for same phone! Run 1: ${eshram1.matchFound}, Run 2: ${eshram2.matchFound}`)
    }
    if (udyam1.matchFound !== udyam2.matchFound || udyam1.matchConfidence !== udyam2.matchConfidence) {
      throw new Error(`UDYAM result changed between runs for same phone! Run 1: ${udyam1.matchFound}, Run 2: ${udyam2.matchFound}`)
    }
    console.log('✓ Test 4 Passed: Repeated runs produce identical match and confidence scores for the same phone.')

    // ── Test 5: Admin Action Audit Log Verification ───────────────────────────
    console.log('\n--- Test 5: Audit Log Verification ---')
    const actionLogs = await prisma.adminActionLog.findMany({
      where: {
        targetId: trainee.id,
        action: 'GOVT_CROSS_CHECK',
      },
      orderBy: { createdAt: 'desc' },
    })
    console.log(`Found ${actionLogs.length} AdminActionLog entries for targetId ${trainee.id}`)
    if (actionLogs.length !== 2) throw new Error(`Expected 2 action log rows, found ${actionLogs.length}`)
    const logDetails = JSON.parse(actionLogs[0].details)
    console.log('Action log details:', logDetails)
    if (logDetails.traineeName !== trainee.name) throw new Error('Audit log missing trainee name')
    console.log('✓ Test 5 Passed: Admin actions successfully audited in AdminActionLog.')

    // ── Test 6: Trainee History Retrieval ─────────────────────────────────────
    console.log('\n--- Test 6: GET /api/trainee/govt-crosscheck-history/:traineeId ---')
    const histRes = await fetch(`${API_BASE}/trainee/govt-crosscheck-history/${trainee.id}`)
    console.log(`History endpoint status: ${histRes.status} (Expected: 200)`)
    if (histRes.status !== 200) throw new Error(`Expected 200, got ${histRes.status}`)
    const histJson = await histRes.json()
    console.log(`Retrieved history count: ${histJson.history?.length} (Expected: 4)`)
    if (histJson.history?.length !== 4) throw new Error(`Expected 4 history items, got ${histJson.history?.length}`)
    // Ensure newest first
    const dates = histJson.history.map(h => new Date(h.checkedAt).getTime())
    for (let i = 0; i < dates.length - 1; i++) {
      if (dates[i] < dates[i + 1]) throw new Error('History is not sorted descending by checkedAt')
    }
    console.log('✓ Test 6 Passed: History successfully returned in descending chronological order.')

    console.log('\n=================================================')
    console.log('🎉 ALL GOVERNMENT REGISTRY CROSS-CHECK TESTS PASSED!')
    console.log('=================================================\n')
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runTests()
