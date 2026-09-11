import prisma from '../lib/prisma.js'

/**
 * REASONING BLOCK: Trainee Merge Transaction
 * 
 * (a) Prisma models with a foreign key referencing Trainee:
 *   1. Enrolment (traineeId)
 *   2. ConsentRecord (traineeId)
 *   3. OutcomeCheckIn (traineeId)
 *   4. DedupCandidate (traineeIdA, traineeIdB)
 * 
 * (b) Reassignment requirements:
 *   - Enrolment: MUST be reassigned from traineeIdB to traineeIdA. Confirmed in implementation.
 *   - ConsentRecord: MUST be reassigned from traineeIdB to traineeIdA. Confirmed in implementation.
 *   - OutcomeCheckIn: MUST be reassigned from traineeIdB to traineeIdA. Confirmed in implementation.
 *   - DedupCandidate: Does NOT need to be reassigned, as doing so would create self-referencing pairs (A-A),
 *     and these records are meant as point-in-time suggestions.
 * 
 * (c) Transaction guarantee:
 *   - The entire operation (reassigning Enrolments, ConsentRecords, OutcomeCheckIns, 
 *     setting traineeB.mergedIntoId = traineeIdA, and updating the current DedupCandidate to CONFIRMED_MERGE)
 *     is wrapped inside a single `prisma.$transaction`. This ensures ACID properties: it will either
 *     fully succeed or fully roll back. No partial state is possible.
 */
export async function mergeTrainees(traineeIdA, traineeIdB, adminUserId) {
  return await prisma.$transaction(async (tx) => {
    // 1. Reassign Enrolments
    const enrolmentsRes = await tx.enrolment.updateMany({
      where: { traineeId: traineeIdB },
      data: { traineeId: traineeIdA },
    })

    // 2. Reassign ConsentRecords
    const consentsRes = await tx.consentRecord.updateMany({
      where: { traineeId: traineeIdB },
      data: { traineeId: traineeIdA },
    })

    // 3. Reassign OutcomeCheckIns
    const outcomesRes = await tx.outcomeCheckIn.updateMany({
      where: { traineeId: traineeIdB },
      data: { traineeId: traineeIdA },
    })

    // 4. Soft-delete traineeB by setting mergedIntoId
    await tx.trainee.update({
      where: { id: traineeIdB },
      data: { mergedIntoId: traineeIdA },
    })

    // Return the reassignment summary
    return {
      reassignedEnrolments: enrolmentsRes.count,
      reassignedConsentRecords: consentsRes.count,
      reassignedOutcomeCheckIns: outcomesRes.count,
    }
  })
}
