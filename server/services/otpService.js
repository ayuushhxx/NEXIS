/**
 * FILE: server/services/otpService.js
 * PURPOSE: Service to handle generation, sending (via MSG91), and verification of SMS OTPs.
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';

// Fallback values for dev without MSG91
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

const OTP_EXPIRY_MINUTES = 5;

/**
 * Generates a 6-digit OTP, hashes it, stores it, and sends via MSG91.
 */
export async function sendOtp(phoneNumber) {
  // 1. Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // 2. Hash OTP
  const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

  // 3. Store in DB
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await prisma.otpVerification.create({
    data: {
      phoneNumber,
      hashedOtp,
      expiresAt,
    },
  });

  // 4. Send via MSG91
  if (MSG91_AUTH_KEY && MSG91_TEMPLATE_ID) {
    try {
      const sanitizedPhone = phoneNumber.replace('+', ''); // MSG91 usually expects numbers without +
      
      const response = await fetch(`https://control.msg91.com/api/v5/otp?template_id=${MSG91_TEMPLATE_ID}&mobile=${sanitizedPhone}&otp=${otp}`, {
        method: 'POST',
        headers: {
          'authkey': MSG91_AUTH_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      if (result.type === 'error') {
        console.error('[OTP Service] MSG91 error:', result);
        throw new Error(result.message || 'Failed to send OTP via MSG91');
      }
      console.log(`[OTP Service] Sent OTP to ${phoneNumber} via MSG91.`);
    } catch (err) {
      console.error('[OTP Service] Error calling MSG91:', err);
      throw new Error('Failed to deliver OTP message.');
    }
  } else {
    // Development fallback if keys aren't configured
    console.warn('\n=============================================');
    console.warn(`[OTP Service] STUB MODE - MSG91 Keys Missing`);
    console.warn(`[OTP Service] To: ${phoneNumber}`);
    console.warn(`[OTP Service] Code: ${otp}`);
    console.warn('=============================================\n');
  }

  return { success: true, message: 'OTP sent successfully' };
}

/**
 * Verifies a provided OTP for a phone number.
 */
export async function verifyOtp(phoneNumber, code) {
  const hashedInput = crypto.createHash('sha256').update(code).digest('hex');

  // Find the latest unexpired OTP for this number
  const record = await prisma.otpVerification.findFirst({
    where: {
      phoneNumber,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw new Error('No valid OTP found or OTP has expired. Please request a new one.');
  }

  if (record.verified) {
    throw new Error('This OTP has already been used.');
  }

  if (record.hashedOtp !== hashedInput) {
    throw new Error('Invalid OTP code.');
  }

  // Mark as verified
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { verified: true },
  });

  return { success: true };
}
