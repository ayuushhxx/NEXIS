const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.otpVerification.findFirst({ orderBy: { createdAt: 'desc' } })
  .then(record => {
    if (!record) return console.log("No OTP found");
    const targetHash = record.hashedOtp;
    for(let i = 100000; i < 999999; i++) {
        const hash = crypto.createHash('sha256').update(i.toString()).digest('hex');
        if (hash === targetHash) {
            console.log(i.toString());
            break;
        }
    }
  })
  .catch(console.error)
  .finally(() => prisma.$disconnect());
