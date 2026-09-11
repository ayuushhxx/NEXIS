/**
 * Integration test for Employer Verification and Outcome Enrichment.
 * Run with: node test-employer-verification.js
 */

import prisma from './server/lib/prisma.js';

const API_BASE = 'http://localhost:8787/api';

async function main() {
  console.log('=== Starting Employer Verification & Outcome Enrichment Tests ===\n');

  const githubId = 'rohan_test_id';
  const authToken = `Bearer mock_${githubId}`;

  // 1. Setup Test Trainee
  const testPhone = '+919999000001';
  await prisma.dedupCandidate.deleteMany({
    where: {
      OR: [
        { traineeA: { phoneNumber: testPhone } },
        { traineeB: { phoneNumber: testPhone } },
      ],
    },
  });
  const existing = await prisma.trainee.findUnique({ where: { phoneNumber: testPhone } });
  if (existing) {
    await prisma.employerVerification.deleteMany({ where: { traineeId: existing.id } });
    await prisma.outcomeCheckIn.deleteMany({ where: { traineeId: existing.id } });
    await prisma.consentRecord.deleteMany({ where: { traineeId: existing.id } });
    await prisma.enrolment.deleteMany({ where: { traineeId: existing.id } });
    await prisma.trainee.delete({ where: { id: existing.id } });
  }

  const trainee = await prisma.trainee.create({
    data: {
      phoneNumber: testPhone,
      name: 'Rohan Sharma',
      preferredLanguage: 'en',
      githubId: githubId,
      phoneVerified: true,
      enrolments: {
        create: {
          scheme: 'PMKVY',
          courseName: 'Full Stack Web Development',
          providerName: 'Apex Skill Center',
          cohortName: '2024-C1',
          enrolmentDate: new Date('2024-01-15'),
          certificationDate: new Date('2024-06-15'),
        },
      },
    },
    include: { enrolments: true },
  });
  console.log('✓ 1. Test trainee created:', trainee.name, `(${trainee.id})`);

  // 2. Test Outcome Enrichment: Submit EMPLOYED with roleRelevance and apprenticeship
  console.log('\n--- Test 2: Enriched Outcome Submission (EMPLOYED) ---');
  const resEmployed = await fetch(`${API_BASE}/trainee/status-update`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      employmentStatus: 'EMPLOYED',
      employerName: 'Tata Consultancy Services',
      wageBand: '20k+',
      roleRelevance: 'DIRECTLY_RELATED',
      apprenticeshipEmployer: 'TCS Apprenticeship Cell',
      notes: 'Hired as Junior Web Engineer',
    }),
  });
  const employedJson = await resEmployed.json();
  if (!resEmployed.ok) {
    throw new Error(`Failed to submit EMPLOYED status: ${JSON.stringify(employedJson)}`);
  }
  const checkinEmployed = employedJson.checkIn;
  console.log('✓ Employed check-in recorded:', checkinEmployed.id);
  console.log('  roleRelevance:', checkinEmployed.roleRelevance);
  console.log('  apprenticeshipEmployer:', checkinEmployed.apprenticeshipEmployer);

  // 3. Test Outcome Enrichment: Submit SELF_EMPLOYED with selfEmploymentType
  console.log('\n--- Test 3: Enriched Outcome Submission (SELF_EMPLOYED) ---');
  const resSelf = await fetch(`${API_BASE}/trainee/status-update`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      employmentStatus: 'SELF_EMPLOYED',
      wageBand: '10-20k',
      roleRelevance: 'SOMEWHAT_RELATED',
      selfEmploymentType: 'Freelance Frontend Developer',
      notes: 'Working with local business clients',
    }),
  });
  const selfJson = await resSelf.json();
  if (!resSelf.ok) {
    throw new Error(`Failed to submit SELF_EMPLOYED status: ${JSON.stringify(selfJson)}`);
  }
  console.log('✓ Self-employed check-in recorded:', selfJson.checkIn.id);
  console.log('  selfEmploymentType:', selfJson.checkIn.selfEmploymentType);
  console.log('  roleRelevance:', selfJson.checkIn.roleRelevance);

  // 4. Test Outcome Enrichment: Submit SEARCHING with nonPlacementReason
  console.log('\n--- Test 4: Enriched Outcome Submission (SEARCHING) ---');
  const resSearching = await fetch(`${API_BASE}/trainee/status-update`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      employmentStatus: 'SEARCHING',
      nonPlacementReason: 'SKILL_GAP',
      notes: 'Need further practice with backend databases',
    }),
  });
  const searchingJson = await resSearching.json();
  if (!resSearching.ok) {
    throw new Error(`Failed to submit SEARCHING status: ${JSON.stringify(searchingJson)}`);
  }
  console.log('✓ Searching check-in recorded:', searchingJson.checkIn.id);
  console.log('  nonPlacementReason:', searchingJson.checkIn.nonPlacementReason);

  // 5. Test Verification Request: Fail when EMPLOYER_SHARING consent NOT granted
  console.log('\n--- Test 5: Employer Verification Gated by EMPLOYER_SHARING Consent ---');
  const resConsentFail = await fetch(`${API_BASE}/trainee/request-employer-verification`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      outcomeCheckInId: checkinEmployed.id,
      employerContact: 'hr@tcs.com',
    }),
  });
  console.log('Status without consent (expect 403):', resConsentFail.status);
  const consentFailJson = await resConsentFail.json();
  console.log('Error message:', consentFailJson.error);
  if (resConsentFail.status !== 403 || consentFailJson.consentRequired !== 'EMPLOYER_SHARING') {
    throw new Error('Expected 403 with consentRequired: EMPLOYER_SHARING');
  }
  console.log('✓ Correctly rejected verification request without consent');

  // 6. Grant EMPLOYER_SHARING consent
  console.log('\n--- Test 6: Grant EMPLOYER_SHARING Consent & Trigger Verification ---');
  await prisma.consentRecord.create({
    data: {
      traineeId: trainee.id,
      scope: 'EMPLOYER_SHARING',
      granted: true,
      version: 'v1',
    },
  });
  console.log('✓ Granted EMPLOYER_SHARING consent in ConsentRecord');

  // 7. Request Verification with personal domain (gmail.com) -> contactDomainFlag = true
  console.log('\n--- Test 7: Personal Domain Flagging (gmail.com) ---');
  const resVerifyGmail = await fetch(`${API_BASE}/trainee/request-employer-verification`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      outcomeCheckInId: checkinEmployed.id,
      employerContact: 'supervisor.sharma@gmail.com',
    }),
  });
  const verifyGmailJson = await resVerifyGmail.json();
  if (!resVerifyGmail.ok) {
    throw new Error(`Failed to request verification: ${JSON.stringify(verifyGmailJson)}`);
  }
  const verificationGmail = verifyGmailJson.verification;
  console.log('✓ Verification created:', verificationGmail.id);
  console.log('  Token:', verificationGmail.verificationToken.slice(0, 16) + '...');
  console.log('  contactDomainFlag (expect true for gmail.com):', verificationGmail.contactDomainFlag);
  if (verificationGmail.contactDomainFlag !== true) {
    throw new Error('Expected contactDomainFlag to be true for gmail.com');
  }

  // 8. Public Verification Endpoint: GET /api/verify/:token
  console.log('\n--- Test 8: Public GET /api/verify/:token ---');
  const resGetToken = await fetch(`${API_BASE}/verify/${verificationGmail.verificationToken}`);
  const getTokenJson = await resGetToken.json();
  if (!resGetToken.ok) {
    throw new Error(`GET /api/verify/:token failed: ${JSON.stringify(getTokenJson)}`);
  }
  console.log('✓ Retrieved verification metadata:');
  console.log('  traineeFirstName (privacy-protected, first name only):', getTokenJson.traineeFirstName);
  console.log('  employerNameClaimed:', getTokenJson.employerNameClaimed);
  console.log('  courseContext:', getTokenJson.courseContext);
  console.log('  status:', getTokenJson.status);
  console.log('  contactDomainFlag:', getTokenJson.contactDomainFlag);

  if (getTokenJson.traineeFirstName !== 'Rohan') {
    throw new Error(`Expected first name 'Rohan', got '${getTokenJson.traineeFirstName}'`);
  }

  // 9. Public Verification Resolution: POST /api/verify/:token (DENIED without reasonCode -> 400)
  console.log('\n--- Test 9: Denial Validation (reasonCode required) ---');
  const resDenyNoReason = await fetch(`${API_BASE}/verify/${verificationGmail.verificationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'DENIED',
      verifiedByName: 'Ramesh Gupta, HR Lead',
    }),
  });
  console.log('Denial without reason code status (expect 400):', resDenyNoReason.status);
  if (resDenyNoReason.status !== 400) {
    throw new Error('Expected 400 when reasonCode is missing for DENIED decision');
  }

  // 10. Public Verification Resolution: POST /api/verify/:token (DENIED with SKILL_GAP)
  console.log('\n--- Test 10: Valid Denial with Reason Code ---');
  const resDenyValid = await fetch(`${API_BASE}/verify/${verificationGmail.verificationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'DENIED',
      reasonCode: 'SKILL_GAP',
      reasonNotes: 'Candidate demonstrated basic knowledge but was not hired due to missing cloud deployment skills.',
      verifiedByName: 'Ramesh Gupta, HR Lead',
    }),
  });
  const denyJson = await resDenyValid.json();
  if (!resDenyValid.ok) {
    throw new Error(`Failed to deny claim: ${JSON.stringify(denyJson)}`);
  }
  console.log('✓ Successfully resolved as DENIED:');
  console.log('  status:', denyJson.verification.status);
  console.log('  reasonCode:', denyJson.verification.reasonCode);
  console.log('  verifiedByName:', denyJson.verification.verifiedByName);

  // 11. Test Re-resolution of Resolved Token (expect 409)
  console.log('\n--- Test 11: Duplicate Resolution Rejection ---');
  const resDuplicate = await fetch(`${API_BASE}/verify/${verificationGmail.verificationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'CONFIRMED',
      verifiedByName: 'Another Person',
    }),
  });
  console.log('Duplicate resolution status (expect 409):', resDuplicate.status);
  if (resDuplicate.status !== 409) {
    throw new Error('Expected 409 when attempting to resolve an already-resolved verification');
  }

  // 12. Create a corporate email verification (e.g. hr@infosys.com -> contactDomainFlag = false) and CONFIRM it
  console.log('\n--- Test 12: Corporate Domain (infosys.com) & Confirmation ---');
  // Create another employed checkin to test confirmation
  const resEmployed2 = await fetch(`${API_BASE}/trainee/status-update`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      employmentStatus: 'EMPLOYED',
      employerName: 'Infosys Limited',
      wageBand: '20k+',
      roleRelevance: 'DIRECTLY_RELATED',
    }),
  });
  const checkin2 = (await resEmployed2.json()).checkIn;

  const resVerifyCorp = await fetch(`${API_BASE}/trainee/request-employer-verification`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      outcomeCheckInId: checkin2.id,
      employerContact: 'hr.operations@infosys.com',
    }),
  });
  const verifyCorpJson = await resVerifyCorp.json();
  const verificationCorp = verifyCorpJson.verification;
  console.log('  contactDomainFlag (expect false for infosys.com):', verificationCorp.contactDomainFlag);
  if (verificationCorp.contactDomainFlag !== false) {
    throw new Error('Expected contactDomainFlag to be false for infosys.com');
  }

  // Confirm verification
  const resConfirm = await fetch(`${API_BASE}/verify/${verificationCorp.verificationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'CONFIRMED',
      verifiedByName: 'Anita Deshmukh, Talent Acquisition Manager',
    }),
  });
  const confirmJson = await resConfirm.json();
  console.log('✓ Successfully resolved as CONFIRMED:', confirmJson.verification.status);
  console.log('  verifiedByName:', confirmJson.verification.verifiedByName);

  // 13. Verify Status History endpoint returns employerVerification
  console.log('\n--- Test 13: GET /api/trainee/status-history/:traineeId with Verifications ---');
  const resHistory = await fetch(`${API_BASE}/trainee/status-history/${trainee.id}`);
  const historyJson = await resHistory.json();
  if (!resHistory.ok) {
    throw new Error('Failed to fetch status history');
  }
  console.log('✓ History count:', historyJson.history.length);
  const withVerification = historyJson.history.filter((h) => h.employerVerification);
  console.log('✓ Records with attached employerVerification:', withVerification.length);
  if (withVerification.length < 2) {
    throw new Error('Expected at least 2 checkins with attached employerVerification');
  }

  console.log('\n=== ALL 13 TESTS PASSED SUCCESSFULLY! ===\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
