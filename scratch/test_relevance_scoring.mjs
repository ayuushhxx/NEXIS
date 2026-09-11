/**
 * Verification test script for course/provider relevance scoring and skill-gap persistence.
 */

import prisma from '../server/lib/prisma.js'
import { computeRelevanceScores, attributeToEnrolment } from '../server/services/relevanceScoringService.js'

async function runTest() {
  console.log('=== STARTING COURSE RELEVANCE & SKILL-GAP TESTS ===\n')

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

  // ── 1. Test attribution helper function ──────────────────────────────────
  console.log('Test 1: Testing attributeToEnrolment() attribution logic...')
  const mockEnrolments = [
    { id: 'e1', courseName: 'Course 1', providerName: 'Provider 1', enrolmentDate: new Date('2025-01-01') },
    { id: 'e2', courseName: 'Course 2', providerName: 'Provider 2', enrolmentDate: new Date('2025-06-01') },
  ]
  const attr1 = attributeToEnrolment(mockEnrolments, new Date('2025-03-01'))
  assert(attr1?.id === 'e1', 'Attributes to most recent prior enrolment (Course 1 on 2025-01-01 for event on 2025-03-01)')

  const attr2 = attributeToEnrolment(mockEnrolments, new Date('2025-08-01'))
  assert(attr2?.id === 'e2', 'Attributes to newest prior enrolment (Course 2 on 2025-06-01 for event on 2025-08-01)')

  const attr3 = attributeToEnrolment(mockEnrolments, new Date('2024-01-01'))
  assert(attr3?.id === 'e2', 'Falls back to most recent enrolment by enrolmentDate when event precedes all enrolments')

  // ── 2. Create test fixtures in DB ─────────────────────────────────────────
  console.log('\nTest 2: Setting up test fixtures in DB...')
  const testCourse = 'TEST_CLOUD_ENGINEERING'
  const testProvider = 'TEST_ACADEMY'
  const testPhone = '+919999000099'

  // Clean previous test data if any
  await prisma.courseRelevanceScore.deleteMany({
    where: { courseName: testCourse, providerName: testProvider },
  })
  const prevTrainee = await prisma.trainee.findUnique({ where: { phoneNumber: testPhone } })
  if (prevTrainee) {
    await prisma.skillGapSnapshot.deleteMany({ where: { traineeId: prevTrainee.id } })
    await prisma.employerVerification.deleteMany({ where: { traineeId: prevTrainee.id } })
    await prisma.outcomeCheckIn.deleteMany({ where: { traineeId: prevTrainee.id } })
    await prisma.enrolment.deleteMany({ where: { traineeId: prevTrainee.id } })
    await prisma.trainee.delete({ where: { id: prevTrainee.id } })
  }

  const trainee = await prisma.trainee.create({
    data: {
      phoneNumber: testPhone,
      name: 'Test Trainee Relevance',
      phoneVerified: true,
      enrolments: {
        create: {
          scheme: 'PMKVY',
          courseName: testCourse,
          providerName: testProvider,
          cohortName: '2025-C1',
          enrolmentDate: new Date('2025-01-10'),
        },
      },
    },
    include: { enrolments: true },
  })
  assert(Boolean(trainee.id), `Created test trainee with enrolment in ${testCourse}`)

  // ── 3. Test SkillGapSnapshot persistence ─────────────────────────────────
  console.log('\nTest 3: Testing SkillGapSnapshot persistence...')
  const snapshot1 = await prisma.skillGapSnapshot.create({
    data: {
      traineeId: trainee.id,
      jdTitle: 'DevOps Engineer',
      missingSkills: JSON.stringify(['Kubernetes', 'Docker', 'Terraform']),
      atsScore: 78.5,
    },
  })
  const snapshot2 = await prisma.skillGapSnapshot.create({
    data: {
      traineeId: trainee.id,
      jdTitle: 'Cloud Architect',
      missingSkills: JSON.stringify(['Kubernetes', 'Docker', 'CI/CD']),
      atsScore: 82.0,
    },
  })
  assert(Boolean(snapshot1.id && snapshot2.id), 'Successfully persisted 2 SkillGapSnapshot records')

  // ── 4. Create EmployerVerification & OutcomeCheckIn records ──────────────
  console.log('\nTest 4: Creating EmployerVerification & OutcomeCheckIn records...')
  const checkIn1 = await prisma.outcomeCheckIn.create({
    data: {
      traineeId: trainee.id,
      checkinType: 'SELF_INITIATED',
      status: 'COMPLETED',
      employmentStatus: 'EMPLOYED',
      employerName: 'Acme Corp',
      respondedAt: new Date('2025-03-01'),
      employerVerification: {
        create: {
          traineeId: trainee.id,
          employerNameClaimed: 'Acme Corp',
          employerContactEmail: 'hr@acme.com',
          contactDomainFlag: false,
          verificationToken: 'test_token_1_' + Date.now(),
          tokenExpiresAt: new Date(Date.now() + 86400000),
          status: 'CONFIRMED',
          verifiedAt: new Date('2025-03-02'),
        },
      },
    },
    include: { employerVerification: true },
  })

  const checkIn2 = await prisma.outcomeCheckIn.create({
    data: {
      traineeId: trainee.id,
      checkinType: 'SELF_INITIATED',
      status: 'COMPLETED',
      employmentStatus: 'EMPLOYED',
      employerName: 'Beta Inc',
      respondedAt: new Date('2025-04-01'),
      employerVerification: {
        create: {
          traineeId: trainee.id,
          employerNameClaimed: 'Beta Inc',
          employerContactEmail: 'hr@beta.com',
          contactDomainFlag: false,
          verificationToken: 'test_token_2_' + Date.now(),
          tokenExpiresAt: new Date(Date.now() + 86400000),
          status: 'DENIED',
          reasonCode: 'SKILL_GAP',
          verifiedAt: new Date('2025-04-02'),
        },
      },
    },
    include: { employerVerification: true },
  })

  const checkIn3 = await prisma.outcomeCheckIn.create({
    data: {
      traineeId: trainee.id,
      checkinType: 'SELF_INITIATED',
      status: 'COMPLETED',
      employmentStatus: 'SEARCHING',
      nonPlacementReason: 'SKILL_GAP',
      respondedAt: new Date('2025-05-01'),
    },
  })

  const checkIn4 = await prisma.outcomeCheckIn.create({
    data: {
      traineeId: trainee.id,
      checkinType: 'SELF_INITIATED',
      status: 'COMPLETED',
      employmentStatus: 'SEARCHING',
      nonPlacementReason: 'LOCATION',
      respondedAt: new Date('2025-05-05'),
    },
  })

  assert(Boolean(checkIn1.id && checkIn2.id && checkIn3.id && checkIn4.id), 'Created 1 CONFIRMED, 1 DENIED (SKILL_GAP) verification, and 2 SEARCHING (SKILL_GAP, LOCATION) checkins')

  // ── 5. Run computeRelevanceScores() ───────────────────────────────────────
  console.log('\nTest 5: Running computeRelevanceScores()...')
  const result = await computeRelevanceScores()
  assert(result.coursesProcessed > 0, `computeRelevanceScores processed ${result.coursesProcessed} courses`)

  const testScorecard = await prisma.courseRelevanceScore.findUnique({
    where: {
      courseName_providerName: {
        courseName: testCourse,
        providerName: testProvider,
      },
    },
  })
  assert(Boolean(testScorecard), 'CourseRelevanceScore row exists in database')

  // Verify fields
  assert(testScorecard.totalClaims === 2, `totalClaims is 2 (expected 2, got ${testScorecard.totalClaims})`)
  assert(testScorecard.confirmedCount === 1, `confirmedCount is 1 (expected 1, got ${testScorecard.confirmedCount})`)
  assert(testScorecard.deniedCount === 1, `deniedCount is 1 (expected 1, got ${testScorecard.deniedCount})`)

  const empBreakdown = JSON.parse(testScorecard.employerReasonBreakdown)
  assert(empBreakdown.SKILL_GAP === 1, `employerReasonBreakdown has SKILL_GAP: 1 (got ${JSON.stringify(empBreakdown)})`)

  const traBreakdown = JSON.parse(testScorecard.traineeReasonBreakdown)
  assert(traBreakdown.SKILL_GAP === 1, `traineeReasonBreakdown has SKILL_GAP: 1 (got ${JSON.stringify(traBreakdown)})`)

  // Check distinct breakdowns
  assert(
    typeof testScorecard.employerReasonBreakdown === 'string' &&
    typeof testScorecard.traineeReasonBreakdown === 'string' &&
    testScorecard.employerReasonBreakdown !== testScorecard.traineeReasonBreakdown,
    'Employer and trainee reason breakdowns are stored separately'
  )

  const missingSkills = JSON.parse(testScorecard.topMissingSkills)
  assert(missingSkills.length === 4, `topMissingSkills contains 4 distinct skills across snapshots (got ${missingSkills.length})`)
  assert(missingSkills[0].skill === 'Docker' || missingSkills[0].skill === 'Kubernetes', `Top missing skill is Docker or Kubernetes with count 2 (got ${missingSkills[0].skill}: ${missingSkills[0].count})`)

  // Base score = 1 / 2 = 0.5.
  // Combined SKILL_GAP is dominant (count = 2).
  // Penalty = -0.1 => 0.5 - 0.1 = 0.4.
  assert(Math.abs(testScorecard.relevanceScore - 0.4) < 0.001, `relevanceScore is 0.40 after -0.1 penalty (expected 0.40, got ${testScorecard.relevanceScore})`)

  // ── 6. Test Live HTTP Endpoints ──────────────────────────────────────────
  console.log('\nTest 6: Testing HTTP Endpoints against http://localhost:8787...')

  // 6a. Anonymous Resume Tailoring
  const anonTailorRes = await fetch('http://localhost:8787/api/resume/tailor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: 'Senior React and TypeScript Developer with 5 years building high performance web applications.',
      jd: 'Looking for a Senior React and TypeScript Engineer with experience in GraphQL and WebSockets.',
    }),
  })
  const anonTailorJson = await anonTailorRes.json()
  assert(anonTailorRes.status === 200, `POST /api/resume/tailor (anonymous) returned 200 (got ${anonTailorRes.status})`)
  assert(Boolean(anonTailorJson.tailoredResume || anonTailorJson.analysis), 'Anonymous tailoring returned valid payload')

  // 6b. Trainee-Gated Resume Tailoring
  const preSnapCount = await prisma.skillGapSnapshot.count({ where: { traineeId: trainee.id } })
  const traineeTailorRes = await fetch('http://localhost:8787/api/resume/tailor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: 'Python developer with experience in Django, PostgreSQL, and basic Docker containers.',
      jd: 'Senior Cloud Platform Engineer required. Must master Kubernetes, Docker, Terraform, CI/CD pipelines, and AWS architecture.',
      traineeId: trainee.id,
    }),
  })
  const traineeTailorJson = await traineeTailorRes.json()
  assert(traineeTailorRes.status === 200, `POST /api/resume/tailor (trainee) returned 200 (got ${traineeTailorRes.status})`)

  const postSnapCount = await prisma.skillGapSnapshot.count({ where: { traineeId: trainee.id } })
  assert(postSnapCount === preSnapCount + 1, `SkillGapSnapshot row created for trainee (before: ${preSnapCount}, after: ${postSnapCount})`)

  const newestSnap = await prisma.skillGapSnapshot.findFirst({
    where: { traineeId: trainee.id },
    orderBy: { createdAt: 'desc' },
  })
  assert(Boolean(newestSnap?.jdTitle), `SkillGapSnapshot captured jdTitle: "${newestSnap?.jdTitle}"`)
  assert(Array.isArray(JSON.parse(newestSnap?.missingSkills || '[]')), 'SkillGapSnapshot captured valid JSON missingSkills array')

  // 6c. Admin RBAC & Analytics Endpoints
  const adminUsername = 'test_relevance_analyst'
  const admin = await prisma.adminUser.upsert({
    where: { githubUsername: adminUsername },
    update: { role: 'ANALYST' },
    create: { githubUsername: adminUsername, role: 'ANALYST' },
  })
  assert(Boolean(admin.id), `Admin user created/verified with role ANALYST (${adminUsername})`)

  const adminHeaders = {
    Authorization: `Bearer mock_${adminUsername}`,
    'Content-Type': 'application/json',
  }

  // POST /api/admin/compute-relevance-scores
  const computeRes = await fetch('http://localhost:8787/api/admin/compute-relevance-scores', {
    method: 'POST',
    headers: adminHeaders,
  })
  const computeJson = await computeRes.json()
  assert(computeRes.status === 200, `POST /api/admin/compute-relevance-scores returned 200 (got ${computeRes.status})`)
  assert(computeJson.coursesProcessed > 0, `Compute scores returned coursesProcessed: ${computeJson.coursesProcessed}`)

  // Verify AdminActionLog was written
  const actionLog = await prisma.adminActionLog.findFirst({
    where: { adminUserId: admin.id, action: 'COMPUTE_RELEVANCE_SCORES' },
    orderBy: { createdAt: 'desc' },
  })
  assert(Boolean(actionLog), 'AdminActionLog entry recorded for COMPUTE_RELEVANCE_SCORES')

  // GET /api/analytics/course-relevance
  const listRes = await fetch('http://localhost:8787/api/analytics/course-relevance', {
    headers: adminHeaders,
  })
  const listJson = await listRes.json()
  assert(listRes.status === 200, `GET /api/analytics/course-relevance returned 200 (got ${listRes.status})`)
  assert(Array.isArray(listJson.scores), `GET /api/analytics/course-relevance returned scores array (${listJson.scores?.length} items)`)

  // Check sorting: non-null scores first in ascending order, nulls at end
  let sortingValid = true
  let seenNull = false
  let prevScore = -Infinity
  for (const s of listJson.scores) {
    if (s.relevanceScore === null) {
      seenNull = true
    } else {
      if (seenNull) {
        sortingValid = false // scored item appeared after a null item
        break
      }
      if (s.relevanceScore < prevScore) {
        sortingValid = false // not sorted ascending
        break
      }
      prevScore = s.relevanceScore
    }
  }
  assert(sortingValid, 'Scores are properly sorted ascending (worst-first) with nulls at the end')

  // GET /api/analytics/course-relevance/:courseName/:providerName
  const singleRes = await fetch(
    `http://localhost:8787/api/analytics/course-relevance/${encodeURIComponent(testCourse)}/${encodeURIComponent(testProvider)}`,
    { headers: adminHeaders }
  )
  const singleJson = await singleRes.json()
  assert(singleRes.status === 200, `GET /api/analytics/course-relevance/:course/:provider returned 200 (got ${singleRes.status})`)
  assert(singleJson.scorecard?.courseName === testCourse, 'Single scorecard matches requested courseName')
  assert(typeof singleJson.scorecard?.employerReasonBreakdown === 'object', 'employerReasonBreakdown is returned parsed as an object')
  assert(typeof singleJson.scorecard?.traineeReasonBreakdown === 'object', 'traineeReasonBreakdown is returned parsed as an object')
  assert(Array.isArray(singleJson.scorecard?.topMissingSkills), 'topMissingSkills is returned parsed as an array')

  // ── 7. Cleanup test fixtures ─────────────────────────────────────────────
  console.log('\nCleaning up test fixtures...')
  await prisma.adminActionLog.deleteMany({ where: { adminUserId: admin.id } })
  await prisma.adminUser.delete({ where: { id: admin.id } })
  await prisma.courseRelevanceScore.deleteMany({
    where: { courseName: testCourse, providerName: testProvider },
  })
  await prisma.skillGapSnapshot.deleteMany({ where: { traineeId: trainee.id } })
  await prisma.employerVerification.deleteMany({ where: { traineeId: trainee.id } })
  await prisma.outcomeCheckIn.deleteMany({ where: { traineeId: trainee.id } })
  await prisma.enrolment.deleteMany({ where: { traineeId: trainee.id } })
  await prisma.trainee.delete({ where: { id: trainee.id } })
  console.log('Cleanup complete.')

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTest().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
